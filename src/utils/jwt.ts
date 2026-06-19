import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type Papel = 'admin' | 'gestor';
export type PrincipalTipo = 'usuario' | 'motorista';

// Gestor/admin do dashboard.
export interface UsuarioTokenPayload {
  sub: string; // id do usuário
  tipo: 'usuario';
  empresaId: string; // tenant: empresa à qual o usuário pertence
  email: string;
  papel: Papel;
  superAdmin: boolean; // equipe da plataforma (backoffice: cria/lista empresas)
}

// Motorista autenticado no app (CPF + senha).
export interface MotoristaTokenPayload {
  sub: string; // id do motorista
  tipo: 'motorista';
  empresaId: string; // tenant: empresa à qual o motorista pertence
  cpf: string;
}

export type AccessTokenPayload = UsuarioTokenPayload | MotoristaTokenPayload;

interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  tipo: PrincipalTipo;
}

// Identidade do emissor: fixada na assinatura e exigida na verificação, para
// que um token de outro sistema/segredo trocado não seja aceito por engano.
const ISSUER = 'fleet-cd';
const ALGORITHMS: jwt.Algorithm[] = ['HS256'];

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
    algorithm: 'HS256',
    issuer: ISSUER,
  } as SignOptions);
}

// Token de dispositivo: access token de motorista com validade longa, para
// apps de rastreio que postam GPS em 2º plano sem ciclo de refresh.
// Assinado com o mesmo segredo do access token → validado por requireAuth.
export function signDeviceToken(payload: MotoristaTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.deviceTtl,
    algorithm: 'HS256',
    issuer: ISSUER,
  } as SignOptions);
}

export function signRefreshToken(subjectId: string, tipo: PrincipalTipo): string {
  const payload: RefreshTokenPayload = { sub: subjectId, type: 'refresh', tipo };
  return jwt.sign(payload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
    algorithm: 'HS256',
    issuer: ISSUER,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.jwt.accessSecret, {
    algorithms: ALGORITHMS,
    issuer: ISSUER,
  }) as AccessTokenPayload & { type?: string };
  // Um refresh token nunca pode passar como access token, mesmo que algum dia
  // os segredos sejam configurados iguais por engano.
  if (decoded.type === 'refresh') {
    throw new Error('Refresh token não é aceito como token de acesso');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.jwt.refreshSecret, {
    algorithms: ALGORITHMS,
    issuer: ISSUER,
  }) as RefreshTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Token não é um refresh token');
  }
  return decoded;
}
