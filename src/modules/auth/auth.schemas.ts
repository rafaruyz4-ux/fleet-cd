import { z } from 'zod';
import { schemaSenha } from '../../utils/senha';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken obrigatório'),
});

const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

export const motoristaLoginSchema = z.object({
  cpf: z.string().regex(cpfRegex, 'CPF inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export const esqueciSenhaSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

export const redefinirSenhaSchema = z.object({
  token: z.string().min(1, 'Token obrigatório'),
  // Política de senha central (utils/senha): 10+, ou 8+ com letra e número.
  senha: schemaSenha(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type MotoristaLoginInput = z.infer<typeof motoristaLoginSchema>;
