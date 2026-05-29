import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import { AppError } from '../../errors/AppError';
import { env } from '../../config/env';

// Endpoints do web service de Distribuição de DF-e por UF/ambiente.
// (Apenas exemplos para SP; complete conforme as UFs que você opera.)
const DISTRIBUICAO_ENDPOINTS: Record<string, { producao: string; homologacao: string }> = {
  SP: {
    producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
    homologacao: 'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  },
};

export function sefazConfigurado(): boolean {
  return Boolean(env.sefaz.certPfxPath && env.sefaz.certPassword);
}

/**
 * Monta um agente HTTPS com autenticação mútua (mTLS) usando o certificado
 * A1 (.pfx). É a parte sensível da integração — fica pronta para uso.
 */
function criarAgenteMtls(): https.Agent {
  const pfxPath = env.sefaz.certPfxPath!;
  if (!existsSync(pfxPath)) {
    throw new AppError(500, `Certificado SEFAZ não encontrado em ${pfxPath}`);
  }
  return new https.Agent({
    pfx: readFileSync(pfxPath),
    passphrase: env.sefaz.certPassword!,
    keepAlive: true,
  });
}

/**
 * Consulta a NF-e na SEFAZ e devolve o XML da nota (que será passado ao
 * parser, exatamente como no import manual).
 *
 * Estado atual: o plumbing (config, certificado, agente mTLS, endpoint por
 * UF) está pronto. A chamada ao web service em si é o ÚNICO passo pendente —
 * ele depende do seu CNPJ e do WS escolhido (NFeDistribuicaoDFe devolve o
 * docZip em base64+gzip a ser descompactado, ou consNSU/consChNFe). Por isso,
 * mesmo configurado, hoje retorna 501 com instrução clara, em vez de enviar um
 * SOAP não testado. Para habilitar:
 *   1) construir o envelope SOAP de distribuiçãoDFe com a `chave` (consChNFe);
 *   2) `https.request` com o `agente` abaixo para o endpoint da UF;
 *   3) extrair `retDistDFeInt/loteDistDFe/docZip`, base64-decode + gunzip;
 *   4) `return` o XML resultante (o parser cuida do resto).
 */
export async function consultarNfeXml(chave: string): Promise<string> {
  if (!sefazConfigurado()) {
    throw new AppError(
      501,
      'Integração SEFAZ não configurada. Defina SEFAZ_CERT_PFX_PATH e SEFAZ_CERT_PASSWORD no .env.',
    );
  }
  if (!/^\d{44}$/.test(chave)) {
    throw AppError.badRequest('Chave de acesso inválida');
  }

  const endpoints = DISTRIBUICAO_ENDPOINTS[env.sefaz.uf];
  if (!endpoints) {
    throw new AppError(501, `Endpoint da SEFAZ para a UF ${env.sefaz.uf} ainda não cadastrado`);
  }

  // Agente mTLS pronto (carrega e valida o certificado A1).
  const agente = criarAgenteMtls();
  void agente; // usado quando a chamada SOAP for implementada (ver doc acima)

  throw new AppError(
    501,
    'Consulta à SEFAZ ainda não implementada: o agente mTLS e a config estão prontos; ' +
      'falta integrar a chamada do web service (NFeDistribuicaoDFe) — ver comentários em integrations/sefaz/client.ts.',
  );
}
