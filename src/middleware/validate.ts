import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../errors/AppError';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Valida e normaliza body/params/query com schemas Zod.
 * Em caso de erro, lança AppError 400 com os detalhes de cada campo.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      if (schemas.query) {
        // req.query não é reatribuível em alguns setups; mutamos no lugar.
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        throw AppError.badRequest('Dados inválidos', err.flatten().fieldErrors);
      }
      throw err;
    }
  };
}
