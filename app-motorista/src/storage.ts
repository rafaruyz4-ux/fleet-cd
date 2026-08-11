import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SERVIDOR_PADRAO } from './config';

/**
 * Armazenamento local. A tarefa de GPS roda em contexto "headless" (sem UI),
 * então tudo que ela precisa (tokens, servidor, fila de pontos) vive aqui,
 * compartilhado entre a UI e a tarefa.
 *
 * Tokens ficam no SecureStore (criptografado pelo Keystore do Android; não
 * depende de UI, então funciona também no contexto headless da tarefa).
 * Fila, stats e preferências ficam no AsyncStorage, que aguenta payloads
 * maiores que o limite do armazenamento seguro.
 */
const K = {
  apiUrl: 'vetra.apiUrl',
  accessToken: 'vetra.accessToken',
  refreshToken: 'vetra.refreshToken',
  motoristaNome: 'vetra.motoristaNome',
  fila: 'vetra.filaPosicoes',
  stats: 'vetra.statsRastreio',
  viagemAtiva: 'vetra.viagemAtiva',
  guiaBateria: 'vetra.guiaBateriaVista',
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
  /** Pontos perdidos porque a fila local encheu (fila cheia descarta os mais antigos). */
  descartados: number;
  ultimoEnvio: string | null; // ISO — última vez que a central RECEBEU
  ultimoPonto: string | null; // ISO — última vez que o GPS COLETOU (≠ enviar!)
  ultimoErro: string | null;
  /** O refresh falhou de vez: parar de martelar o servidor até novo login. */
  sessaoExpirada: boolean;
  /** A central encerrou a viagem (404 confirmado no envio de posições). */
  viagemEncerrada: boolean;
};

const STATS_ZERADAS: StatsRastreio = {
  enviadas: 0,
  descartados: 0,
  ultimoEnvio: null,
  ultimoPonto: null,
  ultimoErro: null,
  sessaoExpirada: false,
  viagemEncerrada: false,
};

// --- Cofre de tokens (SecureStore, com fallback/migração do AsyncStorage) ---

// No preview web não existe SecureStore; cai no AsyncStorage (é só para prints).
const temCofre = Platform.OS !== 'web';

async function lerSeguro(chave: string): Promise<string | null> {
  if (!temCofre) return AsyncStorage.getItem(chave);
  const valor = await SecureStore.getItemAsync(chave).catch(() => null);
  if (valor != null) return valor;
  // Migração suave: versão antiga do app guardava o token no AsyncStorage.
  // Na primeira leitura, movemos para o cofre e apagamos do lugar antigo.
  const antigo = await AsyncStorage.getItem(chave);
  if (antigo != null) {
    try {
      await SecureStore.setItemAsync(chave, antigo);
      await AsyncStorage.removeItem(chave);
    } catch {
      /* se o cofre falhar, o valor antigo continua servindo */
    }
    return antigo;
  }
  return null;
}

async function gravarSeguro(chave: string, valor: string): Promise<void> {
  if (!temCofre) {
    await AsyncStorage.setItem(chave, valor);
    return;
  }
  await SecureStore.setItemAsync(chave, valor);
}

async function apagarSeguro(chave: string): Promise<void> {
  if (temCofre) await SecureStore.deleteItemAsync(chave).catch(() => {});
  await AsyncStorage.removeItem(chave); // limpa também resto de versão antiga
}

// --- Sessão ---

/** Sem endereço salvo, vale o padrão embutido — motorista não digita nada. */
export const getApiUrl = async () => (await AsyncStorage.getItem(K.apiUrl)) || SERVIDOR_PADRAO;
export const setApiUrl = (url: string) => AsyncStorage.setItem(K.apiUrl, url.trim().replace(/\/+$/, ''));

export const getAccessToken = () => lerSeguro(K.accessToken);
export const setAccessToken = (t: string) => gravarSeguro(K.accessToken, t);
export const getRefreshToken = () => lerSeguro(K.refreshToken);

export async function salvarSessao(nome: string, accessToken: string, refreshToken: string) {
  await AsyncStorage.setItem(K.motoristaNome, nome);
  await gravarSeguro(K.accessToken, accessToken);
  await gravarSeguro(K.refreshToken, refreshToken);
  // Login novo: a sessão deixou de estar expirada — o envio da fila retoma.
  const stats = await getStats();
  if (stats.sessaoExpirada) await setStats({ ...stats, sessaoExpirada: false });
}

export const getMotoristaNome = async () => (await AsyncStorage.getItem(K.motoristaNome)) ?? '';

/**
 * Sai da conta. A FILA não é apagada aqui de propósito: se o último envio
 * falhou (sem internet na hora do "Sair"), os pontos ficam guardados e sobem
 * no próximo login.
 */
