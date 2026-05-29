import { z } from 'zod';

// Aceita placa antiga (ABC1234) e Mercosul (ABC1D23).
const placaRegex = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export const createVeiculoSchema = z.object({
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .transform((p) => p.replace('-', ''))
    .pipe(z.string().regex(placaRegex, 'Placa inválida')),
  modelo: z.string().max(100).optional(),
  tipo: z.enum(['caminhao', 'carro', 'utilitario']).default('caminhao'),
  capacidade_kg: z.number().int().positive().optional(),
  renavam: z.string().max(20).optional(),
  ativo: z.boolean().optional(),
});

export const updateVeiculoSchema = createVeiculoSchema.partial();

export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export type CreateVeiculoInput = z.infer<typeof createVeiculoSchema>;
export type UpdateVeiculoInput = z.infer<typeof updateVeiculoSchema>;
