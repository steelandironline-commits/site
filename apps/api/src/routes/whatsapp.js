import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { logger } from '@autopix/core';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

/** Account linking (authenticated). */
export function whatsappRoutes({ whatsappConnections, whatsappProvider, prisma, config }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({
      connection: await whatsappConnections.get(req.user.id),
      provider: whatsappProvider.name,
      available: whatsappProvider.enabled,
      businessNumber: config.whatsapp.businessNumber,
    });
  });

  r.post('/connection', async (req, res) => {
    const { phoneNumber } = parse(z.object({ phoneNumber: z.string().trim().min(8).max(25) }), req.body);
    res.status(201).json(await whatsappConnections.start(req.user, phoneNumber));
  });

  r.delete('/connection', async (req, res) => {
    res.json(await whatsappConnections.revoke(req.user.id));
  });

  r.get('/messages', async (req, res) => {
    const conn = await prisma.whatsAppConnection.findUnique({ where: { userId: req.user.id } });
    const items = conn
      ? await prisma.whatsAppMessage.findMany({
          where: { connectionId: conn.id },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { id: true, direction: true, kind: true, status: true, createdAt: true, error: true },
        })
      : [];
    res.json({ items });
  });

  return r;
}

/** Provider webhook (public, signature-verified). */
export function whatsappWebhookRoutes({ whatsappInbound, whatsappProvider, events }) {
  const r = Router();

  // Meta verification handshake.
  r.get('/whatsapp', (req, res) => {
    const challenge = whatsappProvider.verifySubscription(req.query);
    if (challenge === null) return res.status(403).send('forbidden');
    return res.type('text/plain').send(challenge);
  });

  r.post('/whatsapp', express.raw({ type: '*/*', limit: '512kb' }), async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    let body = {};
    try {
      body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      body = {};
    }
    const results = await whatsappInbound.processWebhook({ headers: req.headers, rawBody, body });
    logger.info('whatsapp webhook processed', { count: results.length });
    events.kick();
    res.json({ received: true });
  });

  return r;
}
