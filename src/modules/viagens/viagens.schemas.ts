import { z } from 'zod';
import { VIAGEM_STATUS, PARADA_STATUS } from '../../domain/status';

const uuid = z.string().uuid('ID inválido');

export const createViagemSchema = z.object({
  veiculo_id: uuid,
  motorista_id: uuid,
  rota_planejada_id: uuid.optional(),
  km_inicial: z.number().int().nonnegative().optional(),
  // NFs a alocar como paradas, já na ordem desejada.
  nf_ids: z.array(uuid).optional(),
});

export const updateViagemSchema = z
  .object({
    veiculo_id: uuid,
    motorista_id: uuid,
    rota_planejada_id: uuid.nullable(),
    km_inicial: z.number().int().nonnegative(),
    km_final: z.number().int().nonnegative(),
  })
  .partial();

export const iniciarViagemSchema = z.object({
  iniciada_em: z.coerce.date().optional(),
  km_inicial: z.number().int().nonnegative().optional(),
});

export const encerrarViagemSchema = z.object({
  encerrada_em: z.coerce.date().optional(),
  km_final: z.number().int().nonnegative().optional(),
});

export const listViagensQuerySchema = z.object({
  status: z.enum(VIAGEM_STATUS).optional(),
  veiculo_id: uuid.optional(),
  motorista_id: uuid.optional(),
  // Janela sobre criado_em.
  de: z.coerce.date().optional(),
  ate: z.coerce.date().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const paradaStatus = z.enum(PARADA_STATUS);

export const addParadaSchema = z.object({
  nf_id: uuid,
  ordem: z.number().int().positive().optional(),
  chegada_prevista: z.coerce.date().optional(),
});

export const updateParadaSchema = z
  .object({
    status: paradaStatus,
    ordem: z.number().int().positive(),
    chegada_prevista: z.coerce.date().nullable(),
    chegada_real: z.coerce.date().nullable(),
    saida_real: z.coerce.date().nullable(),
  })
  .partial();

export const idParamSchema = z.object({ id: uuid });

export const paradaParamsSchema = z.object({ id: uuid, paradaId: uuid });

export type CreateViagemInput = z.infer<typeof createViagemSchema>;
export type UpdateViagemInput = z.infer<typeof updateViagemSchema>;
export type IniciarViagemInput = z.infer<typeof iniciarViagemSchema>;
export type EncerrarViagemInput = z.infer<typeof encerrarViagemSchema>;
export type ListViagensQuery = z.infer<typeof listViagensQuerySchema>;
export type AddParadaInput = z.infer<typeof addParadaSchema>;
export type UpdateParadaInput = z.infer<typeof updateParadaSchema>;
