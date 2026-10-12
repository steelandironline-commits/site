/** Application error with a safe, user-facing message (pt-BR). */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message = 'Requisição inválida.', details) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Sua sessão expirou. Entre novamente.') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Você não tem permissão para esta ação.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Recurso não encontrado.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message = 'Conflito com o estado atual.') => new AppError(409, 'CONFLICT', message);
export const gone = (message = 'Este link expirou.') => new AppError(410, 'GONE', message);
export const unavailable = (message = 'Serviço indisponível no momento.') => new AppError(503, 'UNAVAILABLE', message);
