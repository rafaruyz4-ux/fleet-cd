import { z } from 'zod';

export const posicaoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  velocidade_kmh: z.number().min(0).max(999).optional(),
  precisao_m: z.number().min(0).optional(),
  registrado_em: z.coerce.date(),
});

export const ingestPosicoesSchema = z.object({
  // Lote de posições (o app pode bufferizar offline e enviar em bloco).
  posicoes: z.array(posicaoSchema).min(1, 'Envie ao menos uma posição').max(1000),
});

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export type PosicaoInput = z.infer<typeof posicaoSchema>;
export type IngestPosicoesInput = z.infer<typeof ingestPosicoesSchema>;
