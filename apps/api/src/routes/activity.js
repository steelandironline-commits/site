import { Router } from 'express';
import { activityQuerySchema } from '@autopix/shared';
import { parse } from '../middleware/validate.js';
import { requireAuth } from '../middleware/session.js';

export function activityRoutes({ activity, hub }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    const query = parse(activityQuerySchema, req.query);
    res.json(await activity.list(req.user.companyId, query));
  });

  /** Server-Sent Events stream of the company's activity. */
  r.get('/stream', async (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 5000\n\n');

    const companyId = req.user.companyId;
    const send = (event) => {
      res.write(`id: ${event.id}\nevent: activity\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // Replay what the client missed (Last-Event-ID) before going live.
    const lastId = req.get('last-event-id');
    if (lastId) {
      const last = await activity.getById(String(lastId).slice(0, 64));
      if (last && last.companyId === companyId) {
        for (const e of await activity.since(companyId, last.createdAt)) send(e);
      }
    }

    const unsubscribe = hub.subscribe(companyId, send);
    res.write(`event: ready\ndata: ${JSON.stringify({ mode: hub.mode })}\n\n`);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return r;
}
