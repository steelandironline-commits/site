import { Router } from 'express';
import express from 'express';
import { logger } from '@autopix/core';

/**
 * POST /api/webhooks/payment/:provider  (e.g. /payment/banco-do-brasil)
 * Mounted with a raw body parser so signatures are checked on exact bytes.
 * Idempotent: (provider, providerEventId) is unique; the body is never logged.
 */
export function webhookRoutes({ payments }) {
  const r = Router();
  // BACEN Pix webhooks are delivered to `<registered url>/pix` → same handler.
  r.post(['/payment/:provider', '/payment/:provider/pix'], express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    let body = {};
    try {
      body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      body = {};
    }
    const provider = String(req.params.provider).toLowerCase();
    const result = await payments.processWebhook(provider, { headers: req.headers, rawBody, body, query: req.query });
    logger.info('payment webhook processed', { provider, results: result.results.map((x) => Object.keys(x)) });
    res.json({ received: true });
  });
  return r;
}
