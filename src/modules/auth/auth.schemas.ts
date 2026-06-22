import { z } from 'zod';

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
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type MotoristaLoginInput = z.infer<typeof motoristaLoginSchema>;
