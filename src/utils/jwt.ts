import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type Papel = 'admin' | 'gestor';
export type PrincipalTipo = 'usuario' | 'motorista';

// Gestor/admin do dashboard.
export interface UsuarioTokenPayload {
  sub: string; // id do usuário
  tipo: 'usuario';
  email: string;
  papel: Papel;
}

// Motorista autenticado no app (CPF + senha).
export interface MotoristaTokenPayload {
  sub: string; // id do motorista
  tipo: 'motorista';
  cpf: string;
}

export type AccessTokenPayload = UsuarioTokenPayload | MotoristaTokenPayload;

interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  tipo: PrincipalTipo;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function signRefreshToken(subjectId: string, tipo: PrincipalTipo): string {
  const payload: RefreshTokenPayload = { sub: subjectId, type: 'refresh', tipo };
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Token não é um refresh token');
  }
  return decoded;
}
