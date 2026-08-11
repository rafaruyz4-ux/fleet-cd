import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { ApiError, enviarPosicoes } from './api';
import {
  anexarPontos,
  getFila,
  getStats,
  limparFila,
  limparViagemCache,
  removerPontosEnviados,
  setStats,
  type PosicaoPendente,
  type StatsRastreio,
} from './storage';

/**
 * Coleta de GPS da viagem. Liga junto com o "Iniciar viagem" e desliga sozinha
 * quando a viagem é encerrada no sistema — o motorista não gerencia isso.
 * No Android roda como foreground service (funciona com a tela bloqueada);
 * os pontos caem numa fila local e sobem em lote — sem internet (estrada),
 * a fila segura e envia quando o sinal volta.
 */

export const TASK_GPS = 'vetra-rastreio-gps';

/** Envia quando juntar este tanto de pontos… */
const LOTE_PONTOS = 25;
/** …ou quando passar este tempo desde o último envio (ms). */
const LOTE_INTERVALO_MS = 8000;
/** Máximo por requisição (o backend aceita até 1000). */
const LOTE_MAX_REQ = 500;
/** Fôlego entre lotes seguidos — sem despejar rajada num servidor recém-voltado. */
const PAUSA_ENTRE_LOTES_MS = 400;
/** Backoff após falha de envio: 8s → 16s → 32s → … até o teto de 3 min. */
const BACKOFF_BASE_MS = 8000;
const BACKOFF_TETO_MS = 180000;

let ultimoEnvioMs = 0;
let enviando = false;
// Falhas seguidas de envio: cada uma dobra a espera até a próxima tentativa.
let falhasSeguidas = 0;
let proximaTentativaMs = 0;
// Coleta em 1º plano: usada no preview web e no modo degradado (motorista
// negou a permissão "o tempo todo" mas permitiu "durante o uso").
let subPrimeiroPlano: Location.LocationSubscription | null = null;

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function agendarBackoff(): void {
  falhasSeguidas += 1;
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (falhasSeguidas - 1), BACKOFF_TETO_MS);
  // Jitter de ±20%: os celulares da frota não voltam todos no mesmo segundo.
  proximaTentativaMs = Date.now() + Math.round(base * (0.8 + Math.random() * 0.4));
}

function zerarBackoff(): void {
  falhasSeguidas = 0;
  proximaTentativaMs = 0;
}

function paraPendente(loc: Location.LocationObject): PosicaoPendente {
  const veloc = loc.coords.speed;
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    // speed vem em m/s e pode vir -1/null quando o GPS ainda não sabe.
    ...(veloc != null && veloc >= 0 ? { velocidade_kmh: Math.min(999, veloc * 3.6) } : {}),
    ...(loc.coords.accuracy != null ? { precisao_m: loc.coords.accuracy } : {}),
    registrado_em: new Date(loc.timestamp).toISOString(),
  };
}

/** Desliga só a coleta (sem tentar enviar a fila). */
async function pararColeta(): Promise<void> {
  if (subPrimeiroPlano) {
    subPrimeiroPlano.remove();
    subPrimeiroPlano = null;
  }
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK_GPS)) {
      await Location.stopLocationUpdatesAsync(TASK_GPS);
    }
  } catch {
    /* web/preview não tem a tarefa */
  }
}

/** Tenta esvaziar a fila. Silencioso: erro só é registrado nas estatísticas. */
export async function enviarFila(forcar = false): Promise<void> {
  if (enviando) return;
  enviando = true;
  try {
    const statsAntes = await getStats();
    // Sessão vencida ou viagem encerrada: não adianta martelar o servidor.
    // (No login novo o flag cai e o envio retoma sozinho, com a fila intacta.)
    if (statsAntes.sessaoExpirada || statsAntes.viagemEncerrada) return;
    const agora = Date.now();
    if (!forcar && agora < proximaTentativaMs) return; // aguardando o backoff
    let fila = await getFila();
    if (fila.length === 0) return;
    if (!forcar && fila.length < LOTE_PONTOS && agora - ultimoEnvioMs < LOTE_INTERVALO_MS) return;

    // Cada volta RELÊ o storage e a remoção pós-envio é por identidade —
    // ponto que chega durante o POST não é sobrescrito nem perdido.
    while (true) {
      fila = await getFila();
      if (fila.length === 0) break;
      const lote = fila.slice(0, LOTE_MAX_REQ);
      const resultado = await enviarPosicoes(lote);
      await removerPontosEnviados(lote);
      ultimoEnvioMs = Date.now();
      zerarBackoff();
      const stats = await getStats();
      await setStats({
        ...stats,
        enviadas: stats.enviadas + resultado.inseridas,
        ultimoEnvio: new Date().toISOString(),
        ultimoErro: null,
      });
      if (fila.length <= lote.length) break;
      await pausa(PAUSA_ENTRE_LOTES_MS); // fôlego entre lotes
    }
  } catch (e) {
    await tratarFalhaDeEnvio(e);
  } finally {
    enviando = false;
  }
}

async function tratarFalhaDeEnvio(e: unknown): Promise<void> {
  const stats = await getStats();
  if (e instanceof ApiError && e.status === 401) {
    // Sessão vencida de verdade (o api.ts já tentou o refresh). A coleta
    // continua e a fila fica PRESERVADA; o envio retoma após novo login.
    await setStats({ ...stats, sessaoExpirada: true, ultimoErro: null });
    return;
  }
  if (e instanceof ApiError && e.status === 404) {
    await tratarViagemEncerrada(stats);
    return;
  }
  agendarBackoff();
  const mensagem = e instanceof ApiError ? e.message : 'Sem conexão — pontos guardados na fila';
  await setStats({ ...stats, ultimoErro: mensagem });
}

