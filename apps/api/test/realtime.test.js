import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma, ActivityService } from '@autopix/core';
import { setupApp, resetDb, createActiveUser, hasDb, STRONG_PASSWORD } from './helpers.js';
import { ActivityHub } from '../src/realtime/activityHub.js';
import { createApp } from '../src/app.js';

describe.skipIf(!hasDb)('realtime activity stream (SSE over LISTEN/NOTIFY)', () => {
  let ctx;
  let hub;
  let server;
  let base;

  beforeAll(async () => {
    ctx = await setupApp();
    await resetDb(ctx.prisma);
    hub = await new ActivityHub({ activity: ctx.services.activity, databaseUrl: process.env.DATABASE_URL }).start();
    const app = createApp({ services: ctx.services, hub, serveWeb: false });
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    server?.close();
    await hub?.stop();
    await disconnectPrisma();
  });

  it('pushes newly stored events to the subscribed company only', async () => {
    const { email, companyId } = await createActiveUser(ctx.app);
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'autopix' },
      body: JSON.stringify({ email, password: STRONG_PASSWORD }),
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    expect(hub.mode).toBe('listen');

    const controller = new AbortController();
    const res = await fetch(`${base}/api/activity/stream`, { headers: { Cookie: cookie }, signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    const waitFor = async (needle) => {
      const deadline = Date.now() + 8000;
      while (!buffer.includes(needle)) {
        if (Date.now() > deadline) throw new Error(`timeout waiting for ${needle}; got ${buffer}`);
        const { value } = await reader.read();
        buffer += decoder.decode(value);
      }
    };
    await waitFor('event: ready');

    // An event for another company must not leak.
    const other = await createActiveUser(ctx.app);
    const svc = new ActivityService({ prisma: ctx.prisma });
    await svc.record({ companyId: other.companyId, type: 'SYSTEM', title: 'Evento de outra empresa' });
    await svc.record({ companyId, type: 'OPPORTUNITY', title: 'Oportunidade criada', severity: 'SUCCESS' });
    await waitFor('Oportunidade criada');
    expect(buffer).not.toContain('Evento de outra empresa');
    controller.abort();
  });
});
