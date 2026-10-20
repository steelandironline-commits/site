import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';
import { deliveredPost as sharedDeliveredPost } from './isolation/support.js';

// 4b · feed social por área (Q9). O post tem a área da empresa do autor: o feed, o comentário, o
// repost e a foto de um host nunca mostram o conteúdo do outro.

const PHOTO = 'data:image/jpeg;base64,/9j/2Q==';
const NOT_FOUND_POST = 'Publicação não encontrada.';

describe.skipIf(!hasDb)('social por área · modo de áreas', () => {
  let ctx;
  let company;
  let person;
  let other; // segunda conta de cada área, para repostar e comentar
  let otherPerson;
  let token;
  let companyPost;
  let personPost;

  const as = (host, who) => ({ cookie: `${DEV_COOKIE[host]}=${token[who]}`, origin: null, xrw: null });
  const get = (host, who, path) => call(ctx.app, host, 'get', path, as(host, who));
  const act = (host, who, name, input) =>
    call(ctx.app, host, 'post', `/api/actions/${name}`, { body: { input }, cookie: `${DEV_COOKIE[host]}=${token[who]}` });

  const deliveredPost = (seller, opts) => sharedDeliveredPost(ctx, seller, opts);

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    other = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    otherPerson = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const session = async (account, area) => (await insertSession(ctx.prisma, ctx.config, { userId: account.user.id, area })).token;
    token = {
      company: await session(company, 'CNPJ'),
      other: await session(other, 'CNPJ'),
      person: await session(person, 'CPF'),
      otherPerson: await session(otherPerson, 'CPF'),
    };
    companyPost = await deliveredPost(company);
    personPost = await deliveredPost(person);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  const ids = (res) => res.body.items.map((p) => p.original?.id ?? p.id);

  it('post de empresa aparece no feed do CNPJ e não aparece no feed do CPF', async () => {
    const cnpj = await get(CNPJ_HOST, 'other', '/api/social/posts');
    expect(cnpj.status).toBe(200);
    expect(ids(cnpj)).toContain(companyPost);
    const cpf = await get(CPF_HOST, 'otherPerson', '/api/social/posts');
    expect(cpf.status).toBe(200);
    expect(ids(cpf)).not.toContain(companyPost);
    expect(JSON.stringify(cpf.body)).not.toContain(company.user.name);
  });

  it('post de pessoa física aparece no feed do CPF e não aparece no feed do CNPJ', async () => {
    const cpf = await get(CPF_HOST, 'otherPerson', '/api/social/posts');
    expect(ids(cpf)).toContain(personPost);
    const cnpj = await get(CNPJ_HOST, 'other', '/api/social/posts');
    expect(ids(cnpj)).not.toContain(personPost);
    expect(JSON.stringify(cnpj.body)).not.toContain(person.user.name);
  });

  it('cada feed tem só os posts da própria área', async () => {
    expect(ids(await get(CNPJ_HOST, 'company', '/api/social/posts'))).toEqual([companyPost]);
    expect(ids(await get(CPF_HOST, 'person', '/api/social/posts'))).toEqual([personPost]);
  });

  it('foto de outra área responde 404; a da própria área responde 200', async () => {
    expect((await get(CPF_HOST, 'otherPerson', `/api/social/posts/${companyPost}/photo`)).status).toBe(404);
    expect((await get(CNPJ_HOST, 'other', `/api/social/posts/${personPost}/photo`)).status).toBe(404);
    const own = await get(CNPJ_HOST, 'other', `/api/social/posts/${companyPost}/photo`);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toContain('image/jpeg');
    expect((await get(CPF_HOST, 'otherPerson', `/api/social/posts/${personPost}/photo`)).status).toBe(200);
  });

  it('comentar, repostar e ler comentários de post de outra área responde "não encontrada"', async () => {
    for (const [host, who, postId] of [[CPF_HOST, 'otherPerson', companyPost], [CNPJ_HOST, 'other', personPost]]) {
      const comment = await act(host, who, 'COMMENT_SOCIAL_POST', { postId, body: 'Oi' });
      expect(comment.status, `comentar ${postId}`).toBe(404);
      expect(comment.body.error.message).toBe(NOT_FOUND_POST);
      const repost = await act(host, who, 'REPOST_SOCIAL_POST', { postId });
      expect(repost.status, `repostar ${postId}`).toBe(404);
      expect(repost.body.error.message).toBe(NOT_FOUND_POST);
      const read = await get(host, who, `/api/social/posts/${postId}/comments`);
      expect(read.status, `ler ${postId}`).toBe(404);
      expect(read.body.error.message).toBe(NOT_FOUND_POST);
    }
    expect(await ctx.prisma.socialComment.count()).toBe(0);
    expect(await ctx.prisma.socialPost.count({ where: { repostOfId: { not: null } } })).toBe(0);
  });

  it('comentar e repostar na própria área continua funcionando', async () => {
    const comment = await act(CNPJ_HOST, 'other', 'COMMENT_SOCIAL_POST', { postId: companyPost, body: 'Ficou muito bom!' });
    expect(comment.status).toBe(200);
    const repost = await act(CNPJ_HOST, 'other', 'REPOST_SOCIAL_POST', { postId: companyPost, body: 'Recomendo.' });
    expect(repost.status).toBe(200);
    expect((await get(CNPJ_HOST, 'company', `/api/social/posts/${companyPost}/comments`)).body.items).toHaveLength(1);
    const cpfComment = await act(CPF_HOST, 'otherPerson', 'COMMENT_SOCIAL_POST', { postId: personPost, body: 'Boa!' });
    expect(cpfComment.status).toBe(200);
    expect((await get(CPF_HOST, 'person', `/api/social/posts/${personPost}/comments`)).body.items).toHaveLength(1);
  });

  it('o conteúdo de outra área que já esteja no banco não aparece (repost e comentário cruzados)', async () => {
    // Dados que o código novo não cria, mas que um banco antigo ou uma gravação direta poderiam ter.
    const cross = await ctx.prisma.socialPost.create({ data: { repostOfId: companyPost, authorUserId: otherPerson.user.id, body: 'repost cruzado' } });
    await ctx.prisma.socialComment.create({ data: { postId: companyPost, authorUserId: otherPerson.user.id, body: 'comentário cruzado' } });
    for (const [host, who] of [[CNPJ_HOST, 'company'], [CPF_HOST, 'person']]) {
      const feed = await get(host, who, '/api/social/posts');
      expect(JSON.stringify(feed.body), host).not.toMatch(/repost cruzado/);
      expect(feed.body.items.some((p) => p.id === cross.id), host).toBe(false);
    }
    const comments = await get(CNPJ_HOST, 'company', `/api/social/posts/${companyPost}/comments`);
    expect(JSON.stringify(comments.body)).not.toMatch(/comentário cruzado/);
  });

  it('o serviço falha fechado: no modo de áreas, sem área ou com área inválida não devolve nada', async () => {
    const user = person.user;
    await expect(ctx.services.social.list({ user })).rejects.toThrow(TypeError);
    await expect(ctx.services.social.list({ user, area: 'ADMIN' })).rejects.toThrow(TypeError);
    await expect(ctx.services.social.image(personPost)).rejects.toThrow(TypeError);
    await expect(ctx.services.social.comments({ user, postId: personPost, area: 'OUTRA' })).rejects.toThrow(TypeError);
    // Com a área certa o mesmo serviço responde.
    expect((await ctx.services.social.list({ user, area: 'CPF' })).items.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)('social por área · modo legado, feed único como antes', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    await resetDb(ctx.prisma);
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  it('o feed mostra posts de empresa e de pessoa juntos, e a foto de qualquer um', async () => {
    const company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    const reader = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    const posts = [];
    for (const seller of [company, person]) {
      const t = await ctx.services.transactions.create({ user: seller.user, company: seller.company, grossCents: 100000, description: 'Serviço' });
      await ctx.prisma.marketplaceTransaction.update({
        where: { id: t.id },
        data: {
          status: 'PAID', sellerCompletedAt: new Date(), buyerConfirmedAt: new Date(), isSandbox: true,
          payment: { create: { companyId: seller.company.id, idempotencyKey: `legacy-${t.id}`, kind: 'CHARGE', status: 'CONFIRMED', provider: 'mock', amountCents: 100000, paidAt: new Date(), isSandbox: true } },
        },
      });
      posts.push((await ctx.services.social.publish({ user: seller.user, company: seller.company, transactionId: t.id, body: 'ok', photo: PHOTO })).post.id);
    }
    const { token } = await insertSession(ctx.prisma, ctx.config, { userId: reader.user.id });
    const auth = { cookie: `ap_session=${token}`, origin: null, xrw: null };
    const feed = await call(ctx.app, 'localhost:5173', 'get', '/api/social/posts', auth);
    expect(feed.body.items.map((p) => p.id).sort()).toEqual([...posts].sort());
    for (const id of posts) expect((await call(ctx.app, 'localhost:5173', 'get', `/api/social/posts/${id}/photo`, auth)).status).toBe(200);
    // Sem área o serviço responde como sempre.
    expect((await ctx.services.social.list({ user: reader.user })).items).toHaveLength(2);
  });
});
