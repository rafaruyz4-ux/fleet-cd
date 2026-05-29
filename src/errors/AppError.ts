/** Erro de aplicação com status HTTP — tratado pelo middleware de erros. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, message, details);
  }

  static unauthorized(message = 'Não autenticado'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'Acesso negado'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Recurso não encontrado'): AppError {
    return new AppError(404, message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, message);
  }
}
