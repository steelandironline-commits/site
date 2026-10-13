import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { disconnectPrisma, hashPassword } from '@autopix/core';
import { setupApp, resetDb, client, hasDb, STRONG_PASSWORD } from './helpers.js';

const PHOTO = 'data:image/jpeg;base64,/9j/2Q==';
describe.skipIf(!hasDb)('Social — confirmed delivery, privacy and interactions', () => {
  let ctx, seller, buyer, stranger;
  beforeAll(async () => { ctx = await setupApp({ DEMO_MODE: 'false' }); });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const passwordHash = await hashPassword(STRONG_PASSWORD);
    const account = async (name) => {
      const company = await ctx.prisma.company.create({ data: { name: `${name} company`,
        subscription: { create: { plan: 'COMMISSION', status: 'ACTIVE', priceCents: 0, provider: 'mock' } } } });
      const user = await ctx.prisma.user.create({ data: { name, companyId: company.id, email: `${name}@example.com`, status: 'ACTIVE', passwordHash } });
      const c = client(ctx.app); expect((await c.post('/api/auth/login', { email: user.email, password: STRONG_PASSWORD })).status).toBe(200);
      return { ...user, company, c };
    };
    seller = await account('seller'); buyer = await account('buyer'); stranger = await account('stranger');
  });
  afterAll(async () => { await disconnectPrisma(); });
  const action = (account, name, input) => account.c.post(`/api/actions/${name}`, { input });
  async function deal({ confirm = true, sandbox = true } = {}) {
    const t = await ctx.services.transactions.create({ user: seller, company: seller.company, grossCents: 100000, description: 'PRIVATE contract address and personal details', buyerEmail: buyer.email });
    await ctx.prisma.marketplaceTransaction.update({ where: { id: t.id }, data: {
      status: 'PAID', sellerCompletedAt: new Date(), buyerConfirmedAt: confirm ? new Date() : null, isSandbox: sandbox,
      payment: { create: { companyId: seller.companyId, idempotencyKey: `social-test-${t.id}`, kind: 'CHARGE', status: 'CONFIRMED', provider: 'mock', amountCents: 100000, paidAt: new Date(), isSandbox: sandbox } },
    } });
    return t;
  }
  const publish = (account, transactionId, extra = {}) => action(account, 'PUBLISH_SOCIAL_POST', { transactionId, body: 'Ótima entrega, tudo no prazo!', photo: PHOTO, ...extra });

  it('blocks publication before buyer confirmation, unrelated users and replay; both parties can publish', async () => {
    const t = await deal({ confirm: false });
    expect((await publish(seller, t.id)).status).toBe(409);
    expect((await seller.c.get('/api/social/eligible')).body.items).toHaveLength(0);
    expect((await action(buyer, 'CONFIRM_COMPLETION', { id: t.id })).status).toBe(200);
    expect((await publish(stranger, t.id)).status).toBe(409);
    const result = await publish(seller, t.id); expect(result.status).toBe(200);
    expect((await publish(seller, t.id)).status).toBe(409);
    expect((await publish(buyer, t.id, { photo: null })).status).toBe(200);
    expect((await seller.c.get('/api/social/eligible')).body.items).toHaveLength(0);
    expect((await ctx.prisma.actionLog.findFirst({ where: { action: 'PUBLISH_SOCIAL_POST', status: 'SUCCEEDED' } })).input.photo).toBe('[redacted]');
  });

  it('publishes only shared content; photos require authentication and persist; simulated posts have no real verified badge', async () => {
    const t = await deal(), r = await publish(seller, t.id); const id = r.body.result.post.id;
    const feed = await stranger.c.get('/api/social/posts'); expect(feed.status).toBe(200);
    expect(feed.body.items[0]).toMatchObject({ authorName: 'seller', verified: false, isSandbox: true, isDemo: false, body: 'Ótima entrega, tudo no prazo!' });
    const json = JSON.stringify(feed.body); expect(json).not.toMatch(/PRIVATE|grossAmount|100000|buyer@example|sellerCompanyId|commissionAmount|data:image/);
    expect((await request(ctx.app).get(`/api/social/posts/${id}/photo`)).status).toBe(401);
    const image = await stranger.c.get(`/api/social/posts/${id}/photo`); expect(image.status).toBe(200); expect(image.headers['content-type']).toContain('image/jpeg');
    expect(await ctx.prisma.socialPost.findUnique({ where: { id }, select: { photo: true } })).toEqual({ photo: PHOTO });
    expect((await publish(buyer, t.id, { photo: 'data:image/svg+xml;base64,AAAA' })).status).toBe(400);
    expect((await publish(buyer, t.id, { photo: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);
    expect((await publish(buyer, t.id, { photo: 'x'.repeat(614451) })).status).toBe(400);
  });

  it('comments, replies and reposts keep the original contract; cannot reply across posts or remove another author’s publication', async () => {
    const t = await deal(), result = await publish(seller, t.id), id = result.body.result.post.id;
    const comment = await action(stranger, 'COMMENT_SOCIAL_POST', { postId: id, body: 'Ficou muito bom!' }); expect(comment.status).toBe(200);
    const parentId = comment.body.result.comment.id;
    expect((await action(seller, 'COMMENT_SOCIAL_POST', { postId: id, parentId, body: 'Obrigado!' })).status).toBe(200);
    expect((await action(stranger, 'REPOST_SOCIAL_POST', { postId: id, body: 'Recomendo este trabalho.' })).status).toBe(200);
    expect((await action(stranger, 'REPOST_SOCIAL_POST', { postId: id })).status).toBe(409);
    const feed = await buyer.c.get('/api/social/posts'); expect(feed.body.items[0].original.id).toBe(id); expect(feed.body.items[0].commentCount).toBe(2);
    const comments = await buyer.c.get(`/api/social/posts/${id}/comments`); expect(comments.body.items[1].parentId).toBe(parentId);
    const t2 = await deal(), p2 = await publish(buyer, t2.id);
    expect((await action(stranger, 'COMMENT_SOCIAL_POST', { postId: p2.body.result.post.id, parentId, body: 'Wrong thread' })).status).toBe(400);
    expect((await action(stranger, 'DELETE_SOCIAL_POST', { id })).status).toBe(403);
    expect((await action(seller, 'DELETE_SOCIAL_POST', { id })).status).toBe(200);
    expect((await buyer.c.get('/api/social/posts')).body.items.some(p => p.id === id || p.original?.id === id)).toBe(false);
    expect((await buyer.c.get(`/api/social/posts/${id}/photo`)).status).toBe(404);
  });

  it('disputed and refunded services cannot claim successful delivery or earn success commissions', async () => {
    const t = await deal(); const published = await publish(seller, t.id); expect(published.status).toBe(200);
    expect((await seller.c.get('/api/pay/summary')).body.summary.commissionsCents).toBe(2000);
    await ctx.prisma.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'DISPUTED' } });
    expect((await publish(buyer, t.id)).status).toBe(409);
    expect((await stranger.c.get('/api/social/posts')).body.items).toHaveLength(0);
    expect((await seller.c.get('/api/pay/summary')).body.summary.commissionsCents).toBe(0);
    await ctx.prisma.marketplaceTransaction.update({ where: { id: t.id }, data: { status: 'PAID', payment: { update: { refundedCents: 50000 } } } });
    expect((await publish(buyer, t.id)).status).toBe(409);
    expect((await seller.c.get('/api/pay/summary')).body.summary.commissionsCents).toBe(0);
  });

  it('separates sandbox deliveries and never generates the old 3% hiring charge on agreement', async () => {
    const t = await deal({ sandbox: false }); expect((await publish(seller, t.id)).status).toBe(409);
    const demand = await ctx.prisma.workforceDemand.create({ data: { companyId: seller.companyId, role: 'Soldador', quantity: 1 } });
    const m = await ctx.prisma.workforceMatch.create({ data: { companyId: seller.companyId, demandId: demand.id, professionalName: 'José', role: 'Soldador', source: 'manual', status: 'INVITED' } });
    const result = await ctx.services.workforce.agreeHire({ company: seller.company, user: seller, id: m.id, agreedSalaryCents: 300000 });
    expect(result).toMatchObject({ payment: null, feeCents: 6000, salaryCents: 300000 });
    expect(await ctx.prisma.payment.count({ where: { kind: 'HIRING_FEE' } })).toBe(0);
    expect((await ctx.prisma.workforceMatch.findUnique({ where: { id: m.id } })).agreedSalaryCents).toBe(300000);
  });

  it('quotes exactly 2% for every marketplace type even with legacy custom rules; preserves existing contracts', async () => {
    await ctx.prisma.commissionRule.create({ data: { name: 'Legacy company 3%', companyId: seller.companyId, rateBps: 300, fixedAmountCents: 1000, minimumCents: 10000 } });
    for (const type of ['SALES', 'FREIGHT', 'WORKFORCE', 'SERVICE']) {
      const q = await ctx.services.commissions.quote({ transactionType: type, companyId: seller.companyId, grossCents: 140000 });
      expect(q).toMatchObject({ rateBps: 200, commissionCents: 2800, sellerNetCents: 137200 });
    }
    const t = await deal();
    await ctx.prisma.marketplaceTransaction.update({ where: { id: t.id }, data: { commissionRateBps: 300, commissionAmount: 3000, sellerNetAmount: 97000 } });
    const view = await seller.c.get(`/api/pay/transactions/${t.id}`); expect(view.body.transaction.commissionRateBps).toBe(300);
  });
});
