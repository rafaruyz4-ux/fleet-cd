import { z } from 'zod';
import { schemaSenha } from '../../utils/senha';

const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

export const createMotoristaSchema = z.object({
  nome: z.string().min(2).max(150),
  cpf: z.string().regex(cpfRegex, 'CPF inválido'),
  cnh: z.string().max(20).optional(),
  categoria_cnh: z.enum(['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']).optional(),
  validade_cnh: z.string().date('Data inválida (use YYYY-MM-DD)').optional(),
  telefone: z.string().max(20).optional(),
  // Política de senha central (utils/senha); 72 é o teto do bcrypt.
  senha: schemaSenha(72).optional(),
  ativo: z.boolean().optional(),
});

// Em update todos os campos são opcionais.
export const updateMotoristaSchema = createMotoristaSchema.partial();

export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export type CreateMotoristaInput = z.infer<typeof createMotoristaSchema>;
export type UpdateMotoristaInput = z.infer<typeof updateMotoristaSchema>;
