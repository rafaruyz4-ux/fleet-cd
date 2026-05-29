import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../errors/AppError';

/** Handler 404 para rotas não mapeadas. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
}

interface PgError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/** Middleware central de tratamento de erros. Deve ser o último registrado. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }

  // Violação de unicidade do Postgres -> 409.
  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    res.status(409).json({
      error: 'Registro duplicado',
      details: pgErr.detail ?? pgErr.constraint,
    });
    return;
  }

  console.error('[error] não tratado:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(env.isProduction ? {} : { details: err instanceof Error ? err.message : String(err) }),
  });
}