/**
 * 404 no envio = a central encerrou a viagem. Antes de desistir, tenta UM
 * último envio (pode ter sido um tropeço passageiro do servidor); se o 404
 * confirmar, para a coleta e limpa a fila — o backend não aceita mais pontos.
 */
async function tratarViagemEncerrada(stats: StatsRastreio): Promise<void> {
  try {
    await pausa(1500);
    const fila = await getFila();
    if (fila.length > 0) {
      const lote = fila.slice(0, LOTE_MAX_REQ);
      const resultado = await enviarPosicoes(lote);
      await removerPontosEnviados(lote);
      await setStats({
        ...stats,
        enviadas: stats.enviadas + resultado.inseridas,
        ultimoEnvio: new Date().toISOString(),
        ultimoErro: null,
      });
      return; // era passageiro — o próximo ciclo segue o envio normal
    }
  } catch (e2) {
    if (!(e2 instanceof ApiError && e2.status === 404)) {
      // A retentativa falhou por OUTRO motivo (ex.: caiu a internet):
      // trata como falha comum e deixa o backoff cuidar.
      agendarBackoff();
      await setStats({ ...stats, ultimoErro: 'Sem conexão — pontos guardados na fila' });
      return;
    }
  }
  await pararColeta();
  await limparFila();
  await limparViagemCache();
  await setStats({ ...stats, viagemEncerrada: true, ultimoErro: null });
}

async function receberLocalizacoes(locations: Location.LocationObject[]): Promise<void> {
  if (!locations?.length) return;
  await anexarPontos(locations.map(paraPendente));
  // "Último ponto" ≠ "último envio": a tela usa os dois para diferenciar
  // "sem GPS" (não coleta) de "sem internet" (coleta mas não sobe).
  const stats = await getStats();
  const maisRecente = Math.max(...locations.map((l) => l.timestamp));
  await setStats({ ...stats, ultimoPonto: new Date(maisRecente).toISOString() });
  await enviarFila();
}

// No modo web (usado só para prints/preview no PC) não existe tarefa em 2º
// plano — registrar quebraria o arranque, então só registramos no nativo.
if (Platform.OS !== 'web')
TaskManager.defineTask(TASK_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  await receberLocalizacoes(locations);
});

export type ResultadoPermissao = 'ok' | 'sem_permissao' | 'sem_segundo_plano';

/** Pede as permissões na ordem exigida pelo Android (1º em uso, 2º sempre). */
export async function pedirPermissoes(): Promise<ResultadoPermissao> {
  const emUso = await Location.requestForegroundPermissionsAsync();
  if (!emUso.granted) return 'sem_permissao';
  if (Platform.OS === 'web') return 'ok';
  const sempre = await Location.requestBackgroundPermissionsAsync();
  if (!sempre.granted) return 'sem_segundo_plano';
  return 'ok';
}

/** Só CONSULTA (sem abrir diálogo) — usado ao retomar viagem após reboot. */
export async function verificarPermissoes(): Promise<ResultadoPermissao> {
  const emUso = await Location.getForegroundPermissionsAsync();
  if (!emUso.granted) return 'sem_permissao';
  if (Platform.OS === 'web') return 'ok';
  const sempre = await Location.getBackgroundPermissionsAsync();
  if (!sempre.granted) return 'sem_segundo_plano';
  return 'ok';
}

export async function rastreioLigado(): Promise<boolean> {
  if (subPrimeiroPlano) return true;
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
  } catch {
    return false;
  }
}

export type ModoColeta = 'completo' | 'primeiro_plano';

export async function iniciarRastreio(modo: ModoColeta = 'completo'): Promise<void> {
  if (Platform.OS === 'web') modo = 'primeiro_plano';
  if (modo === 'completo' && subPrimeiroPlano) {
    // Upgrade: o motorista deu a permissão "o tempo todo" no meio da viagem —
    // troca a coleta de 1º plano pela tarefa de verdade.
    subPrimeiroPlano.remove();
    subPrimeiroPlano = null;
  }
  if (await rastreioLigado()) return;
  if (modo === 'primeiro_plano') {
    // Modo degradado: sem a permissão "o tempo todo" (ou no preview web),
    // coleta com watchPosition comum — só funciona com o app aberto.
    subPrimeiroPlano = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
      (loc) => void receberLocalizacoes([loc]),
    );
    return;
  }
  await Location.startLocationUpdatesAsync(TASK_GPS, {
    // High (~10 m) basta para acompanhar viagem e gasta bem menos bateria que
    // o Highest, que segura o GPS no máximo o tempo inteiro.
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 15,
    // Com a tela bloqueada o Android entrega os pontos em rajadas de ~10s.
    deferredUpdatesInterval: 10000,
    foregroundService: {
      // Limitação da SDK 57: não existe API para ATUALIZAR o texto desta
      // notificação depois de iniciada (ex.: "última sincronização HH:MM").
      // Por isso o texto é fixo; quando a SDK expuser um update, dá para
      // deixar a notificação "viva".
      notificationTitle: 'Nexus Frota — viagem em andamento',
      notificationBody: 'Sua localização está sendo enviada para a central.',
      notificationColor: '#2D6BFF',
    },
  });
}

export async function pararRastreio(): Promise<void> {
  await pararColeta();
  // Último suspiro: manda o que ficou na fila. Se falhar, a fila fica
  // guardada no aparelho (quem limpa sessão NÃO apaga a fila).
  await enviarFila(true);
}
