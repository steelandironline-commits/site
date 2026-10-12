import { Router } from 'express';
import { requireAuth } from '../middleware/session.js';
import { runAction } from '../actor.js';

/** Collaborators of a company account (login by their own CPF). */
export function teamRoutes({ team, actions }) {
  const r = Router();
  r.use(requireAuth);

  r.get('/', async (req, res) => {
    res.json({ members: await team.list(req.user.companyId) });
  });

  r.post('/', async (req, res) => {
    res.status(201).json((await runAction(actions, req, 'INVITE_COLLABORATOR', req.body)).result);
  });

  r.delete('/:id', async (req, res) => {
    res.json((await runAction(actions, req, 'REMOVE_COLLABORATOR', { id: req.params.id })).result);
  });

  return r;
}
