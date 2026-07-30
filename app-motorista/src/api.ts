import {
  getAccessToken,
  getApiUrl,
  getRefreshToken,
  salvarSessao,
  setAccessToken,
  type PosicaoPendente,
} from './storage';

/**
 * Cliente da API do backend fleet-cd (mesmos contratos do dashboard):
 * erros vêm como `{error, details}` e o access token expira rápido —
 * em 401 tentamos 1x o /auth/refresh e refazemos a chamada.
 */

export type MinhaViagem = {
  id: string;
  status: 'planejada' | 'em_andamento' | 'concluida' | 'cancelada';
  veiculo_placa: string;
  iniciada_em: string | null;
  criado_em: string;
  paradas_count: number;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.status = status;
  }
}

async function lerErro(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error || body.message || `Erro ${res.status}`;
  } catch {
    return `Erro ${res.status}`;
  }
}

// Refresh "single-flight": várias chamadas 401 ao mesmo tempo disparam UM refresh.
let refreshEmVoo: Promise<string | null> | null = null;

async function renovarAccessToken(): Promise<string | null> {
  if (!refreshEmVoo) {
    refreshEmVoo = (async () => {
      try {
        const base = await getApiUrl();
        const refreshToken = await getRefreshToken();
        if (!base || !refreshToken) return null;
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const body = await res.json();
        if (typeof body.accessToken !== 'string') return null;
        await setAccessToken(body.accessToken);
        return body.accessToken;
      } catch {
        return null;
      } finally {
        refreshEmVoo = null;
      }
    })();
  }
  return refreshEmVoo;
}

async function chamar<T>(path: string, init?: RequestInit): Promise<T> {
  const base = await getApiUrl();
  if (!base) throw new ApiError(0, 'Endereço do servidor não configurado');

  const fazer = async (token: string | null): Promise<Response> =>
    fetch(`${base}/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });

  let res = await fazer(await getAccessToken());
  if (res.status === 401) {
    const novo = await renovarAccessToken();
    if (novo) res = await fazer(novo);
  }
  if (!res.ok) throw new ApiError(res.status, await lerErro(res));
  return res.json();
}

export async function loginMotorista(cpf: string, senha: string): Promise<string> {
  const base = await getApiUrl();
  if (!base) throw new ApiError(0, 'Preencha o endereço do servidor');
  let res: Response;
  try {
    res = await fetch(`${base}/api/auth/motorista/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, senha }),
    });
  } catch {
    throw new ApiError(0, 'Não deu para falar com o servidor. Confira o endereço e a internet.');
  }
  if (!res.ok) throw new ApiError(res.status, await lerErro(res));
  const body = await res.json();
  const nome: string = body.motorista?.nome ?? 'Motorista';
  await salvarSessao(nome, body.accessToken, body.refreshToken);
  return nome;
}

export const getMinhasViagens = () => chamar<MinhaViagem[]>('/app/viagens');

/** Carimba a saída da viagem (botão "Iniciar viagem" do motorista). */
export const iniciarViagem = (id: string) =>
  chamar<{ id: string }>(`/app/viagens/${id}/iniciar`, { method: 'POST' });

/**
 * Envia um lote de posições para a viagem em andamento do motorista
 * (rota fixa /app/posicoes — a tarefa em 2º plano não precisa saber o id).
 */
export const enviarPosicoes = (posicoes: PosicaoPendente[]) =>
  chamar<{ inseridas: number }>('/app/posicoes', {
    method: 'POST',
    body: JSON.stringify({ posicoes }),
  });
