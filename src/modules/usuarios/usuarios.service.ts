import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { MontadorUpdate } from '../../db/sql';
import { hashPassword, verifyPassword } from '../../utils/password';
import type { AtualizarUsuarioInput, CriarUsuarioInput } from './usuarios.schemas';

// Gestão de usuários do PRÓPRIO tenant. Toda função recebe o empresaId do
// principal autenticado (tenantId) e NUNCA enxerga usuários de outra empresa.

export interface UsuarioTenant {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'gestor';
  ativo: boolean;
  criado_em: string;
}

const COLS = 'id, nome, email, papel, ativo, criado_em';

export async function listar(empresaId: string): Promise<UsuarioTenant[]> {
  // Contas de super admin (equipe da plataforma) não aparecem para o cliente,
  // mesmo que estejam vinculadas à mesma empresa (caso da empresa padrão).
  return query<UsuarioTenant>(
    `SELECT ${COLS} FROM usuarios
     WHERE empresa_id = $1 AND super_admin = FALSE
     ORDER BY criado_em`,
    [empresaId],
  );
}

export async function criar(empresaId: string, input: CriarUsuarioInput): Promise<UsuarioTenant> {
  const email = input.email.toLowerCase();

  // Mensagem amigável antes da constraint UNIQUE (o e-mail é único no sistema
  // inteiro, pois é a chave de login).
  const emUso = await queryOne<{ id: string }>('SELECT id FROM usuarios WHERE email = $1', [email]);
  if (emUso) {
    throw AppError.conflict('Este e-mail já está em uso por outro usuário');
  }

  const senhaHash = await hashPassword(input.senha);
  const criado = await queryOne<UsuarioTenant>(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id, super_admin)
     VALUES ($1, $2, $3, $4, $5, FALSE)
     RETURNING ${COLS}`,
    [input.nome, email, senhaHash, input.papel, empresaId],
  );
  return criado!;
}

// Busca o usuário-alvo garantindo a trava de tenant. Contas de super admin
// não podem ser gerenciadas pelo cliente.
async function buscarAlvo(empresaId: string, usuarioId: string): Promise<UsuarioTenant> {
  const alvo = await queryOne<UsuarioTenant>(
    `SELECT ${COLS} FROM usuarios
     WHERE id = $1 AND empresa_id = $2 AND super_admin = FALSE`,
    [usuarioId, empresaId],
  );
  if (!alvo) {
    throw AppError.notFound('Usuário não encontrado nesta empresa');
  }
  return alvo;
}

async function contarOutrosAdminsAtivos(empresaId: string, exceto: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM usuarios
     WHERE empresa_id = $1 AND papel = 'admin' AND ativo = TRUE
       AND super_admin = FALSE AND id <> $2`,
    [empresaId, exceto],
  );
  return row?.n ?? 0;
}

/**
 * Edita papel e/ou status (ativo) de um usuário da empresa. Travas:
 *  - o admin não pode se rebaixar nem se desativar (evita se trancar fora);
 *  - a empresa nunca fica sem NENHUM admin ativo (o último é protegido).
 * A desativação vale no login/refresh na hora (checagem direta no banco);
 * um access token já emitido expira sozinho em até 15 min.
 */
export async function atualizar(
  empresaId: string,
  usuarioId: string,
  executorId: string,
  input: AtualizarUsuarioInput,
): Promise<UsuarioTenant> {
  const alvo = await buscarAlvo(empresaId, usuarioId);

  const rebaixando = input.papel === 'gestor' && alvo.papel === 'admin';
  const desativando = input.ativo === false && alvo.ativo;

  if (usuarioId === executorId && (rebaixando || desativando)) {
    throw AppError.badRequest(
      'Você não pode desativar nem rebaixar a sua própria conta. Peça a outro administrador.',
    );
  }

  // Protege o último admin ativo: sem ele, ninguém mais gerencia a conta.
  if (alvo.papel === 'admin' && alvo.ativo && (rebaixando || desativando)) {
    const outros = await contarOutrosAdminsAtivos(empresaId, usuarioId);
    if (outros === 0) {
      throw AppError.badRequest(
        'A empresa precisa de ao menos um administrador ativo. Promova outro usuário antes.',
      );
    }
  }

  const u = new MontadorUpdate();
  if (input.papel !== undefined) u.set('papel', input.papel);
  if (input.ativo !== undefined) u.set('ativo', input.ativo);
  if (u.vazio) return alvo;

  const idPh = u.ph(usuarioId);
  const empPh = u.ph(empresaId);
  const atualizado = await queryOne<UsuarioTenant>(
    `UPDATE usuarios SET ${u.sql} WHERE id = ${idPh} AND empresa_id = ${empPh} RETURNING ${COLS}`,
    u.valores,
  );
  return atualizado!;
}

/** Troca a PRÓPRIA senha (qualquer papel): valida a senha atual antes. */
export async function trocarMinhaSenha(
  usuarioId: string,
  senhaAtual: string,
  novaSenha: string,
): Promise<void> {
  const row = await queryOne<{ senha_hash: string }>(
    'SELECT senha_hash FROM usuarios WHERE id = $1',
    [usuarioId],
  );
  if (!row) {
    throw AppError.notFound('Usuário não encontrado');
  }
  const ok = await verifyPassword(senhaAtual, row.senha_hash);
  if (!ok) {
    throw AppError.badRequest('Senha atual incorreta');
  }
  const hash = await hashPassword(novaSenha);
  await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [hash, usuarioId]);
}
