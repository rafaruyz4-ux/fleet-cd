import { z } from 'zod';
import { PLANO_FAIXAS } from '../../domain/planos';

export const mudarPlanoSchema = z.object({
  faixa: z.enum(PLANO_FAIXAS),
});

export type MudarPlanoInput = z.infer<typeof mudarPlanoSchema>;
