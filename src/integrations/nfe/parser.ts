import { XMLParser } from 'fast-xml-parser';
import { AppError } from '../../errors/AppError';

export interface NfeItemParse {
  codigo?: string;
  descricao?: string;
  quantidade?: number;
  unidade?: string;
  valor_unitario?: number;
}

export interface NfeParseResult {
  chave_acesso: string;
  numero?: string;
  serie?: string;
  cfop?: string;
  emitida_em?: Date;
  destinatario_cnpj?: string;
  destinatario_nome?: string;
  destinatario_endereco?: string;
  valor_total?: number;
  peso_kg?: number;
  itens: NfeItemParse[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Mantém valores como string (preserva zeros à esquerda de nNF, etc.);
  // os números são convertidos manualmente abaixo.
  parseTagValue: false,
  trimValues: true,
});

function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function montarEndereco(ender: Record<string, unknown> | undefined): string | undefined {
  if (!ender) return undefined;
  const linha = str(ender.xLgr);
  const nro = str(ender.nro);
  const bairro = str(ender.xBairro);
  const mun = str(ender.xMun);
  const uf = str(ender.UF);
  const cep = str(ender.CEP);
  const cidadeUf = [mun, uf].filter(Boolean).join('/');
  const partes = [
    [linha, nro].filter(Boolean).join(', '),
    bairro,
    cidadeUf,
    cep,
  ].filter(Boolean);
  return partes.length ? partes.join(' - ') : undefined;
}

/**
 * Faz o parse do XML de uma NF-e (aceita raiz `nfeProc` ou `NFe`) para os
 * campos que o sistema persiste. Lança AppError 400 se não for uma NF-e válida.
 */
export function parseNfeXml(xml: string): NfeParseResult {
  let obj: Record<string, any>;
  try {
    obj = parser.parse(xml);
  } catch {
    throw AppError.badRequest('XML inválido (não foi possível fazer o parse)');
  }

  const nfe = obj?.nfeProc?.NFe ?? obj?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) {
    throw AppError.badRequest('XML não parece ser uma NF-e (faltou NFe/infNFe)');
  }

  const idAttr = str(infNFe['@_Id']) ?? '';
  const chave = idAttr.replace(/^NFe/i, '');
  if (!/^\d{44}$/.test(chave)) {
    throw AppError.badRequest('Chave de acesso ausente ou inválida no XML');
  }

  const ide = infNFe.ide ?? {};
  const dest = infNFe.dest ?? {};
  const det = asArray(infNFe.det);
  const icmsTot = infNFe.total?.ICMSTot ?? {};
  const vol = asArray(infNFe.transp?.vol)[0] ?? {};

  const dhEmi = str(ide.dhEmi) ?? str(ide.dEmi);
  const emitida = dhEmi ? new Date(dhEmi) : undefined;

  const itens: NfeItemParse[] = det.map((d: any) => {
    const prod = d?.prod ?? {};
    return {
      codigo: str(prod.cProd),
      descricao: str(prod.xProd),
      quantidade: num(prod.qCom),
      unidade: str(prod.uCom),
      valor_unitario: num(prod.vUnCom),
    };
  });

  // CFOP é por item na NF-e; usamos o do primeiro item como representativo.
  const cfop = str(det[0]?.prod?.CFOP);

  return {
    chave_acesso: chave,
    numero: str(ide.nNF),
    serie: str(ide.serie),
    cfop,
    emitida_em: emitida && !Number.isNaN(emitida.getTime()) ? emitida : undefined,
    destinatario_cnpj: str(dest.CNPJ) ?? str(dest.CPF),
    destinatario_nome: str(dest.xNome),
    destinatario_endereco: montarEndereco(dest.enderDest),
    valor_total: num(icmsTot.vNF),
    peso_kg: num(vol.pesoL) ?? num(vol.pesoB),
    itens,
  };
}
