'use strict';

// Página de teste do "app do motorista": faz login (CPF+senha), lista as
// viagens do motorista e, na viagem em_andamento escolhida, lê o GPS do
// celular (navigator.geolocation) e envia em lote para a API.
// Mesma origem que /api (servida pelo Express) → sem CORS.

(function () {
  var FLUSH_MS = 8000; // envia o buffer a cada 8s
  var MAX_BUFFER = 25; // ...ou antes, se acumular muitos pontos
  var BUF_KEY = 'mot_buf'; // buffer pendente persistido (sobrevive a fechar a aba)
  var MIN_DIST_M = 15; // economia de bateria: descarta ponto muito perto...
  var MIN_INTERVALO_MS = 5000; // ...E muito recente em relação ao anterior

  // Status da viagem → rótulo legível pro motorista.
  var STATUS_LABEL = {
    em_andamento: 'Em andamento',
    encerrada: 'Encerrada',
    cancelada: 'Cancelada',
  };

  var state = {
    accessToken: null,
    refreshToken: null,
    viagem: null, // viagem selecionada
    watchId: null,
    buffer: [], // posições aguardando envio
    flushTimer: null,
    enviadas: 0,
    alertas: 0,
    flushing: false,
    wakeLock: null, // sentinela do Wake Lock (tela ligada)
    sessaoExpirada: false, // true = parar de enviar e pedir re-login
    ultimoPonto: null, // último ponto ACEITO (filtro de economia)
  };

  // Distância aproximada em metros entre dois pontos (haversine).
  function distanciaM(a, b) {
    var R = 6371000;
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(a.lat * rad) * Math.cos(b.lat * rad);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // --- elementos ---
  function $(id) {
    return document.getElementById(id);
  }
  var views = {
    login: $('view-login'),
    viagens: $('view-viagens'),
    track: $('view-track'),
  };

  function show(view) {
    views.login.hidden = view !== 'login';
    views.viagens.hidden = view !== 'viagens';
    views.track.hidden = view !== 'track';
  }

  function setConn(on) {
    $('conn-dot').classList.toggle('on', !!on);
  }

  function logLine(msg, kind) {
    var li = document.createElement('li');
    if (kind) li.className = kind;
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, '0');
    var mm = String(t.getMinutes()).padStart(2, '0');
    var ss = String(t.getSeconds()).padStart(2, '0');
    li.textContent = '[' + hh + ':' + mm + ':' + ss + '] ' + msg;
    var log = $('log');
    log.insertBefore(li, log.firstChild);
  }

  // --- token storage (sobrevive a refresh da página) ---
  function saveTokens(at, rt) {
    state.accessToken = at;
    state.refreshToken = rt;
    try {
      localStorage.setItem('mot_at', at);
      localStorage.setItem('mot_rt', rt);
    } catch {
      /* localStorage pode falhar (modo privado/quota) — seguir sem persistir */
    }
  }
  function loadTokens() {
    try {
      state.accessToken = localStorage.getItem('mot_at');
      state.refreshToken = localStorage.getItem('mot_rt');
    } catch {
      /* localStorage pode falhar (modo privado/quota) — seguir sem persistir */
    }
  }
  function clearTokens() {
    state.accessToken = null;
    state.refreshToken = null;
    try {
      localStorage.removeItem('mot_at');
      localStorage.removeItem('mot_rt');
    } catch {
      /* localStorage pode falhar (modo privado/quota) — seguir sem persistir */
    }
  }

  // --- buffer persistido: pontos não enviados sobrevivem a fechar/matar a aba ---
  function saveBuffer() {
    try {
      if (state.viagem && state.buffer.length > 0) {
        localStorage.setItem(
          BUF_KEY,
          JSON.stringify({ viagemId: state.viagem.id, pontos: state.buffer }),
        );
      } else {
        localStorage.removeItem(BUF_KEY);
      }
    } catch {
      /* localStorage pode falhar — seguir sem persistir */
    }
  }
  function loadBufferSalvo() {
    try {
      var raw = localStorage.getItem(BUF_KEY);
      var salvo = raw ? JSON.parse(raw) : null;
      return salvo && salvo.viagemId && Array.isArray(salvo.pontos) && salvo.pontos.length > 0
        ? salvo
        : null;
    } catch {
      return null;
    }
  }

  // --- Wake Lock: mantém a tela ligada enquanto rastreia ---
  function pedirWakeLock() {
    if (!('wakeLock' in navigator)) {
      $('wake-aviso').hidden = false; // navegador sem Wake Lock → orienta o motorista
      return;
    }
    navigator.wakeLock
      .request('screen')
      .then(function (wl) {
        state.wakeLock = wl;
        $('wake-aviso').hidden = true;
        wl.addEventListener('release', function () {
          state.wakeLock = null; // re-adquirido no próximo visibilitychange
        });
      })
      .catch(function () {
        $('wake-aviso').hidden = false; // negado (ex.: economia de bateria)
      });
  }
  function soltarWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release().catch(function () {
        /* já liberado */
      });
      state.wakeLock = null;
    }
    $('wake-aviso').hidden = true;
  }

  // --- API helper com refresh automático (1x) em 401 ---
  function apiFetch(path, options, _retry) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (state.accessToken) headers['Authorization'] = 'Bearer ' + state.accessToken;
    if (options.body) headers['Content-Type'] = 'application/json';
    // Evita a página de aviso do ngrok grátis em requisições XHR (no-op fora do ngrok).
    headers['ngrok-skip-browser-warning'] = 'true';

    return fetch(path, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (res.status === 401 && state.refreshToken && !_retry) {
        return fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error('sessao_expirada');
            return r.json();
          })
          .then(function (data) {
            saveTokens(data.accessToken, data.refreshToken || state.refreshToken);
            return apiFetch(path, options, true);
          });
      }
      return res;
    });
  }

  function readError(res) {
    return res
      .json()
      .then(function (j) {
        return j.error || j.message || 'Erro ' + res.status;
      })
      .catch(function () {
        return 'Erro ' + res.status;
      });
  }

  // ---------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------
  function doLogin() {
    var cpf = $('cpf').value.trim();
    var senha = $('senha').value;
    var erro = $('login-erro');
    erro.hidden = true;
    if (!cpf || !senha) {
      erro.textContent = 'Informe CPF e senha.';
      erro.hidden = false;
      return;
    }
    var btn = $('btn-login');
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    apiFetch('/api/auth/motorista/login', {
      method: 'POST',
      body: JSON.stringify({ cpf: cpf, senha: senha }),
    })
      .then(function (res) {
        if (!res.ok)
          return readError(res).then(function (m) {
            throw new Error(m);
          });
        return res.json();
      })
      .then(function (data) {
        saveTokens(data.accessToken, data.refreshToken);
        $('senha').value = '';
        // Se a sessão expirou no meio do rastreio, volta direto pra viagem
        // (o buffer foi preservado) e retoma o envio.
        if (state.sessaoExpirada && state.viagem) {
          state.sessaoExpirada = false;
          setTrackingUI(state.watchId != null);
          show('track');
          logLine('sessão renovada — retomando envio', 'ok');
          flush();
          return;
        }
        loadViagens();
      })
      .catch(function (e) {
        erro.textContent = e.message || 'Falha no login.';
        erro.hidden = false;
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      });
  }

  // ---------------------------------------------------------------
  // VIAGENS
  // ---------------------------------------------------------------
  function loadViagens() {
    apiFetch('/api/app/viagens')
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          clearTokens();
          show('login');
          throw new Error('faça login');
        }
        if (!res.ok)
          return readError(res).then(function (m) {
            throw new Error(m);
          });
        return res.json();
      })
      .then(function (viagens) {
        viagens = viagens || [];
        // Havia pontos pendentes de uma viagem em andamento? Volta direto
        // pra ela e envia o que ficou pra trás (aba fechada/morta).
        var salvo = loadBufferSalvo();
        if (salvo) {
          var pendente = viagens.find(function (v) {
            return v.id === salvo.viagemId && v.status === 'em_andamento';
          });
          if (pendente) {
            selecionarViagem(pendente);
            return;
          }
        }
        renderViagens(viagens);
        show('viagens');
      })
      .catch(function (e) {
        logLine(e.message, 'err');
      });
  }

  function renderViagens(viagens) {
    var ul = $('lista-viagens');
    ul.innerHTML = '';
    $('viagens-vazio').hidden = viagens.length > 0;

    viagens.forEach(function (v) {
      var li = document.createElement('li');
      var emAndamento = v.status === 'em_andamento';

      var placa = document.createElement('div');
      placa.className = 'placa';
      placa.textContent = v.veiculo_placa || '(sem placa)';

      var badge = document.createElement('span');
      badge.className = 'badge ' + (emAndamento ? 'em_andamento' : 'outro');
      badge.textContent = STATUS_LABEL[v.status] || v.status;
      placa.appendChild(document.createTextNode(' '));
      placa.appendChild(badge);

      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent =
        v.paradas_count +
        ' parada(s) · ' +
        (v.iniciada_em
          ? 'iniciada ' + new Date(v.iniciada_em).toLocaleString('pt-BR')
          : 'não iniciada');

      li.appendChild(placa);
      li.appendChild(meta);

      if (emAndamento) {
        li.addEventListener('click', function () {
          selecionarViagem(v);
        });
      } else {
        li.style.opacity = '0.55';
        li.title = 'Só viagens em andamento aceitam GPS';
      }
      ul.appendChild(li);
    });
  }

  // ---------------------------------------------------------------
  // RASTREIO
  // ---------------------------------------------------------------
  function selecionarViagem(v) {
    state.viagem = v;
    state.enviadas = 0;
    state.alertas = 0;
    state.buffer = [];
    state.sessaoExpirada = false;
    state.ultimoPonto = null;
    $('track-titulo').textContent = 'Viagem · ' + (v.veiculo_placa || '');
    $('m-enviadas').textContent = '0';
    $('m-buffer').textContent = '0';
    $('m-alertas').textContent = '0';
    $('m-precisao').textContent = '—';
    $('m-coords').textContent = 'Sem posição ainda';
    $('log').innerHTML = '';
    setTrackingUI(false);

    // Recupera pontos pendentes desta viagem (aba fechada antes de enviar).
    var salvo = loadBufferSalvo();
    if (salvo && salvo.viagemId === v.id) {
      state.buffer = salvo.pontos;
      $('m-buffer').textContent = String(state.buffer.length);
      logLine('recuperados ' + state.buffer.length + ' ponto(s) pendente(s)', 'ok');
      flush();
    }
    show('track');
  }

  function setTrackingUI(on) {
    var st = $('track-status');
    st.textContent = on ? 'Rastreando…' : 'Parado';
    st.classList.toggle('tracking', on);
    st.classList.remove('expirada');
    $('btn-start').hidden = on;
    $('btn-stop').hidden = !on;
    setConn(on);
  }

  // Sessão expirada NÃO pode ficar silenciosa: status vermelho + toque leva
  // ao re-login (o buffer e a viagem ficam preservados).
  function marcarSessaoExpirada() {
    if (state.sessaoExpirada) return;
    state.sessaoExpirada = true;
    var st = $('track-status');
    st.textContent = 'Sessão expirada — toque para entrar de novo';
    st.classList.remove('tracking');
    st.classList.add('expirada');
    setConn(false);
    logLine('sessão expirada — faça login de novo pra retomar o envio', 'err');
  }

  function startTracking() {
    var erro = $('track-erro');
    erro.hidden = true;
    if (!('geolocation' in navigator)) {
      erro.textContent = 'Este navegador não expõe geolocalização.';
      erro.hidden = false;
      return;
    }

    state.watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
      enableHighAccuracy: true,
      maximumAge: 3000, // aceita posição recém-calculada (economia de bateria)
      timeout: 20000,
    });
    state.flushTimer = setInterval(flush, FLUSH_MS);
    pedirWakeLock(); // mantém a tela ligada durante o rastreio
    setTrackingUI(true);
    logLine('rastreio iniciado', 'ok');
  }

  function stopTracking() {
    if (state.watchId != null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    if (state.flushTimer) {
      clearInterval(state.flushTimer);
      state.flushTimer = null;
    }
    soltarWakeLock();
    setTrackingUI(false);
    flush(); // envia o que sobrou
    logLine('rastreio parado', 'ok');
  }

  function onPosition(pos) {
    var c = pos.coords;
    var ponto = {
      lat: c.latitude,
      lng: c.longitude,
      registrado_em: new Date(pos.timestamp).toISOString(),
    };
    if (c.speed != null && c.speed >= 0) {
      // m/s -> km/h, limitado ao máximo aceito pelo schema (999)
      ponto.velocidade_kmh = Math.min(999, Math.round(c.speed * 3.6 * 10) / 10);
    }
    if (c.accuracy != null && c.accuracy >= 0) {
      ponto.precisao_m = Math.round(c.accuracy * 10) / 10;
    }

    // Atualiza a telinha mesmo quando o ponto não entra no buffer.
    $('m-coords').textContent = ponto.lat.toFixed(6) + ', ' + ponto.lng.toFixed(6);
    $('m-precisao').textContent = ponto.precisao_m != null ? ponto.precisao_m + ' m' : '—';

    // Economia de bateria/dados: parado no mesmo lugar, um ponto a cada 5s basta.
    if (state.ultimoPonto) {
      var dt = pos.timestamp - state.ultimoPonto.time;
      var dist = distanciaM(ponto, state.ultimoPonto);
      if (dist < MIN_DIST_M && dt < MIN_INTERVALO_MS) return;
    }
    state.ultimoPonto = { lat: ponto.lat, lng: ponto.lng, time: pos.timestamp };

    state.buffer.push(ponto);
    saveBuffer();
    $('m-buffer').textContent = String(state.buffer.length);

    if (state.buffer.length >= MAX_BUFFER) flush();
  }

  function onGeoError(err) {
    var msgs = {
      1: 'Permissão de localização negada. Autorize o acesso ao GPS.',
      2: 'Posição indisponível (sem sinal de GPS).',
      3: 'Tempo esgotado ao obter posição.',
    };
    var erro = $('track-erro');
    erro.textContent = msgs[err.code] || err.message;
    erro.hidden = false;
    logLine('geo erro: ' + (msgs[err.code] || err.message), 'err');
  }

  function flush() {
    if (state.flushing || state.buffer.length === 0 || !state.viagem) return;
    if (state.sessaoExpirada) return; // sem sessão não adianta tentar; buffer preservado
    state.flushing = true;

    var lote = state.buffer.splice(0, state.buffer.length);
    $('m-buffer').textContent = '0';

    apiFetch('/api/app/viagens/' + state.viagem.id + '/posicoes', {
      method: 'POST',
      body: JSON.stringify({ posicoes: lote }),
    })
      .then(function (res) {
        // 401 aqui = o refresh automático do apiFetch também falhou.
        if (res.status === 401 || res.status === 403) throw new Error('sessao_expirada');
        if (!res.ok) {
          return readError(res).then(function (m) {
            throw new Error(m);
          });
        }
        return res.json();
      })
      .then(function (r) {
        saveBuffer(); // lote saiu do buffer de verdade → atualiza o persistido
        state.enviadas += r.inseridas || lote.length;
        state.alertas += (r.alertas && r.alertas.length) || 0;
        $('m-enviadas').textContent = String(state.enviadas);
        $('m-alertas').textContent = String(state.alertas);
        var extra =
          r.alertas && r.alertas.length
            ? ' · ' +
              r.alertas.length +
              ' alerta(s): ' +
              r.alertas
                .map(function (a) {
                  return a.tipo;
                })
                .join(', ')
            : '';
        if (r.descartadas) extra += ' · ' + r.descartadas + ' descartada(s) (GPS ruim)';
        logLine('enviadas ' + lote.length + ' posição(ões)' + extra, 'ok');
      })
      .catch(function (e) {
        // devolve o lote ao buffer para tentar de novo no próximo flush
        state.buffer = lote.concat(state.buffer);
        saveBuffer();
        $('m-buffer').textContent = String(state.buffer.length);
        if (e.message === 'sessao_expirada') {
          marcarSessaoExpirada();
        } else {
          logLine('falha ao enviar: ' + e.message, 'err');
        }
      })
      .finally(function () {
        state.flushing = false;
      });
  }

  // Flush final "de emergência": a página está fechando/sumindo e fetch se
  // perderia no meio do caminho — sendBeacon garante a entrega do lote.
  // (sendBeacon não envia header Authorization → token vai na query.)
  function flushBeacon() {
    if (!state.viagem || state.buffer.length === 0) return;
    if (!state.accessToken || state.sessaoExpirada) return;
    if (!navigator.sendBeacon) return;
    var url =
      '/api/app/posicoes-beacon?token=' +
      encodeURIComponent(state.accessToken) +
      '&viagem=' +
      encodeURIComponent(state.viagem.id);
    var corpo = new Blob([JSON.stringify({ posicoes: state.buffer })], {
      type: 'application/json',
    });
    if (navigator.sendBeacon(url, corpo)) {
      // Lote aceito pela fila do navegador (entrega mesmo com a aba fechada).
      state.buffer = [];
      saveBuffer();
      $('m-buffer').textContent = '0';
    }
  }

  function sair() {
    if (state.watchId != null) stopTracking();
    clearTokens();
    show('login');
  }

  // ---------------------------------------------------------------
  // wiring
  // ---------------------------------------------------------------
  $('btn-login').addEventListener('click', doLogin);
  $('senha').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });
  $('btn-reload').addEventListener('click', loadViagens);
  $('btn-sair').addEventListener('click', sair);
  $('btn-voltar').addEventListener('click', function () {
    if (state.watchId != null) stopTracking();
    loadViagens();
  });
  $('btn-start').addEventListener('click', startTracking);
  $('btn-stop').addEventListener('click', stopTracking);

  // Sessão expirada: toque no status leva ao re-login (buffer preservado).
  $('track-status').addEventListener('click', function () {
    if (state.sessaoExpirada) show('login');
  });

  // Página fechando/perdendo o foco: garante o lote via sendBeacon e avisa
  // se o usuário sair com rastreio ligado.
  window.addEventListener('beforeunload', function (e) {
    flushBeacon();
    if (state.watchId != null) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  window.addEventListener('pagehide', flushBeacon);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flushBeacon(); // a aba pode ser morta sem beforeunload (Android)
    } else if (state.watchId != null && !state.wakeLock) {
      pedirWakeLock(); // o Wake Lock é liberado quando a aba sai de cena
    }
  });

  // boot: se já houver token salvo, tenta ir direto para as viagens
  loadTokens();
  if (state.accessToken) {
    loadViagens();
  } else {
    show('login');
  }
})();
