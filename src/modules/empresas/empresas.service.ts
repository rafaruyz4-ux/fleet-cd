import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import { hashPassword } from '../../utils/password';
import type { AtualizarEmpresaInput, CriarEmpresaInput } from './empresas.schemas';

// ---------------------------------------------------------------------
// Helpers de slug (identificador curto e único da empresa)
// ---------------------------------------------------------------------

/** Transforma um nome em slug: minúsculo, sem acento, só letras/números/hífen. */
function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Acha um slug livre a partir de uma base (base, base-2, base-3, ...). */
async function slugLivre(base: string, client: PoolClient): Promise<string> {
  const raiz = base || 'empresa';
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? raiz : `${raiz}-${n}`;
    const existe = await client.query('SELECT 1 FROM empresas WHERE slug = $1', [candidato]);
    if (existe.rowCount === 0) return candidato;
  }
}

// ---------------------------------------------------------------------
// Listagem de empresas-clientes (backoffice)
// ---------------------------------------------------------------------
export interface EmpresaResumo {
  id: string;
  nome: string;
  cnpj: string | null;
  slug: string | null;
  plano: string;
  ativo: boolean;
  criado_em: string;
  total_usuarios: number;
}

export async function listar(): Promise<EmpresaResumo[]> {
  return query<EmpresaResumo>(
    `SELECT e.id, e.nome, e.cnpj, e.slug, e.plano, e.ativo, e.criado_em,
            COUNT(u.id)::int AS total_usuarios
       FROM empresas e
       LEFT JOIN usuarios u ON u.empresa_id = e.id
      GROUP BY e.id
      ORDER BY e.criado_em DESC`,
  );
}

// ---------------------------------------------------------------------
// Detalhe de uma empresa-cliente (dados + usuários dela)
// ---------------------------------------------------------------------
export interface EmpresaUsuario {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'gestor';
  ativo: boolean;
}

export interface EmpresaDetalhe {
  id: string;
  nome: string;
  cnpj: string | null;
  slug: string | null;
  plano: string;
  ativo: boolean;
  criado_em: string;
  usuarios: EmpresaUsuario[];
}

export async function obter(id: string): Promise<EmpresaDetalhe> {
  const empresa = await queryOne<Omit<EmpresaDetalhe, 'usuarios'>>(
    'SELECT id, nome, cnpj, slug, plano, ativo, criado_em FROM empresas WHERE id = $1',
    [id],
  );
  if (!empresa) {
    throw AppError.notFound('Empresa não encontrada');
  }
  const usuarios = await query<EmpresaUsuario>(
    'SELECT id, nome, email, papel, ativo FROM usuarios WHERE empresa_id = $1 ORDER BY criado_em',
    [id],
  );
  return { ...empresa, usuarios };
}

// ---------------------------------------------------------------------
// Edição dos dados de uma empresa-cliente
// ---------------------------------------------------------------------
export async function atualizar(id: string, input: AtualizarEmpresaInput): Promise<EmpresaDetalhe> {
  const existe = await queryOne<{ id: string }>('SELECT id FROM empresas WHERE id = $1', [id]);
  if (!existe) {
    throw AppError.notFound('Empresa não encontrada');
  }

  const sets: string[] = [];
  const valores: unknown[] = [];
  let i = 1;

  if (input.nome !== undefined) {
    sets.push(`nome = $${i++}`);
    valores.push(input.nome);
  }
  if (input.plano !== undefined) {
    sets.push(`plano = $${i++}`);
    valores.push(input.plano);
  }
  if (input.ativo !== undefined) {
    sets.push(`ativo = $${i++}`);
    valores.push(input.ativo);
  }
  if (input.cnpj !== undefined) {
    const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : null;
    if (cnpj) {
      const conflito = await queryOne<{ id: string }>(
        'SELECT id FROM empresas WHERE cnpj = $1 AND id <> $2',
        [cnpj, id],
      );
      if (conflito) {
        throw AppError.conflict('Já existe uma empresa com este CNPJ');
      }
    }
    sets.push(`cnpj = $${i++}`);
    valores.push(cnpj);
  }

  if (sets.length > 0) {
    valores.push(id);
    await query(`UPDATE empresas SET ${sets.join(', ')} WHERE id = $${i}`, valores);
  }
  return obter(id);
}

/**
 * Redefine a senha de um usuário da empresa (cliente esqueceu a senha).
 * Só atinge usuário que pertence à própria empresa (trava de tenant).
 */
export async function redefinirSenha(
  empresaId: string,
  usuarioId: string,
  senha: string,
): Promise<void> {
  const usuario = await queryOne<{ id: string }>(
    'SELECT id FROM usuarios WHERE id = $1 AND empresa_id = $2',
    [usuarioId, empresaId],
  );
  if (!usuario) {
    throw AppError.notFound('Usuário não encontrado nesta empresa');
  }
  const senhaHash = await hashPassword(senha);
  await query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [senhaHash, usuarioId]);
}

// ---------------------------------------------------------------------
// Criação de empresa-cliente + 1º usuário admin (após fechar contrato)
// ---------------------------------------------------------------------
export interface EmpresaCriada {
  empresa: { id: string; nome: string; slug: string | null; plano: string };
  admin: { id: string; nome: string; email: string };
}

export async function criar(input: CriarEmpresaInput): Promise<EmpresaCriada> {
  const email = input.adminEmail.toLowerCase();
  // CNPJ é opcional; guardamos só os dígitos (ou null se não informado).
  const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : null;
  const plano = input.plano ?? 'trial';

  return withTransaction(async (client) => {
    // Mensagens amigáveis antes de bater nas constraints do banco.
    const emailEmUso = await client.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (emailEmUso.rowCount && emailEmUso.rowCount > 0) {
      throw AppError.conflict('Este e-mail já está em uso por outro usuário');
    }
    if (cnpj) {
      const cnpjEmUso = await client.query('SELECT 1 FROM empresas WHERE cnpj = $1', [cnpj]);
      if (cnpjEmUso.rowCount && cnpjEmUso.rowCount > 0) {
        throw AppError.conflict('Já existe uma empresa com este CNPJ');
      }
    }

    const slug = await slugLivre(slugify(input.empresaNome), client);
    const empresa = await client.query<{ id: string; nome: string; slug: string | null; plano: string }>(
      `INSERT INTO empresas (nome, cnpj, slug, plano)
       VALUES ($1, $2, $3, $4) RETURNING id, nome, slug, plano`,
      [input.empresaNome, cnpj, slug, plano],
    );
    const empresaRow = empresa.rows[0]!;

    const senhaHash = await hashPassword(input.adminSenha);
    const admin = await client.query<{ id: string; nome: string; email: string }>(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id, super_admin)
       VALUES ($1, $2, $3, 'admin', $4, FALSE)
       RETURNING id, nome, email`,
      [input.adminNome, email, senhaHash, empresaRow.id],
    );

    return { empresa: empresaRow, admin: admin.rows[0]! };
  });
}
