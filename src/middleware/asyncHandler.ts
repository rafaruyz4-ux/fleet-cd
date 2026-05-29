import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Envolve um handler async para que rejeições virem next(err)
 * e cheguem ao middleware de erros (Express 4 não captura isso sozinho).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
