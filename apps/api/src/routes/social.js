import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/session.js';
import { parse } from '../middleware/validate.js';

export function socialRoutes({ social }) {
  const r = Router();
  r.use(requireAuth);
  const cursor = req => parse(z.object({ cursor: z.string().max(64).optional() }), req.query).cursor;
  r.get('/posts', async (req, res) => res.json(await social.list({ user: req.user, cursor: cursor(req) })));
  r.get('/eligible', async (req, res) => res.json(await social.eligible({ user: req.user, company: { id: req.user.companyId } })));
  r.get('/posts/:id/comments', async (req, res) => res.json(await social.comments({ user: req.user, postId: req.params.id, cursor: cursor(req) })));
  r.get('/posts/:id/photo', async (req, res) => {
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(await social.image(req.params.id));
  });
  return r;
}
