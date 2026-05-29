import { z } from 'zod';

const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createRotaSchema = z.object({
  tipo: z.enum(['fixa', 'dinamica']),
  nome: z.string().max(150).optional(),
  raio_tolerancia_m: z.number().int().positive().max(10000).optional(),
  duracao_estimada_min: z.number().int().positive().optional(),
  // Geometria da rota: sequência de pontos (mínimo 2 para formar a linha).
  linha: z.array(coordenadaSchema).min(2, 'A linha precisa de ao menos 2 pontos').optional(),
});

export const updateRotaSchema = createRotaSchema.partial();

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export type CreateRotaInput = z.infer<typeof createRotaSchema>;
export type UpdateRotaInput = z.infer<typeof updateRotaSchema>;
