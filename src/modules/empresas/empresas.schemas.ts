import { z } from 'zod';
import { EMPRESA_PLANO } from '../../domain/status';

const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

// Backoffice: a equipe da plataforma cadastra uma empresa-cliente + o 1º
// usuário admin dela (após fechar contrato). Não é self-service.
export const criarEmpresaSchema = z.object({
  empresaNome: z.string().trim().min(2, 'Nome da empresa obrigatório').max(180),
  // CNPJ é opcional; string vazia conta como ausente.
  cnpj: z.string().trim().regex(cnpjRegex, 'CNPJ inválido').optional().or(z.literal('')),
  plano: z.enum(['trial', 'ativo']).optional(),
  adminNome: z.string().trim().min(2, 'Nome do responsável obrigatório').max(150),
  adminEmail: z.string().trim().email('E-mail inválido'),
  adminSenha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres').max(200),
});

export type CriarEmpresaInput = z.infer<typeof criarEmpresaSchema>;

// Edição dos dados de uma empresa-cliente (tudo opcional — atualiza só o enviado).
export const atualizarEmpresaSchema = z
  .object({
    nome: z.string().trim().min(2, 'Nome da empresa obrigatório').max(180).optional(),
    // string vazia limpa o CNPJ; ausente = não mexe.
    cnpj: z.string().trim().regex(cnpjRegex, 'CNPJ inválido').optional().or(z.literal('')),
    plano: z.enum(EMPRESA_PLANO).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar' });

export type AtualizarEmpresaInput = z.infer<typeof atualizarEmpresaSchema>;

// Redefinição de senha de um usuário da empresa (cliente esqueceu a senha).
export const redefinirSenhaSchema = z.object({
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres').max(200),
});

export type RedefinirSenhaInput = z.infer<typeof redefinirSenhaSchema>;
