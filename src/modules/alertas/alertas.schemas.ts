import { z } from 'zod';
import { ALERTA_TIPO } from '../../domain/status';

const boolish = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true');

export const listAlertasQuerySchema = z.object({
  visualizado: boolish.optional(),
  tipo: z.enum(ALERTA_TIPO).optional(),
  viagem_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export const marcarAlertaSchema = z.object({
  visualizado: z.boolean(),
});

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export type ListAlertasQuery = z.infer<typeof listAlertasQuerySchema>;
export type MarcarAlertaInput = z.infer<typeof marcarAlertaSchema>;
