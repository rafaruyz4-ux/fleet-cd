import { z } from 'zod';

// Chave de acesso da NF-e: 44 dígitos numéricos.
const chaveAcessoRegex = /^\d{44}$/;

const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// Item de NF (o que está no caminhão). Sem id no input — gerado no banco.
export const itemNfSchema = z.object({
  codigo: z.string().max(50).optional(),
  descricao: z.string().max(500).optional(),
  quantidade: z.number().nonnegative().optional(),
  unidade: z.string().max(10).optional(),
  valor_unitario: z.number().nonnegative().optional(),
});

const nfBase = {
  numero: z.string().max(20).optional(),
  serie: z.string().max(5).optional(),
  cfop: z.string().max(10).optional(),
  emitida_em: z.coerce.date().optional(),
  destinatario_cnpj: z.string().max(18).optional(),
  destinatario_nome: z.string().max(200).optional(),
  destinatario_endereco: z.string().optional(),
  unidade_propria_id: z.string().uuid('ID de unidade inválido').optional(),
  coordenada: coordenadaSchema.optional(),
  valor_total: z.number().nonnegative().optional(),
  peso_kg: z.number().nonnegative().optional(),
  xml_path: z.string().max(500).optional(),
  status: z.enum(['importada', 'alocada', 'em_viagem', 'entregue']).optional(),
};

export const createNfSchema = z.object({
  chave_acesso: z
    .string()
    .trim()
    .regex(chaveAcessoRegex, 'Chave de acesso deve ter 44 dígitos'),
  ...nfBase,
  // Itens opcionais na criação; substituídos por completo se enviados no update.
  itens: z.array(itemNfSchema).optional(),
});

// No update a chave de acesso é imutável (identidade fiscal da NF).
export const updateNfSchema = z
  .object({ ...nfBase, itens: z.array(itemNfSchema).optional() })
  .partial();

export const listNfsQuerySchema = z.object({
  status: z.enum(['importada', 'alocada', 'em_viagem', 'entregue']).optional(),
  destinatario_cnpj: z.string().max(18).optional(),
  unidade_propria_id: z.string().uuid().optional(),
  // Janela de emissão (emitida_em).
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  // Busca livre por número da NF ou nome do destinatário.
  busca: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

// Integração NF-e.
export const importarXmlSchema = z.object({
  xml: z.string().min(1, 'XML obrigatório'),
});

export const consultarSefazSchema = z.object({
  chave_acesso: z.string().regex(/^\d{44}$/, 'Chave de acesso deve ter 44 dígitos'),
});

export type CreateNfInput = z.infer<typeof createNfSchema>;
export type UpdateNfInput = z.infer<typeof updateNfSchema>;
export type ListNfsQuery = z.infer<typeof listNfsQuerySchema>;
export type ItemNfInput = z.infer<typeof itemNfSchema>;
