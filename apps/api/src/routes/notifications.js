import { Router } from 'express';
import { z } from 'zod';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from '@autopix/shared';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

export function notificationRoutes({ preferences, push }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/preferences', async (req, res) => {
    res.json({ preferences: await preferences.matrix(req.user.id), channels: NOTIFICATION_CHANNELS, categories: NOTIFICATION_CATEGORIES });
  });

  r.put('/preferences', async (req, res) => {
    const { changes } = parse(
      z.object({
        changes: z
          .array(z.object({ channel: z.enum(NOTIFICATION_CHANNELS), category: z.enum(NOTIFICATION_CATEGORIES), enabled: z.boolean() }))
          .min(1)
          .max(24),
      }),
      req.body,
    );
    res.json({ preferences: await preferences.update(req.user.id, changes) });
  });

  r.get('/push/public-key', (req, res) => {
    res.json({ publicKey: push.publicKey() });
  });

  r.post('/push/subscriptions', async (req, res) => {
    const sub = parse(
      z.object({
        endpoint: z.string().url().max(1000),
        keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
      }),
      req.body,
    );
    await push.subscribe(req.user.id, { ...sub, userAgent: req.get('user-agent')?.slice(0, 300) });
    res.status(201).json({ subscribed: true });
  });

  r.delete('/push/subscriptions', async (req, res) => {
    const { endpoint } = parse(z.object({ endpoint: z.string().url().max(1000) }), req.body);
    await push.unsubscribe(req.user.id, endpoint);
    res.json({ unsubscribed: true });
  });

  return r;
}
