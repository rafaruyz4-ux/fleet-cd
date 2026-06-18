import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, withTransaction } from '../../db/pool';
import { hashPassword } from '../../utils/password';
import type { CriarEmpresaInput } from './empresas.schemas';

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
