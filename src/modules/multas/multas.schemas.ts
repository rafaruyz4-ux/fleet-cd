import { z } from 'zod';
import { MULTA_STATUS_PAGAMENTO, MULTA_STATUS_REVISAO } from '../../domain/status';

const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const statusPagamento = z.enum(MULTA_STATUS_PAGAMENTO);
const statusRevisao = z.enum(MULTA_STATUS_REVISAO);
const fonte = z.enum(['infosimples', 'manual']);

export const createMultaSchema = z
  .object({
    numero_auto: z.string().min(1).max(50),
    // Identificação do veículo: por id OU por placa (resolvida no service).
    veiculo_id: z.string().uuid().optional(),
    placa: z.string().max(10).optional(),
    motorista_id: z.string().uuid().optional(),
    ocorrida_em: z.coerce.date().optional(),
    tipo: z.string().max(150).optional(),
    valor: z.number().nonnegative().optional(),
    pontos_cnh: z.number().int().nonnegative().optional(),
    local: z.string().max(255).optional(),
    coordenada: coordenadaSchema.optional(),
    // Origem: por padrão 'manual' (lançamento humano); a sync da Infosimples passa 'infosimples'.
    fonte: fonte.default('manual'),
    status_pagamento: statusPagamento.optional(),
  })
  .refine((d) => d.veiculo_id || d.placa, {
    message: 'Informe veiculo_id ou placa',
    path: ['placa'],
  });

export const updateMultaSchema = z
  .object({
    veiculo_id: z.string().uuid().nullable(),
    motorista_id: z.string().uuid().nullable(),
    viagem_id: z.string().uuid().nullable(),
    ocorrida_em: z.coerce.date().nullable(),
    tipo: z.string().max(150).nullable(),
    valor: z.number().nonnegative().nullable(),
    pontos_cnh: z.number().int().nonnegative().nullable(),
    local: z.string().max(255).nullable(),
    coordenada: coordenadaSchema.nullable(),
    status_pagamento: statusPagamento,
    status_revisao: statusRevisao,
  })
  .partial();

export const listMultasQuerySchema = z.object({
  status_pagamento: statusPagamento.optional(),
  status_revisao: statusRevisao.optional(),
  fonte: fonte.optional(),
  veiculo_id: z.string().uuid().optional(),
  motorista_id: z.string().uuid().optional(),
  // Janela sobre ocorrida_em.
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  busca: z.string().max(150).optional(), // numero_auto ou tipo
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Exportação CSV: mesmos filtros da listagem, sem paginação.
export const exportMultasQuerySchema = listMultasQuerySchema.omit({
  limit: true,
  offset: true,
});

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export type CreateMultaInput = z.infer<typeof createMultaSchema>;
export type UpdateMultaInput = z.infer<typeof updateMultaSchema>;
export type ListMultasQuery = z.infer<typeof listMultasQuerySchema>;
export type ExportMultasQuery = z.infer<typeof exportMultasQuerySchema>;
