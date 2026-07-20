import { z } from 'zod';

export const veiculoParamSchema = z.object({
  veiculoId: z.string().uuid('ID de veículo inválido'),
});

export const listConsultasQuerySchema = z.object({
  veiculo_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type ListConsultasQuery = z.infer<typeof listConsultasQuerySchema>;
