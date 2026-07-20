import { z } from 'zod';

// Gestão de usuários do PRÓPRIO tenant (admin da empresa-cliente).
// Diferente do backoffice (empresas.schemas), aqui tudo é limitado à empresa
// do usuário autenticado.

const papel = z.enum(['admin', 'gestor']);
const senha = z.string().min(8, 'A senha precisa ter ao menos 8 caracteres').max(200);

// Criação de usuário pelo admin da empresa. A senha inicial é digitada/gerada
// no dashboard e mostrada UMA vez (mesmo padrão do backoffice: sem e-mail de
// convite — o admin repassa o acesso).
export const criarUsuarioSchema = z.object({
  nome: z.string().trim().min(2, 'Nome obrigatório').max(150),
  email: z.string().trim().email('E-mail inválido').max(180),
  papel,
  senha,
});

export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>;

// Edição: papel e/ou ativo (desativar/reativar é soft — a linha permanece).
export const atualizarUsuarioSchema = z
  .object({
    papel: papel.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => v.papel !== undefined || v.ativo !== undefined, {
    message: 'Nada para atualizar',
  });

export type AtualizarUsuarioInput = z.infer<typeof atualizarUsuarioSchema>;

// Troca da PRÓPRIA senha (qualquer papel): exige a senha atual.
export const trocarMinhaSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: senha,
});

export type TrocarMinhaSenhaInput = z.infer<typeof trocarMinhaSenhaSchema>;

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });
