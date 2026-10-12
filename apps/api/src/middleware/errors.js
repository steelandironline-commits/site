import { ZodError } from 'zod';
import { logger } from '@autopix/core';

export function notFoundApi(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
}

/** Never leaks stack traces or internal messages. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Verifique os campos destacados.', fields } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Requisição inválida.' } });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Requisição muito grande.' } });
  }
  if (err?.expose && err.status && err.status < 500) {
    return res.status(err.status).json({ error: { code: err.code || 'ERROR', message: err.message, details: err.details } });
  }
  if (err?.expose && err.status) {
    return res.status(err.status).json({ error: { code: err.code || 'ERROR', message: err.message } });
  }
  logger.error('unhandled error', { err, path: req.path, method: req.method });
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Não foi possível executar esta ação.' } });
}
