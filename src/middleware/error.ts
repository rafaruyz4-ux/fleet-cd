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
  // Não devolvemos detail/constraint crus ao cliente (revelam tabela/coluna);
  // a constraint vai só para o log.
  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    console.warn('[error] violação de unicidade:', pgErr.constraint ?? pgErr.detail);
    res.status(409).json({ error: 'Registro duplicado' });
    return;
  }

  console.error('[error] não tratado:', err);
  // Só expõe a mensagem interna em desenvolvimento explícito. Se NODE_ENV
  // estiver ausente/mal configurado num deploy, NÃO vaza (fecha por padrão).
  const expoeDetalhe = env.nodeEnv === 'development';
  res.status(500).json({
    error: 'Erro interno do servidor',
    ...(expoeDetalhe ? { details: err instanceof Error ? err.message : String(err) } : {}),
  });
}
