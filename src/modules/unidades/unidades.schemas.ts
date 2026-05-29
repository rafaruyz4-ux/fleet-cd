import { z } from 'zod';

const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

const coordenadaSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createUnidadeSchema = z.object({
  nome: z.string().min(2).max(150),
  cnpj: z.string().regex(cnpjRegex, 'CNPJ inválido').optional(),
  endereco: z.string().max(255).optional(),
  coordenada: coordenadaSchema.optional(),
  // Ex.: { "seg": ["08:00","17:00"], "sab": ["08:00","12:00"] }
  janela_recebimento: z.record(z.string(), z.array(z.string())).optional(),
  ativo: z.boolean().optional(),
});

export const updateUnidadeSchema = createUnidadeSchema.partial();

export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export type CreateUnidadeInput = z.infer<typeof createUnidadeSchema>;
export type UpdateUnidadeInput = z.infer<typeof updateUnidadeSchema>;
