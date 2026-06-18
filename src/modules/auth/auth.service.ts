import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { queryOne, withTransaction } from '../../db/pool';
import { hashPassword, verifyPassword } from '../../utils/password';
import type { SignupInput } from './auth.schemas';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type MotoristaTokenPayload,
  type UsuarioTokenPayload,
} from '../../utils/jwt';

// ---------------------------------------------------------------------
// Gestores do dashboard (usuarios)
// ---------------------------------------------------------------------
interface UsuarioRow {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: 'admin' | 'gestor';
  empresa_id: string;
  ativo: boolean;
}

export interface UsuarioPublico {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'gestor';
}

interface UsuarioAuthResult {
  usuario: UsuarioPublico;
  accessToken: string;
  refreshToken: string;
}

function usuarioToPublico(row: UsuarioRow): UsuarioPublico {
  return { id: row.id, nome: row.nome, email: row.email, papel: row.papel };
}

function usuarioPayload(row: UsuarioRow): UsuarioTokenPayload {
  return { sub: row.id, tipo: 'usuario', empresaId: row.empresa_id, email: row.email, papel: row.papel };
}

export async function login(email: string, senha: string): Promise<UsuarioAuthResult> {
  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, empresa_id, ativo FROM usuarios WHERE email = $1',
    [email.toLowerCase()],
  );

  // Mensagem genérica para não revelar se o e-mail existe.
  const credenciaisInvalidas = AppError.unauthorized('E-mail ou senha inválidos');
  if (!usuario || !usuario.ativo) {
    throw credenciaisInvalidas;
  }

  const ok = await verifyPassword(senha, usuario.senha_hash);
  if (!ok) {
    throw credenciaisInvalidas;
  }

  return {
    usuario: usuarioToPublico(usuario),
    accessToken: signAccessToken(usuarioPayload(usuario)),
    refreshToken: signRefreshToken(usuario.id, 'usuario'),
  };
}

// ---------------------------------------------------------------------
// Cadastro self-service de empresa (tenant) + 1º usuário admin
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

export async function signup(input: SignupInput): Promise<UsuarioAuthResult> {
  const email = input.email.toLowerCase();
  // CNPJ é opcional; guardamos só os dígitos (ou null se não informado).
  const cnpj = input.cnpj ? input.cnpj.replace(/\D/g, '') : null;

  return withTransaction(async (client) => {
    // Mensagens amigáveis antes de bater nas constraints do banco.
    const emailEmUso = await client.query('SELECT 1 FROM usuarios WHERE email = $1', [email]);
    if (emailEmUso.rowCount && emailEmUso.rowCount > 0) {
      throw AppError.conflict('Este e-mail já está cadastrado');
    }
    if (cnpj) {
      const cnpjEmUso = await client.query('SELECT 1 FROM empresas WHERE cnpj = $1', [cnpj]);
      if (cnpjEmUso.rowCount && cnpjEmUso.rowCount > 0) {
        throw AppError.conflict('Já existe uma empresa com este CNPJ');
      }
    }

    const slug = await slugLivre(slugify(input.empresaNome), client);
    const empresa = await client.query<{ id: string }>(
      `INSERT INTO empresas (nome, cnpj, slug, plano)
       VALUES ($1, $2, $3, 'trial') RETURNING id`,
      [input.empresaNome, cnpj, slug],
    );
    const empresaId = empresa.rows[0]!.id;

    const senhaHash = await hashPassword(input.senha);
    const usuario = await client.query<UsuarioRow>(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, nome, email, senha_hash, papel, empresa_id, ativo`,
      [input.nome, email, senhaHash, empresaId],
    );
    const row = usuario.rows[0]!;

    return {
      usuario: usuarioToPublico(row),
      accessToken: signAccessToken(usuarioPayload(row)),
      refreshToken: signRefreshToken(row.id, 'usuario'),
    };
  });
}

export async function getById(id: string): Promise<UsuarioPublico> {
  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, empresa_id, ativo FROM usuarios WHERE id = $1',
    [id],
  );
  if (!usuario) {
    throw AppError.notFound('Usuário não encontrado');
  }
  return usuarioToPublico(usuario);
}

// ---------------------------------------------------------------------
// Motoristas (app — CPF + senha)
// ---------------------------------------------------------------------
interface MotoristaAuthRow {
  id: string;
  nome: string;
  cpf: string;
  senha_hash: string | null;
  empresa_id: string;
  ativo: boolean;
}

export interface MotoristaPublico {
  id: string;
  nome: string;
  cpf: string;
  categoria_cnh: string | null;
  telefone: string | null;
}

interface MotoristaAuthResult {
  motorista: MotoristaPublico;
  accessToken: string;
  refreshToken: string;
}

function motoristaPayload(row: { id: string; cpf: string; empresa_id: string }): MotoristaTokenPayload {
  return { sub: row.id, tipo: 'motorista', empresaId: row.empresa_id, cpf: row.cpf };
}

// Normaliza CPF para só dígitos (a coluna pode estar com ou sem pontuação).
const CPF_DIGITS = `regexp_replace(cpf, '\\D', '', 'g')`;

export async function loginMotorista(cpf: string, senha: string): Promise<MotoristaAuthResult> {
  const cpfDigits = cpf.replace(/\D/g, '');
  const motorista = await queryOne<MotoristaAuthRow>(
    `SELECT id, nome, cpf, senha_hash, empresa_id, ativo FROM motoristas WHERE ${CPF_DIGITS} = $1`,
    [cpfDigits],
  );

  const credenciaisInvalidas = AppError.unauthorized('CPF ou senha inválidos');
  // Sem senha_hash => motorista ainda não recebeu acesso ao app.
  if (!motorista || !motorista.ativo || !motorista.senha_hash) {
    throw credenciaisInvalidas;
  }

  const ok = await verifyPassword(senha, motorista.senha_hash);
  if (!ok) {
    throw credenciaisInvalidas;
  }

  return {
    motorista: await getMotoristaById(motorista.id),
    accessToken: signAccessToken(motoristaPayload(motorista)),
    refreshToken: signRefreshToken(motorista.id, 'motorista'),
  };
}

export async function getMotoristaById(id: string): Promise<MotoristaPublico> {
  const motorista = await queryOne<MotoristaPublico>(
    'SELECT id, nome, cpf, categoria_cnh, telefone FROM motoristas WHERE id = $1',
    [id],
  );
  if (!motorista) {
    throw AppError.notFound('Motorista não encontrado');
  }
  return motorista;
}

// ---------------------------------------------------------------------
// Refresh (trata gestor e motorista conforme o tipo do refresh token)
// ---------------------------------------------------------------------
export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  let payload: { sub: string; tipo: 'usuario' | 'motorista' };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw AppError.unauthorized('Refresh token inválido ou expirado');
  }

  if (payload.tipo === 'motorista') {
    const row = await queryOne<{ id: string; cpf: string; senha_hash: string | null; empresa_id: string; ativo: boolean }>(
      'SELECT id, cpf, senha_hash, empresa_id, ativo FROM motoristas WHERE id = $1',
      [payload.sub],
    );
    if (!row || !row.ativo || !row.senha_hash) {
      throw AppError.unauthorized('Motorista não encontrado ou sem acesso');
    }
    return { accessToken: signAccessToken(motoristaPayload(row)) };
  }

  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, empresa_id, ativo FROM usuarios WHERE id = $1',
    [payload.sub],
  );
  if (!usuario || !usuario.ativo) {
    throw AppError.unauthorized('Usuário não encontrado ou inativo');
  }
  return { accessToken: signAccessToken(usuarioPayload(usuario)) };
}
