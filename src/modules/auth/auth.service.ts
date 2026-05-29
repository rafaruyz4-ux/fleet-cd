import { AppError } from '../../errors/AppError';
import { queryOne } from '../../db/pool';
import { verifyPassword } from '../../utils/password';
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
  return { sub: row.id, tipo: 'usuario', email: row.email, papel: row.papel };
}

export async function login(email: string, senha: string): Promise<UsuarioAuthResult> {
  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, ativo FROM usuarios WHERE email = $1',
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

export async function getById(id: string): Promise<UsuarioPublico> {
  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, ativo FROM usuarios WHERE id = $1',
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

function motoristaPayload(row: { id: string; cpf: string }): MotoristaTokenPayload {
  return { sub: row.id, tipo: 'motorista', cpf: row.cpf };
}

// Normaliza CPF para só dígitos (a coluna pode estar com ou sem pontuação).
const CPF_DIGITS = `regexp_replace(cpf, '\\D', '', 'g')`;

export async function loginMotorista(cpf: string, senha: string): Promise<MotoristaAuthResult> {
  const cpfDigits = cpf.replace(/\D/g, '');
  const motorista = await queryOne<MotoristaAuthRow>(
    `SELECT id, nome, cpf, senha_hash, ativo FROM motoristas WHERE ${CPF_DIGITS} = $1`,
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
    const row = await queryOne<{ id: string; cpf: string; senha_hash: string | null; ativo: boolean }>(
      'SELECT id, cpf, senha_hash, ativo FROM motoristas WHERE id = $1',
      [payload.sub],
    );
    if (!row || !row.ativo || !row.senha_hash) {
      throw AppError.unauthorized('Motorista não encontrado ou sem acesso');
    }
    return { accessToken: signAccessToken(motoristaPayload(row)) };
  }

  const usuario = await queryOne<UsuarioRow>(
    'SELECT id, nome, email, senha_hash, papel, ativo FROM usuarios WHERE id = $1',
    [payload.sub],
  );
  if (!usuario || !usuario.ativo) {
    throw AppError.unauthorized('Usuário não encontrado ou inativo');
  }
  return { accessToken: signAccessToken(usuarioPayload(usuario)) };
}
