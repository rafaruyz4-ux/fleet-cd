import { z } from 'zod';

const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

// Configurações da PRÓPRIA empresa (dados cadastrais + limiares de alerta).
// Os intervalos espelham os CHECKs da migration 010.
export const atualizarConfiguracoesSchema = z
  .object({
    nome: z.string().trim().min(2, 'Nome da empresa obrigatório').max(180).optional(),
    // string vazia limpa o CNPJ; ausente = não mexe.
    cnpj: z.string().trim().regex(cnpjRegex, 'CNPJ inválido').optional().or(z.literal('')),
    alertaVelocidadeKmh: z.number().int().min(10).max(200).optional(),
    alertaParadaMin: z.number().int().min(1).max(1440).optional(),
    alertaSemGpsMin: z.number().int().min(1).max(1440).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar' });

export type AtualizarConfiguracoesInput = z.infer<typeof atualizarConfiguracoesSchema>;
