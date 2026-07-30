import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { ApiError, enviarPosicoes } from './api';
import { getFila, getStats, setFila, setStats, type PosicaoPendente } from './storage';

/**
 * Rastreio GPS em segundo plano. A tarefa abaixo é executada pelo Android
 * mesmo com a tela bloqueada ou o app fora da frente (foreground service com
 * notificação fixa). Os pontos caem numa fila local e são enviados em lote —
 * se faltar internet (estrada), a fila segura e envia quando voltar.
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
    const mensagem =
      e instanceof ApiError
        ? e.status === 404
          ? 'Nenhuma viagem em andamento no sistema'
          : e.message
        : 'Sem conexão — pontos guardados na fila';
    await setStats({ ...stats, ultimoErro: mensagem });
  } finally {
    enviando = false;
  }
}

TaskManager.defineTask(TASK_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;
  const fila = await getFila();
  await setFila([...fila, ...locations.map(paraPendente)]);
  await enviarFila();
});

export type ResultadoPermissao = 'ok' | 'sem_permissao' | 'sem_segundo_plano';

/** Pede as permissões na ordem exigida pelo Android (1º em uso, 2º sempre). */
export async function pedirPermissoes(): Promise<ResultadoPermissao> {
  const emUso = await Location.requestForegroundPermissionsAsync();
  if (!emUso.granted) return 'sem_permissao';
  const sempre = await Location.requestBackgroundPermissionsAsync();
  if (!sempre.granted) return 'sem_segundo_plano';
  return 'ok';
}

export async function rastreioLigado(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TASK_GPS);
  } catch {
    return false;
  }
}

export async function iniciarRastreio(): Promise<void> {
  if (await rastreioLigado()) return;
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
  if (await rastreioLigado()) {
    await Location.stopLocationUpdatesAsync(TASK_GPS);
  }
  // Último suspiro: manda o que ficou na fila.
  await enviarFila(true);
}
