import { AppError } from '../../errors/AppError';
import { env } from '../../config/env';

/** Uma multa/débito como o resto do sistema entende (valor em reais). */
export interface DebitoMulta {
  numero_auto: string;
  tipo?: string;
  valor?: number;
  pontos_cnh?: number;
  ocorrida_em?: string; // ISO
  local?: string;
}

export interface ResultadoConsulta {
  simulado: boolean;
  multas: DebitoMulta[];
  mensagem: string;
}

export interface ConsultaArgs {
  placa: string;
  renavam?: string | null;
  uf?: string;
}

/** true quando há chave configurada (faz consulta real). */
export function infosimplesConfigurado(): boolean {
  return Boolean(env.infosimples.apiKey);
}

/**
 * Modo simulado: sem chave, devolve débitos de exemplo determinísticos pela
 * placa (a 2ª consulta da mesma placa repete os mesmos números de auto — útil
 * para validar que multas repetidas não são duplicadas). NÃO chama a Infosimples
 * e NÃO tem custo.
 */
function simular(placa: string): ResultadoConsulta {
  return {
    simulado: true,
    mensagem: 'Modo simulado (sem INFOSIMPLES_API_KEY): dados de exemplo, sem custo.',
    multas: [
      {
        numero_auto: `SIM-${placa}-1`,
        tipo: 'Velocidade acima da permitida em até 20%',
        valor: 130.16,
        pontos_cnh: 4,
        ocorrida_em: '2026-03-15T08:30:00Z',
        local: 'Av. Exemplo, km 12 (simulado)',
      },
      {
        numero_auto: `SIM-${placa}-2`,
        tipo: 'Estacionar em local proibido',
        valor: 88.38,
        pontos_cnh: 3,
        ocorrida_em: '2026-04-02T19:10:00Z',
        local: 'Rua de Teste, 100 (simulado)',
      },
    ],
  };
}

interface InfosimplesResposta {
  code: number;
  code_message?: string;
  data?: Array<Record<string, unknown>>;
}

// Mapeia o "auto de infração" cru da Infosimples para o nosso formato. Os nomes
// dos campos variam por consulta/UF; cobrimos os mais comuns e caímos em
// alternativas quando o nome difere. Ajustável quando a consulta for escolhida.
function mapearMulta(raw: Record<string, unknown>): DebitoMulta | null {
  const s = (...chaves: string[]): string | undefined => {
    for (const k of chaves) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return undefined;
  };
  const numero_auto = s('auto_infracao', 'auto', 'numero_auto', 'ait', 'numero');
  if (!numero_auto) return null;

  const valorStr = s('valor', 'valor_original', 'valor_infracao');
  const valor = valorStr
    ? Number(valorStr.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
    : undefined;
  const pontosStr = s('pontos', 'pontuacao');
  const pontos_cnh = pontosStr ? Number(pontosStr) : undefined;

  return {
    numero_auto,
    tipo: s('descricao', 'infracao', 'tipo', 'enquadramento'),
    valor: Number.isFinite(valor) ? valor : undefined,
    pontos_cnh: Number.isFinite(pontos_cnh) ? pontos_cnh : undefined,
    ocorrida_em: s('data_infracao', 'data', 'data_hora'),
    local: s('local', 'municipio', 'endereco'),
  };
}

/**
 * Consulta os débitos/multas de um veículo.
 * - Sem chave → modo simulado (testável agora).
 * - Com chave → POST na Infosimples (token + placa/renavam), código 200 = ok.
 *
 * A Infosimples normalmente responde { code, code_message, data: [ {...} ] }.
 * As multas costumam vir em data[0].multas (ou .debitos). Extraímos de forma
 * tolerante; quando a consulta definitiva for escolhida, é só ajustar o caminho.
 */
export async function consultarDebitosVeiculo(args: ConsultaArgs): Promise<ResultadoConsulta> {
  if (!infosimplesConfigurado()) {
    return simular(args.placa);
  }

  const url = `${env.infosimples.baseUrl.replace(/\/$/, '')}/consultas/${env.infosimples.endpoint}`;
  const cfg = env.infosimples;
  const corpo: Record<string, unknown> = {
    token: cfg.apiKey,
    placa: args.placa,
    timeout: Math.floor(cfg.timeoutMs / 1000),
  };
  if (args.renavam) corpo.renavam = args.renavam;
  // Login do portal do governo (exigido pelas consultas de débito de SP).
  if (cfg.loginCpf) corpo.login_cpf = cfg.loginCpf;
  if (cfg.loginSenha) corpo.login_senha = cfg.loginSenha;
  // Certificado digital A1 (exigido por consultas como a da SEFAZ).
  if (cfg.pkcs12Base64) corpo.pkcs12_cert = cfg.pkcs12Base64;
  if (cfg.pkcs12Pass) corpo.pkcs12_pass = cfg.pkcs12Pass;
  // Período para consultas de multas que pedem janela de datas (ex.: RENAINF).
  const fim = new Date();
  const inicio = new Date(fim.getTime() - cfg.janelaDias * 86_400_000);
  corpo.data_inicio = inicio.toISOString().slice(0, 10);
  corpo.data_fim = fim.toISOString().slice(0, 10);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.infosimples.timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
  } catch (err) {
    throw new AppError(502, `Falha ao contatar a Infosimples: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }

  let json: InfosimplesResposta;
  try {
    json = (await resp.json()) as InfosimplesResposta;
  } catch {
    throw new AppError(502, `Resposta inválida da Infosimples (HTTP ${resp.status})`);
  }

  // A Infosimples usa o campo "code": 200 = sucesso; 6xx = erros de negócio.
  if (json.code !== 200) {
    throw new AppError(
      502,
      `Infosimples recusou a consulta (code ${json.code}): ${json.code_message ?? 'sem detalhe'}`,
    );
  }

  const primeiro = json.data?.[0] ?? {};
  // O nome do array de multas varia por consulta: DETRAN/SEFAZ SP usam
  // 'debitos_multas'; outras usam 'multas' ou 'debitos'.
  const lista =
    (primeiro.debitos_multas as Record<string, unknown>[] | undefined) ??
    (primeiro.multas as Record<string, unknown>[] | undefined) ??
    (primeiro.debitos as Record<string, unknown>[] | undefined) ??
    [];

  const multas = lista.map(mapearMulta).filter((m): m is DebitoMulta => m !== null);

  return {
    simulado: false,
    mensagem: json.code_message ?? 'Consulta realizada.',
    multas,
  };
}
