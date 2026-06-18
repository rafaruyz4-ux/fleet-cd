import { ZodError } from 'zod';
import { AppError } from '../../errors/AppError';
import { createNfSchema } from '../../modules/nfs/nfs.schemas';
import * as nfsService from '../../modules/nfs/nfs.service';
import type { Nf } from '../../modules/nfs/nfs.service';
import { parseNfeXml } from './parser';

/**
 * Importa uma NF-e a partir do XML: parseia, valida pelos mesmos schemas do
 * cadastro manual e cria a NF + itens (reusa nfs.service.create, incl. a
 * deduplicação por chave de acesso → 409 se a NF já foi importada).
 */
export async function importarNfeXml(empresaId: string, xml: string): Promise<Nf> {
  const parsed = parseNfeXml(xml);

  // Passa pelos mesmos schemas do POST /nfs para garantir consistência.
  let input;
  try {
    input = createNfSchema.parse({
      chave_acesso: parsed.chave_acesso,
      numero: parsed.numero,
      serie: parsed.serie,
      cfop: parsed.cfop,
      emitida_em: parsed.emitida_em,
      destinatario_cnpj: parsed.destinatario_cnpj,
      destinatario_nome: parsed.destinatario_nome,
      destinatario_endereco: parsed.destinatario_endereco,
      valor_total: parsed.valor_total,
      peso_kg: parsed.peso_kg,
      itens: parsed.itens,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      throw AppError.badRequest('NF-e com dados inválidos', err.flatten().fieldErrors);
    }
    throw err;
  }

  return nfsService.create(empresaId, input);
}
