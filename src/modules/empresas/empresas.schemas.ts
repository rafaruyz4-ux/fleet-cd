import { z } from 'zod';

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
