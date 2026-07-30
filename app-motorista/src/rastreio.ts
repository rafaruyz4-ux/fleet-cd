import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { ApiError, enviarPosicoes } from './api';
import { getFila, getStats, setFila, setStats, type PosicaoPendente } from './storage';

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

let ultimoEnvioMs = 0;
let enviando = false;
// Preview web (prints/testes no PC): não existe tarefa em 2º plano, então a
// coleta usa o watchPosition comum em 1º plano.
let webSub: Location.LocationSubscription | null = null;

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
  if (webSub) {
    webSub.remove();
    webSub = null;
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
    let fila = await getFila();
    if (fila.length === 0) return;
    const agora = Date.now();
    if (!forcar && fila.length < LOTE_PONTOS && agora - ultimoEnvioMs < LOTE_INTERVALO_MS) return;

    while (fila.length > 0) {
      const lote = fila.slice(0, LOTE_MAX_REQ);
      const resultado = await enviarPosicoes(lote);
      fila = fila.slice(lote.length);
      await setFila(fila);
      ultimoEnvioMs = Date.now();
      const stats = await getStats();
      await setStats({
        enviadas: stats.enviadas + resultado.inseridas,
        ultimoEnvio: new Date().toISOString(),
        ultimoErro: null,
      });
    }
  } catch (e) {
    const stats = await getStats();
    if (e instanceof ApiError && e.status === 404) {
      // Viagem foi encerrada no sistema: a coleta não tem mais para onde ir.
      await pararColeta();
      await setFila([]);
      await setStats({ ...stats, ultimoErro: null });
      return;
    }
    const mensagem =
      e instanceof ApiError ? e.message : 'Sem conexão — pontos guardados na fila';
    await setStats({ ...stats, ultimoErro: mensagem });
  } finally {
    enviando = false;
  }
}

async function receberLocalizacoes(locations: Location.LocationObject[]): Promise<void> {
  if (!locations?.length) return;
  const fila = await getFila();
  await setFila([...fila, ...locations.map(paraPendente)]);
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

export async function rastreioLigado(): Promise<boolean> {
  if (Platform.OS === 'web') return webSub != null;
  try {
    return await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
  } catch {
    return false;
  }
}

export async function iniciarRastreio(): Promise<void> {
  if (await rastreioLigado()) return;
  if (Platform.OS === 'web') {
    webSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Highest, timeInterval: 5000, distanceInterval: 15 },
      (loc) => void receberLocalizacoes([loc]),
    );
    return;
  }
  await Location.startLocationUpdatesAsync(TASK_GPS, {
    accuracy: Location.Accuracy.Highest,
    timeInterval: 5000,
    distanceInterval: 15,
    // Com a tela bloqueada o Android entrega os pontos em rajadas de ~10s.
    deferredUpdatesInterval: 10000,
    foregroundService: {
      notificationTitle: 'Nexus Frota — viagem em andamento',
      notificationBody: 'Sua localização está sendo enviada para a central.',
      notificationColor: '#2D6BFF',
    },
  });
}

export async function pararRastreio(): Promise<void> {
  await pararColeta();
  // Último suspiro: manda o que ficou na fila.
  await enviarFila(true);
}
