import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken, type AccessTokenPayload, type Papel } from '../utils/jwt';
import { asyncHandler } from './asyncHandler';
import {
  empresaBloqueada,
  erroAssinaturaSuspensa,
  motoristaEstaAtivo,
  statusDaEmpresa,
} from './acesso';

// Anexa o principal autenticado (gestor ou motorista) ao request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Devolve o id da empresa (tenant) do principal autenticado.
 * É a chave de isolamento: TODA query de domínio deve filtrar por este id.
 * Lança 401 se não houver principal (rota sem requireAuth antes).
 */
export function tenantId(req: Request): string {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.empresaId;
}

// Rotas que continuam acessíveis com a assinatura suspensa/cancelada: a área
// de assinatura (o cliente precisa conseguir pagar/reativar) e a de auth
// (login/refresh/me — o bloqueio fino de motorista é feito no auth.service).
const BASES_LIBERADAS_COM_ASSINATURA_SUSPENSA = ['/api/assinatura', '/api/auth'];

/**
 * Exige um access token JWT válido no header Authorization: Bearer <token>.
 * Além do JWT, valida (com cache de ~60s, ver acesso.ts):
 *  - motorista ainda ativo — revoga na prática o device token de 365 dias;
 *  - assinatura da empresa — suspensa/cancelada só acessa a área de assinatura.
 */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Token de acesso ausente');
  }

  const token = header.slice('Bearer '.length).trim();
  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw AppError.unauthorized('Token de acesso inválido ou expirado');
  }

  // Motorista demitido (soft delete) não usa mais o sistema, mesmo com device
  // token válido por assinatura/prazo.
  if (payload.tipo === 'motorista' && !(await motoristaEstaAtivo(payload.sub))) {
    throw AppError.unauthorized('Motorista inativo ou sem acesso');
  }

  // Empresa suspensa/cancelada/inativa: bloqueia tudo, exceto as rotas
  // liberadas acima. Super admin (backoffice da plataforma) não é bloqueado.
  const superAdmin = payload.tipo === 'usuario' && payload.superAdmin;
  if (!superAdmin) {
    const status = await statusDaEmpresa(payload.empresaId);
    const rotaLiberada = BASES_LIBERADAS_COM_ASSINATURA_SUSPENSA.some(
      (base) => req.baseUrl === base || req.baseUrl.startsWith(`${base}/`),
    );
    if (empresaBloqueada(status) && !rotaLiberada) {
      throw erroAssinaturaSuspensa();
    }
  }

  req.user = payload;
  next();
});

/** Exige que o principal seja um usuário do dashboard (gestor/admin). */
export function requireUsuario(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  if (req.user.tipo !== 'usuario') {
    throw AppError.forbidden('Endpoint exclusivo de gestores');
  }
  next();
}

/** Exige que o principal seja um motorista (app). */
export function requireMotorista(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  if (req.user.tipo !== 'motorista') {
    throw AppError.forbidden('Endpoint exclusivo de motoristas');
  }
  next();
}

/** Exige que o principal seja um super admin (equipe da plataforma/backoffice). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized();
  }
  if (user.tipo !== 'usuario' || !user.superAdmin) {
    throw AppError.forbidden('Área restrita à equipe da plataforma');
  }
  next();
}

/** Exige um usuário do dashboard com um dos papéis informados. */
export function requireRole(...papeis: Papel[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) {
      throw AppError.unauthorized();
    }
    if (user.tipo !== 'usuario' || !papeis.includes(user.papel)) {
      throw AppError.forbidden('Você não tem permissão para esta ação');
    }
    next();
  };
}
