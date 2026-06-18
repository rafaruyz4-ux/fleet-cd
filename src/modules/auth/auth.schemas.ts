import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken obrigatório'),
});

const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

// Cadastro self-service: cria a EMPRESA (tenant) + o 1º usuário admin dela.
export const signupSchema = z.object({
  empresaNome: z.string().trim().min(2, 'Nome da empresa obrigatório').max(180),
  // CNPJ é opcional no cadastro (trial); string vazia conta como ausente.
  cnpj: z
    .string()
    .trim()
    .regex(cnpjRegex, 'CNPJ inválido')
    .optional()
    .or(z.literal('')),
  nome: z.string().trim().min(2, 'Seu nome é obrigatório').max(150),
  email: z.string().trim().email('E-mail inválido'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres').max(200),
});

const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

export const motoristaLoginSchema = z.object({
  cpf: z.string().regex(cpfRegex, 'CPF inválido'),
  senha: z.string().min(1, 'Senha obrigatória'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type MotoristaLoginInput = z.infer<typeof motoristaLoginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
