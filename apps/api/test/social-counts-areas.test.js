import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';

// 4c · item E. As contagens de comentários e de reposts do feed também são da área: comentário ou
// repost de uma pessoa do CPF num post do CNPJ (dado que o código novo não cria, mas um banco antigo
// ou uma gravação direta poderiam ter) não pode somar no número que o CNPJ vê, nem o contrário.

async function deliveredPost(ctx, seller) {
  const t = await ctx.services.transactions.create({ user: seller.user, company: seller.company, grossCents: 100000, description: 'Serviço', buyerEmail: null });
  await ctx.prisma.marketplaceTransaction.update({
    where: { id: t.id },
    data: {
      status: 'PAID',
      sellerCompletedAt: new Date(),
      buyerConfirmedAt: new Date(),
      isSandbox: true,
      payment: { create: { companyId: seller.company.id, idempotencyKey: `count-${t.id}`, kind: 'CHARGE', status: 'CONFIRMED', provider: 'mock', amountCents: 100000, paidAt: new Date(), isSandbox: true } },
    },
  });
  return (await ctx.services.social.publish({ user: seller.user, company: seller.company, transactionId: t.id, body: `Opinião de ${seller.user.name}`, photo: null })).post.id;
}

describe.skipIf(!hasDb)('contagens do feed por área · modo de áreas', () => {
  let ctx;
  let company;
  let reader;
  let person;
  let otherPerson;
  let companyPost;
  let personPost;
  let cookie;

  const feed = async (host, who) => {
    const res = await call(ctx.app, host, 'get', '/api/social/posts', { cookie: `${DEV_COOKIE[host]}=${cookie[who]}`, origin: null, xrw: null });
    expect(res.status).toBe(200);
    return res.body.items;
  };
  const counts = (items, id) => {
    const item = items.find((p) => p.id === id || p.original?.id === id);
    const root = item.original ?? item;
    return { commentCount: root.commentCount, repostCount: root.repostCount };
  };

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    reader = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    otherPerson = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    companyPost = await deliveredPost(ctx, company);
    personPost = await deliveredPost(ctx, person);
    const session = async (account, area) => (await insertSession(ctx.prisma, ctx.config, { userId: account.user.id, area })).token;
    cookie = { reader: await session(reader, 'CNPJ'), otherPerson: await session(otherPerson, 'CPF') };

    // Atividade da própria área: 1 comentário e 1 repost em cada post.
    await ctx.prisma.socialComment.create({ data: { postId: companyPost, authorUserId: reader.user.id, body: 'comentário do CNPJ' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: companyPost, authorUserId: reader.user.id, body: 'repost do CNPJ' } });
    await ctx.prisma.socialComment.create({ data: { postId: personPost, authorUserId: otherPerson.user.id, body: 'comentário do CPF' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: personPost, authorUserId: otherPerson.user.id, body: 'repost do CPF' } });
    // Atividade cruzada, gravada direto: 3 comentários e 2 reposts de outra área em cada post.
    for (let i = 0; i < 3; i += 1) {
      await ctx.prisma.socialComment.create({ data: { postId: companyPost, authorUserId: person.user.id, body: `cruzado ${i}` } });
      await ctx.prisma.socialComment.create({ data: { postId: personPost, authorUserId: company.user.id, body: `cruzado ${i}` } });
    }
    await ctx.prisma.socialPost.create({ data: { repostOfId: companyPost, authorUserId: person.user.id, body: 'repost cruzado' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: companyPost, authorUserId: otherPerson.user.id, body: 'outro repost cruzado' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: personPost, authorUserId: company.user.id, body: 'repost cruzado' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: personPost, authorUserId: reader.user.id, body: 'outro repost cruzado' } });
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o feed do CNPJ conta só comentários e reposts do CNPJ', async () => {
    expect(counts(await feed(CNPJ_HOST, 'reader'), companyPost)).toEqual({ commentCount: 1, repostCount: 1 });
  });

  it('o feed do CPF conta só comentários e reposts do CPF', async () => {
    expect(counts(await feed(CPF_HOST, 'otherPerson'), personPost)).toEqual({ commentCount: 1, repostCount: 1 });
  });

  it('o repost mostra a contagem da área do leitor também no post original embutido', async () => {
    const items = await feed(CNPJ_HOST, 'reader');
    const repost = items.find((p) => p.original?.id === companyPost);
    expect(repost.original).toMatchObject({ commentCount: 1, repostCount: 1 });
  });
});

describe.skipIf(!hasDb)('contagens do feed por área · modo legado, a soma de sempre', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('comentários e reposts de qualquer conta entram na contagem', async () => {
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const postId = await deliveredPost(ctx, company);
    await ctx.prisma.socialComment.create({ data: { postId, authorUserId: company.user.id, body: 'a' } });
    await ctx.prisma.socialComment.create({ data: { postId, authorUserId: person.user.id, body: 'b' } });
    await ctx.prisma.socialPost.create({ data: { repostOfId: postId, authorUserId: person.user.id, body: 'r' } });
    const { items } = await ctx.services.social.list({ user: company.user });
    const post = items.find((p) => p.id === postId);
    expect(post).toMatchObject({ commentCount: 2, repostCount: 1 });
  });
});
