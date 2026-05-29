import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken, type AccessTokenPayload, type Papel } from '../utils/jwt';

// Anexa o principal autenticado (gestor ou motorista) ao request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/** Exige um access token JWT válido no header Authorization: Bearer <token>. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Token de acesso ausente');
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw AppError.unauthorized('Token de acesso inválido ou expirado');
  }
}

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
