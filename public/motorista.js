"use strict";

// Página de teste do "app do motorista": faz login (CPF+senha), lista as
// viagens do motorista e, na viagem em_andamento escolhida, lê o GPS do
// celular (navigator.geolocation) e envia em lote para a API.
// Mesma origem que /api (servida pelo Express) → sem CORS.

(function () {
  var FLUSH_MS = 8000; // envia o buffer a cada 8s
  var MAX_BUFFER = 25; // ...ou antes, se acumular muitos pontos

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
  };

  // --- elementos ---
  function $(id) {
    return document.getElementById(id);
  }
  var views = {
    login: $("view-login"),
    viagens: $("view-viagens"),
    track: $("view-track"),
  };

  function show(view) {
    views.login.hidden = view !== "login";
    views.viagens.hidden = view !== "viagens";
    views.track.hidden = view !== "track";
  }

  function setConn(on) {
    $("conn-dot").classList.toggle("on", !!on);
  }

  function logLine(msg, kind) {
    var li = document.createElement("li");
    if (kind) li.className = kind;
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, "0");
    var mm = String(t.getMinutes()).padStart(2, "0");
    var ss = String(t.getSeconds()).padStart(2, "0");
    li.textContent = "[" + hh + ":" + mm + ":" + ss + "] " + msg;
    var log = $("log");
    log.insertBefore(li, log.firstChild);
  }

  // --- token storage (sobrevive a refresh da página) ---
  function saveTokens(at, rt) {
    state.accessToken = at;
    state.refreshToken = rt;
    try {
      localStorage.setItem("mot_at", at);
      localStorage.setItem("mot_rt", rt);
    } catch (e) {}
  }
  function loadTokens() {
    try {
      state.accessToken = localStorage.getItem("mot_at");
      state.refreshToken = localStorage.getItem("mot_rt");
    } catch (e) {}
  }
  function clearTokens() {
    state.accessToken = null;
    state.refreshToken = null;
    try {
      localStorage.removeItem("mot_at");
      localStorage.removeItem("mot_rt");
    } catch (e) {}
  }

  // --- API helper com refresh automático (1x) em 401 ---
  function apiFetch(path, options, _retry) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (state.accessToken) headers["Authorization"] = "Bearer " + state.accessToken;
    if (options.body) headers["Content-Type"] = "application/json";
    // Evita a página de aviso do ngrok grátis em requisições XHR (no-op fora do ngrok).
    headers["ngrok-skip-browser-warning"] = "true";

    return fetch(path, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (res.status === 401 && state.refreshToken && !_retry) {
        return fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: state.refreshToken }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error("sessao_expirada");
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
        return j.error || j.message || "Erro " + res.status;
      })
      .catch(function () {
        return "Erro " + res.status;
      });
  }

  // ---------------------------------------------------------------
  // LOGIN
  // ---------------------------------------------------------------
  function doLogin() {
    var cpf = $("cpf").value.trim();
    var senha = $("senha").value;
    var erro = $("login-erro");
    erro.hidden = true;
    if (!cpf || !senha) {
      erro.textContent = "Informe CPF e senha.";
      erro.hidden = false;
      return;
    }
    var btn = $("btn-login");
    btn.disabled = true;
    btn.textContent = "Entrando...";

    apiFetch("/api/auth/motorista/login", {
      method: "POST",
      body: JSON.stringify({ cpf: cpf, senha: senha }),
    })
      .then(function (res) {
        if (!res.ok) return readError(res).then(function (m) { throw new Error(m); });
        return res.json();
      })
      .then(function (data) {
        saveTokens(data.accessToken, data.refreshToken);
        $("senha").value = "";
        loadViagens();
      })
      .catch(function (e) {
        erro.textContent = e.message || "Falha no login.";
        erro.hidden = false;
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = "Entrar";
      });
  }

  // ---------------------------------------------------------------
  // VIAGENS
  // ---------------------------------------------------------------
  function loadViagens() {
    apiFetch("/api/app/viagens")
      .then(function (res) {
        if (res.status === 401 || res.status === 403) {
          clearTokens();
          show("login");
          throw new Error("faça login");
        }
        if (!res.ok) return readError(res).then(function (m) { throw new Error(m); });
        return res.json();
      })
      .then(function (viagens) {
        renderViagens(viagens || []);
        show("viagens");
      })
      .catch(function (e) {
        logLine(e.message, "err");
      });
  }

  function renderViagens(viagens) {
    var ul = $("lista-viagens");
    ul.innerHTML = "";
    $("viagens-vazio").hidden = viagens.length > 0;

    viagens.forEach(function (v) {
      var li = document.createElement("li");
      var emAndamento = v.status === "em_andamento";

      var placa = document.createElement("div");
      placa.className = "placa";
      placa.textContent = v.veiculo_placa || "(sem placa)";

      var badge = document.createElement("span");
      badge.className = "badge " + (emAndamento ? "em_andamento" : "outro");
      badge.textContent = v.status;
      placa.appendChild(document.createTextNode(" "));
      placa.appendChild(badge);

      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent =
        v.paradas_count + " parada(s) · " +
        (v.iniciada_em ? "iniciada " + new Date(v.iniciada_em).toLocaleString("pt-BR") : "não iniciada");

      li.appendChild(placa);
      li.appendChild(meta);

      if (emAndamento) {
        li.addEventListener("click", function () {
          selecionarViagem(v);
        });
      } else {
        li.style.opacity = "0.55";
        li.title = "Só viagens em_andamento aceitam GPS";
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
    $("track-titulo").textContent = "Viagem · " + (v.veiculo_placa || "");
    $("m-enviadas").textContent = "0";
    $("m-buffer").textContent = "0";
    $("m-alertas").textContent = "0";
    $("m-precisao").textContent = "—";
    $("m-coords").textContent = "Sem posição ainda";
    $("log").innerHTML = "";
    setTrackingUI(false);
    show("track");
  }

  function setTrackingUI(on) {
    var st = $("track-status");
    st.textContent = on ? "Rastreando…" : "Parado";
    st.classList.toggle("tracking", on);
    $("btn-start").hidden = on;
    $("btn-stop").hidden = !on;
    setConn(on);
  }

  function startTracking() {
    var erro = $("track-erro");
    erro.hidden = true;
    if (!("geolocation" in navigator)) {
      erro.textContent = "Este navegador não expõe geolocalização.";
      erro.hidden = false;
      return;
    }

    state.watchId = navigator.geolocation.watchPosition(
      onPosition,
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    state.flushTimer = setInterval(flush, FLUSH_MS);
    setTrackingUI(true);
    logLine("rastreio iniciado", "ok");
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
    setTrackingUI(false);
    flush(); // envia o que sobrou
    logLine("rastreio parado", "ok");
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

    state.buffer.push(ponto);
    $("m-buffer").textContent = String(state.buffer.length);
    $("m-coords").textContent = ponto.lat.toFixed(6) + ", " + ponto.lng.toFixed(6);
    $("m-precisao").textContent = ponto.precisao_m != null ? ponto.precisao_m + " m" : "—";

    if (state.buffer.length >= MAX_BUFFER) flush();
  }

  function onGeoError(err) {
    var msgs = {
      1: "Permissão de localização negada. Autorize o acesso ao GPS.",
      2: "Posição indisponível (sem sinal de GPS).",
      3: "Tempo esgotado ao obter posição.",
    };
    var erro = $("track-erro");
    erro.textContent = msgs[err.code] || err.message;
    erro.hidden = false;
    logLine("geo erro: " + (msgs[err.code] || err.message), "err");
  }

  function flush() {
    if (state.flushing || state.buffer.length === 0 || !state.viagem) return;
    state.flushing = true;

    var lote = state.buffer.splice(0, state.buffer.length);
    $("m-buffer").textContent = "0";

    apiFetch("/api/app/viagens/" + state.viagem.id + "/posicoes", {
      method: "POST",
      body: JSON.stringify({ posicoes: lote }),
    })
      .then(function (res) {
        if (!res.ok) {
          return readError(res).then(function (m) { throw new Error(m); });
        }
        return res.json();
      })
      .then(function (r) {
        state.enviadas += r.inseridas || lote.length;
        state.alertas += (r.alertas && r.alertas.length) || 0;
        $("m-enviadas").textContent = String(state.enviadas);
        $("m-alertas").textContent = String(state.alertas);
        var extra = r.alertas && r.alertas.length
          ? " · " + r.alertas.length + " alerta(s): " + r.alertas.map(function (a) { return a.tipo; }).join(", ")
          : "";
        logLine("enviadas " + lote.length + " posição(ões)" + extra, "ok");
      })
      .catch(function (e) {
        // devolve o lote ao buffer para tentar de novo no próximo flush
        state.buffer = lote.concat(state.buffer);
        $("m-buffer").textContent = String(state.buffer.length);
        logLine("falha ao enviar: " + e.message, "err");
      })
      .finally(function () {
        state.flushing = false;
      });
  }

  function sair() {
    if (state.watchId != null) stopTracking();
    clearTokens();
    show("login");
  }

  // ---------------------------------------------------------------
  // wiring
  // ---------------------------------------------------------------
  $("btn-login").addEventListener("click", doLogin);
  $("senha").addEventListener("keydown", function (e) {
    if (e.key === "Enter") doLogin();
  });
  $("btn-reload").addEventListener("click", loadViagens);
  $("btn-sair").addEventListener("click", sair);
  $("btn-voltar").addEventListener("click", function () {
    if (state.watchId != null) stopTracking();
    loadViagens();
  });
  $("btn-start").addEventListener("click", startTracking);
  $("btn-stop").addEventListener("click", stopTracking);

  // avisa se o usuário sair com rastreio ligado
  window.addEventListener("beforeunload", function (e) {
    if (state.watchId != null) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // boot: se já houver token salvo, tenta ir direto para as viagens
  loadTokens();
  if (state.accessToken) {
    loadViagens();
  } else {
    show("login");
  }
})();