export async function limparSessao() {
  await apagarSeguro(K.accessToken);
  await apagarSeguro(K.refreshToken);
  await AsyncStorage.multiRemove([K.motoristaNome, K.stats, K.viagemAtiva]);
}

export const temSessao = async () => Boolean(await getRefreshToken());

// --- Viagem ativa lembrada no aparelho ---
// Serve para retomar o painel (e o GPS) depois de um reboot mesmo sem
// internet na hora — o servidor confirma/corrige assim que o sinal voltar.

export type ViagemCache = {
  id: string;
  status: string;
  veiculo_placa: string;
  iniciada_em: string | null;
  criado_em: string;
  paradas_count: number;
};

export const setViagemCache = (v: ViagemCache) => AsyncStorage.setItem(K.viagemAtiva, JSON.stringify(v));
export const limparViagemCache = () => AsyncStorage.removeItem(K.viagemAtiva);

export async function getViagemCache(): Promise<ViagemCache | null> {
  const raw = await AsyncStorage.getItem(K.viagemAtiva);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// --- Fila de posições (buffer offline) ---
//
// A fila é um JSON único, regravado a cada mudança. Estudamos particionar em
// blocos (uma chave por lote) para baratear a escrita, mas isso complicaria o
// mutex e a remoção por identidade; como a gravação acontece por RAJADA do GPS
// (~10 s) e não por ponto, o custo do JSON único ficou aceitável. Se um dia a
// fila crescer além dos 12 mil pontos, revisitar.

/** Limite da fila local (~12 h de viagem): acima disso caem os pontos mais antigos. */
const FILA_MAX = 12000;

// Mutex simples: TODO leitura-modifica-grava da fila passa por esta corrente
// de promises. Sem isso, um ponto que chega DURANTE o POST do lote é
// sobrescrito quando o envio regrava a fila a partir de uma cópia velha.
let cadeiaFila: Promise<unknown> = Promise.resolve();

function comFilaTravada<T>(fn: () => Promise<T>): Promise<T> {
  const passo = cadeiaFila.then(fn);
  cadeiaFila = passo.catch(() => undefined);
  return passo;
}

async function lerFila(): Promise<PosicaoPendente[]> {
  const raw = await AsyncStorage.getItem(K.fila);
  if (!raw) return [];
  try {
    const lista = JSON.parse(raw);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

async function gravarFila(fila: PosicaoPendente[]): Promise<void> {
  if (fila.length > FILA_MAX) {
    // Fila cheia: derruba os mais antigos, mas CONTA quantos se perderam —
    // a tela avisa o motorista de forma discreta.
    const perdidos = fila.length - FILA_MAX;
    fila = fila.slice(-FILA_MAX);
    const stats = await getStats();
    await setStats({ ...stats, descartados: stats.descartados + perdidos });
  }
  await AsyncStorage.setItem(K.fila, JSON.stringify(fila));
}

/** Leitura avulsa (fora do mutex): serve para exibir e montar lote de envio. */
export const getFila = () => lerFila();

/** Identidade de um ponto — remoção pós-envio é por identidade, não por índice. */
const chaveDoPonto = (p: PosicaoPendente) => `${p.registrado_em}|${p.lat}|${p.lng}`;

export function anexarPontos(pontos: PosicaoPendente[]): Promise<void> {
  return comFilaTravada(async () => gravarFila([...(await lerFila()), ...pontos]));
}

/** Tira da fila só o que foi enviado; o que chegou durante o POST fica. */
export function removerPontosEnviados(enviados: PosicaoPendente[]): Promise<void> {
  return comFilaTravada(async () => {
    const ids = new Set(enviados.map(chaveDoPonto));
    await gravarFila((await lerFila()).filter((p) => !ids.has(chaveDoPonto(p))));
  });
}

export function limparFila(): Promise<void> {
  return comFilaTravada(() => AsyncStorage.removeItem(K.fila));
}

// --- Estatísticas mostradas na tela de rastreio ---

export async function getStats(): Promise<StatsRastreio> {
  const raw = await AsyncStorage.getItem(K.stats);
  if (!raw) return { ...STATS_ZERADAS };
  try {
    return { ...STATS_ZERADAS, ...JSON.parse(raw) };
  } catch {
    return { ...STATS_ZERADAS };
  }
}

export async function setStats(stats: StatsRastreio) {
  await AsyncStorage.setItem(K.stats, JSON.stringify(stats));
}

// --- Guia de bateria (mostrado uma vez, na primeira viagem) ---

export const guiaBateriaVista = async () => (await AsyncStorage.getItem(K.guiaBateria)) === '1';
export const marcarGuiaBateriaVista = () => AsyncStorage.setItem(K.guiaBateria, '1');
