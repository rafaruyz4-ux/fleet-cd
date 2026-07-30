import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Chaves do armazenamento local. A tarefa de GPS roda em contexto "headless"
 * (sem UI), então tudo que ela precisa (tokens, servidor, fila de pontos)
 * vive no AsyncStorage — compartilhado entre a UI e a tarefa.
 */
const K = {
  apiUrl: 'vetra.apiUrl',
  accessToken: 'vetra.accessToken',
  refreshToken: 'vetra.refreshToken',
  motoristaNome: 'vetra.motoristaNome',
  fila: 'vetra.filaPosicoes',
  stats: 'vetra.statsRastreio',
} as const;

export type PosicaoPendente = {
  lat: number;
  lng: number;
  velocidade_kmh?: number;
  precisao_m?: number;
  registrado_em: string;
};

export type StatsRastreio = {
  enviadas: number;
  ultimoEnvio: string | null; // ISO
  ultimoErro: string | null;
};

export const getApiUrl = async () => (await AsyncStorage.getItem(K.apiUrl)) ?? '';
export const setApiUrl = (url: string) => AsyncStorage.setItem(K.apiUrl, url.trim().replace(/\/+$/, ''));

export const getAccessToken = () => AsyncStorage.getItem(K.accessToken);
export const setAccessToken = (t: string) => AsyncStorage.setItem(K.accessToken, t);
export const getRefreshToken = () => AsyncStorage.getItem(K.refreshToken);

export async function salvarSessao(nome: string, accessToken: string, refreshToken: string) {
  await AsyncStorage.multiSet([
    [K.motoristaNome, nome],
    [K.accessToken, accessToken],
    [K.refreshToken, refreshToken],
  ]);
}

export const getMotoristaNome = async () => (await AsyncStorage.getItem(K.motoristaNome)) ?? '';

export async function limparSessao() {
  await AsyncStorage.multiRemove([K.accessToken, K.refreshToken, K.motoristaNome, K.fila, K.stats]);
}

export const temSessao = async () => Boolean(await getRefreshToken());

// --- Fila de posições (buffer offline) ---

/** Limite da fila local: acima disso descartamos os pontos mais antigos. */
const FILA_MAX = 4000;

export async function getFila(): Promise<PosicaoPendente[]> {
  const raw = await AsyncStorage.getItem(K.fila);
  if (!raw) return [];
  try {
    const lista = JSON.parse(raw);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export async function setFila(fila: PosicaoPendente[]) {
  await AsyncStorage.setItem(K.fila, JSON.stringify(fila.slice(-FILA_MAX)));
}

// --- Estatísticas mostradas na tela de rastreio ---

export async function getStats(): Promise<StatsRastreio> {
  const raw = await AsyncStorage.getItem(K.stats);
  if (!raw) return { enviadas: 0, ultimoEnvio: null, ultimoErro: null };
  try {
    return { enviadas: 0, ultimoEnvio: null, ultimoErro: null, ...JSON.parse(raw) };
  } catch {
    return { enviadas: 0, ultimoEnvio: null, ultimoErro: null };
  }
}

export async function setStats(stats: StatsRastreio) {
  await AsyncStorage.setItem(K.stats, JSON.stringify(stats));
}
