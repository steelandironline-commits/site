import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { API_MOUNTS } from '@autopix/areas';
import { disconnectPrisma } from '@autopix/core';
import { setupApp, resetDb, hasDb } from './helpers.js';
import { AREA_ENV, CNPJ_HOST, CPF_HOST, DEV_COOKIE, call, insertSession, makeAccount } from './authAreaHelpers.js';
import { NOW, jobRow } from './jobsHelpers.js';

// Vagas · GET /api/jobs e GET /api/jobs/:id. Só no host CPF, com sessão da área CPF; cada pessoa vê as vagas da
// própria área (perfil) mais as transversais; no host CNPJ a rota responde 404 antes de autenticar.

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } };

/** Todas as chaves de um JSON, em qualquer profundidade. */
function keysDeep(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (out.add(k), keysDeep(v, out));
  return out;
}

describe('manifesto · /api/jobs', () => {
  it('é uma montagem só do CPF', () => {
    expect(API_MOUNTS.find((m) => m.path === '/api/jobs')?.areas).toEqual(['CPF']);
    expect(API_MOUNTS.filter((m) => m.areas.includes('CNPJ')).map((m) => m.path)).not.toContain('/api/jobs');
  });
});

describe.skipIf(!hasDb)('/api/jobs · modo de áreas', () => {
  let ctx;
  let metal;
  let eletrica;
  let semArea;
  let empresa;
  let cookie;
  let ids;

  const get = (host, who, path = '/api/jobs') => call(ctx.app, host, 'get', path, { cookie: who, origin: null, xrw: null });
  const asCpf = (account) => insertSession(ctx.prisma, ctx.config, { userId: account.user.id, area: 'CPF' }).then((s) => `${DEV_COOKIE[CPF_HOST]}=${s.token}`);
  const profile = (account, jobSearch) => ctx.prisma.company.update({ where: { id: account.company.id }, data: { operationalProfile: { jobSearch } } });
  const titles = (res) => res.body.items.map((i) => i.title);

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'false' });
    ctx.services.jobs.now = () => NOW;
    await resetDb(ctx.prisma);
    metal = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    eletrica = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    semArea = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    empresa = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    await profile(metal, { workArea: 'metalurgia', jobTitle: 'Soldador', contactPreference: 'EMAIL' });
    await profile(eletrica, { workArea: 'eletrica', jobTitle: 'Eletricista', contactPreference: 'WHATSAPP' });
    cookie = { metal: await asCpf(metal), eletrica: await asCpf(eletrica), semArea: await asCpf(semArea) };
    cookie.empresa = `${DEV_COOKIE[CNPJ_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: empresa.user.id, area: 'CNPJ' })).token}`;
  });
  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await ctx.prisma.jobListing.deleteMany();
    await ctx.prisma.syncState.deleteMany();
    await ctx.services.jobs.upsertMany(
      [
        jobRow({ title: 'Soldador MIG', daysAgo: 1, description: 'Solda em estruturas. Salário: R$ 3.200 a R$ 3.800 por mês. WhatsApp (47) 99999-8888 e rh@metal.com.br' }),
        jobRow({ title: 'Eletricista Industrial', daysAgo: 2, deadlineDays: 10, company: 'Fábrica Elétrica' }),
        jobRow({ title: 'Motorista Carreteiro', daysAgo: 3 }),
        jobRow({ title: 'Almoxarife', daysAgo: 4 }),
        jobRow({ title: 'Enfermeira', daysAgo: 5 }),
        jobRow({ title: 'Operador de Empilhadeira para obra civil', daysAgo: 6, description: 'Obra civil, alvenaria e andaime.' }),
        jobRow({ title: '(DEMO) Soldador de demonstração', daysAgo: 0, source: 'DEMO' }),
        jobRow({ title: 'Soldador com prazo vencido', daysAgo: 8, deadlineDays: -1 }),
      ],
      NOW,
    );
    const rows = await ctx.prisma.jobListing.findMany();
    ids = Object.fromEntries(rows.map((r) => [r.title, r.id]));
  });

  // ---------------------------------------------------------------- acesso
  it('sem sessão, no host CPF: 401 na lista e no detalhe', async () => {
    expect((await get(CPF_HOST, undefined)).status).toBe(401);
    expect((await get(CPF_HOST, undefined, `/api/jobs/${ids['Soldador MIG']}`)).status).toBe(401);
  });

  it('no host CNPJ a rota não existe: 404 antes de autenticar, sem sessão e com qualquer sessão', async () => {
    for (const who of [undefined, cookie.empresa]) {
      for (const path of ['/api/jobs', `/api/jobs/${ids['Soldador MIG']}`, '/api/jobs/qualquer']) {
        const res = await get(CNPJ_HOST, who, path);
        expect(res.status, `${path} ${who ? 'com sessão' : 'sem sessão'}`).toBe(404);
        expect(res.body).toEqual(NOT_FOUND);
      }
    }
    expect((await get('x.up.railway.app', cookie.metal)).status).toBe(404);
  });

  it('a sessão do CNPJ no host CPF é recusada (área errada), e a da pessoa no host CNPJ também', async () => {
    const wrong = await get(CPF_HOST, `${DEV_COOKIE[CPF_HOST]}=${cookie.empresa.split('=')[1]}`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe('WRONG_AREA');
    const other = await get(CNPJ_HOST, `${DEV_COOKIE[CNPJ_HOST]}=${cookie.metal.split('=')[1]}`);
    expect(other.status).toBe(403);
  });

  // ---------------------------------------------------------------- visibilidade
  it('quem é de metalurgia vê as vagas de metalurgia e as transversais, e não vê as de elétrica nem de saúde', async () => {
    const res = await get(CPF_HOST, cookie.metal);
    expect(res.status).toBe(200);
    expect(titles(res).sort()).toEqual(['Almoxarife', 'Motorista Carreteiro', 'Operador de Empilhadeira para obra civil', 'Soldador MIG'].sort());
    expect(res.body.profile).toEqual({ workArea: 'metalurgia', workAreaName: 'Metalurgia e solda', jobTitle: 'Soldador', contactPreference: 'EMAIL', needsArea: false });
  });

  it('quem é de elétrica vê as vagas de elétrica e as transversais, e não vê as de metalurgia', async () => {
    const res = await get(CPF_HOST, cookie.eletrica);
    expect(titles(res).sort()).toEqual(['Almoxarife', 'Eletricista Industrial', 'Motorista Carreteiro', 'Operador de Empilhadeira para obra civil'].sort());
  });

  it('a vaga de logística aparece para todas as áreas', async () => {
    for (const who of [cookie.metal, cookie.eletrica, cookie.semArea]) {
      const names = titles(await get(CPF_HOST, who));
      expect(names).toEqual(expect.arrayContaining(['Motorista Carreteiro', 'Almoxarife']));
    }
  });

  it('sem área no perfil, só as transversais, com o aviso para escolher a área', async () => {
    const res = await get(CPF_HOST, cookie.semArea);
    expect(res.status).toBe(200);
    expect(titles(res).sort()).toEqual(['Almoxarife', 'Motorista Carreteiro', 'Operador de Empilhadeira para obra civil'].sort());
    expect(res.body.profile).toMatchObject({ workArea: null, workAreaName: null, needsArea: true });
  });

  it('o cargo transversal no perfil abre a vaga do mesmo cargo, mesmo classificada em outra área', async () => {
    const cargo = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    await profile(cargo, { workArea: 'saude', jobTitle: 'Operador de empilhadeira' });
    await ctx.services.jobs.upsertMany([jobRow({ title: 'Operador de empilhadeira - hospital', description: 'Hospital, clínica e laboratório.', daysAgo: 0 }), jobRow({ title: 'Motorista de ambulância', description: 'Hospital e clínica.', daysAgo: 0 })], NOW);
    const names = titles(await get(CPF_HOST, await asCpf(cargo)));
    expect(names).toContain('Operador de empilhadeira - hospital');
    expect(names).toContain('Enfermeira');
  });

  it('a vaga de demonstração não aparece fora do modo demo; a de prazo vencido nunca', async () => {
    for (const who of [cookie.metal, cookie.semArea]) {
      const names = titles(await get(CPF_HOST, who));
      expect(names.some((t) => t.startsWith('(DEMO)'))).toBe(false);
      expect(names).not.toContain('Soldador com prazo vencido');
    }
  });

  it('o detalhe de uma vaga que a pessoa não pode ver responde 404, igual a uma que não existe', async () => {
    const foreign = await get(CPF_HOST, cookie.metal, `/api/jobs/${ids.Enfermeira}`);
    const missing = await get(CPF_HOST, cookie.metal, '/api/jobs/nao-existe-mesmo');
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect((await get(CPF_HOST, cookie.metal, `/api/jobs/${ids['(DEMO) Soldador de demonstração']}`)).status).toBe(404);
    expect((await get(CPF_HOST, cookie.metal, `/api/jobs/${ids['Soldador com prazo vencido']}`)).status).toBe(404);
  });

  it('o detalhe da vaga da própria área e da transversal traz a descrição completa', async () => {
    const own = await get(CPF_HOST, cookie.metal, `/api/jobs/${ids['Soldador MIG']}`);
    expect(own.status).toBe(200);
    expect(own.body.item.description).toContain('Solda em estruturas.');
    expect(own.body.item.title).toBe('Soldador MIG');
    expect((await get(CPF_HOST, cookie.eletrica, `/api/jobs/${ids.Almoxarife}`)).status).toBe(200);
    expect((await get(CPF_HOST, cookie.eletrica, `/api/jobs/${ids['Soldador MIG']}`)).status).toBe(404);
  });

  // ---------------------------------------------------------------- conteúdo do cartão
  it('o item traz cargo, empresa, local, área, salário, datas, prazo, contato, score e fonte', async () => {
    const { item } = (await get(CPF_HOST, cookie.metal, `/api/jobs/${ids['Soldador MIG']}`)).body;
    expect(item).toMatchObject({
      id: ids['Soldador MIG'],
      source: 'FEED',
      title: 'Soldador MIG',
      company: 'Empresa Teste',
      city: 'Joinville',
      state: 'SC',
      area: { slug: 'metalurgia', name: 'Metalurgia e solda' },
      salary: { min: 3200, max: 3800, period: 'MES', label: 'Salário: R$ 3.200 a R$ 3.800 por mês' },
      salaryLabel: 'Salário: R$ 3.200 a R$ 3.800 por mês',
      postedDays: 1,
      postedLabel: 'publicada há 1 dia',
      deadlineDays: null,
      deadlineLabel: 'prazo não informado pela fonte',
    });
    expect(item.sourceUrl).toMatch(/^https:\/\/vagas\.exemplo\.example\//);
    expect(item.score).toMatchObject({ level: 'BOM', label: 'BOM SINAL' });
    expect(item.score.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['SALARY', 'CONTACT', 'COMPANY']));
    expect(item.contact.whatsapp).toMatchObject({ number: '5547999998888', display: '(47) 99999-8888' });
    expect(item.contact.whatsapp.url).toMatch(/^https:\/\/wa\.me\/5547999998888\?text=/);
    expect(item.contact.email).toMatchObject({ address: 'rh@metal.com.br' });
    expect(item.contact.email.url).toMatch(/^mailto:rh@metal\.com\.br\?subject=/);
  });

  it('o prazo só aparece quando a fonte informa: "prazo: N dias"', async () => {
    const { items } = (await get(CPF_HOST, cookie.eletrica)).body;
    const withDeadline = items.find((i) => i.title === 'Eletricista Industrial');
    expect(withDeadline).toMatchObject({ deadlineDays: 10, deadlineLabel: 'prazo: 10 dias', postedDays: 2, postedLabel: 'publicada há 2 dias' });
    const without = items.find((i) => i.title === 'Motorista Carreteiro');
    expect(without).toMatchObject({ deadlineDays: null, expiresAt: null, deadlineLabel: 'prazo não informado pela fonte' });
  });

  it('salário não informado quando a fonte não traz', async () => {
    const item = (await get(CPF_HOST, cookie.eletrica)).body.items.find((i) => i.title === 'Almoxarife');
    expect(item.salary).toBeNull();
    expect(item.salaryLabel).toBe('Salário não informado');
  });

  it('a ordem dos contatos segue a preferência do perfil', async () => {
    const email = (await get(CPF_HOST, cookie.metal)).body.items[0].contact;
    expect(email).toMatchObject({ order: ['EMAIL', 'WHATSAPP'], preferred: 'EMAIL' });
    const whats = (await get(CPF_HOST, cookie.eletrica)).body.items[0].contact;
    expect(whats).toMatchObject({ order: ['WHATSAPP', 'EMAIL'], preferred: 'WHATSAPP' });
    const none = (await get(CPF_HOST, cookie.semArea)).body.items[0].contact;
    expect(none).toMatchObject({ order: ['WHATSAPP', 'EMAIL'], preferred: null });
  });

  it('a lista traz só um trecho da descrição; o texto inteiro vem no detalhe', async () => {
    await ctx.services.jobs.upsertMany([jobRow({ title: 'Motorista de Táxi', description: `Início. ${'texto longo '.repeat(100)}Fim.`, daysAgo: 0 })], NOW);
    const item = (await get(CPF_HOST, cookie.semArea)).body.items.find((i) => i.title === 'Motorista de Táxi');
    expect(item.description).toBeUndefined();
    expect(item.excerpt.length).toBeLessThanOrEqual(321);
    expect(item.descriptionTruncated).toBe(true);
    const full = (await get(CPF_HOST, cookie.semArea, `/api/jobs/${item.id}`)).body.item;
    expect(full.description).toContain('Fim.');
    expect(full.excerpt).toBeUndefined();
  });

  it('nenhum campo de empresa de cobrança nem dado de outra conta vai na resposta', async () => {
    const body = [(await get(CPF_HOST, cookie.metal)).body, (await get(CPF_HOST, cookie.metal, `/api/jobs/${ids['Soldador MIG']}`)).body];
    const forbidden = ['cnpj', 'payoutPixKey', 'payoutPixKeyType', 'payoutPixKeyLast4', 'billing', 'commission', 'subscription', 'plan', 'companyId', 'accountType', 'team', 'members', 'passwordHash', 'loginId'];
    for (const res of body) {
      const keys = keysDeep(res);
      for (const key of forbidden) expect(keys.has(key), key).toBe(false);
      expect(JSON.stringify(res)).not.toContain(metal.document);
      expect(JSON.stringify(res)).not.toContain(metal.email); // o e-mail da conta da pessoa nunca vai na resposta
    }
  });

  it('o texto da área CPF não fala de CNPJ', async () => {
    const text = JSON.stringify([(await get(CPF_HOST, cookie.metal)).body, (await get(CPF_HOST, cookie.semArea)).body]);
    expect(text).not.toMatch(/cnpj/i);
  });

  // ---------------------------------------------------------------- parâmetros
  it('q busca no título, na empresa e na descrição', async () => {
    expect(titles(await get(CPF_HOST, cookie.metal, '/api/jobs?q=carreteiro'))).toEqual(['Motorista Carreteiro']);
    expect(titles(await get(CPF_HOST, cookie.eletrica, '/api/jobs?q=fábrica'))).toEqual(['Eletricista Industrial']);
    expect(titles(await get(CPF_HOST, cookie.metal, '/api/jobs?q=estruturas'))).toEqual(['Soldador MIG']);
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?q=nadaaquiassim')).body.items).toEqual([]);
  });

  it('q aceita até 80 caracteres', async () => {
    expect((await get(CPF_HOST, cookie.metal, `/api/jobs?q=${'a'.repeat(80)}`)).status).toBe(200);
    const long = await get(CPF_HOST, cookie.metal, `/api/jobs?q=${'a'.repeat(81)}`);
    expect(long.status).toBe(400);
    expect(long.body.error.fields.q).toBeTruthy();
  });

  it('area aceita a própria área ou a transversal, e recusa as outras', async () => {
    expect(titles(await get(CPF_HOST, cookie.metal, '/api/jobs?area=metalurgia'))).toEqual(['Soldador MIG']);
    expect(titles(await get(CPF_HOST, cookie.metal, '/api/jobs?area=logistica')).sort()).toEqual(['Almoxarife', 'Motorista Carreteiro', 'Operador de Empilhadeira para obra civil'].sort());
    expect(titles(await get(CPF_HOST, cookie.semArea, '/api/jobs?area=logistica')).length).toBe(3);
    const other = await get(CPF_HOST, cookie.metal, '/api/jobs?area=eletrica');
    expect(other.status).toBe(400);
    expect(other.body.error.message).toBe('Escolha a sua área ou a de logística.');
    expect((await get(CPF_HOST, cookie.semArea, '/api/jobs?area=metalurgia')).status).toBe(400);
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?area=astronauta')).status).toBe(400);
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?area=')).status).toBe(200); // vazio = sem filtro
  });

  it('limit e cursor paginam da mais nova para a mais antiga, sem repetir nem pular', async () => {
    const all = titles(await get(CPF_HOST, cookie.metal));
    const first = await get(CPF_HOST, cookie.metal, '/api/jobs?limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await get(CPF_HOST, cookie.metal, `/api/jobs?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    expect([...titles(first), ...titles(second)]).toEqual(all);
    const dates = all.length && first.body.items.map((i) => i.postedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('limit vai de 1 a 50 e cursor inválido é 400', async () => {
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?limit=0')).status).toBe(400);
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?limit=51')).status).toBe(400);
    expect((await get(CPF_HOST, cookie.metal, '/api/jobs?limit=abc')).status).toBe(400);
    const bad = await get(CPF_HOST, cookie.metal, '/api/jobs?cursor=isto-nao-e-cursor');
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toBe('Cursor inválido.');
  });

  it('a paginação percorre muitas vagas de outras áreas sem perder as visíveis', async () => {
    await ctx.services.jobs.upsertMany(
      Array.from({ length: 60 }, (_, i) => jobRow({ title: `Enfermeira ${i}`, daysAgo: 0.5 + i / 1000 })),
      NOW,
    );
    const seen = [];
    let cursor = null;
    for (let page = 0; page < 10; page++) {
      const res = await get(CPF_HOST, cookie.metal, `/api/jobs?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      seen.push(...titles(res));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen.sort()).toEqual(['Almoxarife', 'Motorista Carreteiro', 'Operador de Empilhadeira para obra civil', 'Soldador MIG'].sort());
  });

  // ---------------------------------------------------------------- fonte
  it('informa se há fonte configurada e quando foi a última sincronização', async () => {
    expect((await get(CPF_HOST, cookie.metal)).body.source).toEqual({ configured: false, demo: false, lastSuccessAt: null });
    await ctx.prisma.syncState.create({ data: { key: 'jobs-sync', lastSuccessAt: new Date('2026-10-21T14:00:00Z'), stats: { sources: ['ADZUNA'] } } });
    expect((await get(CPF_HOST, cookie.metal)).body.source).toEqual({ configured: true, demo: false, lastSuccessAt: '2026-10-21T14:00:00.000Z' });
  });
});

describe.skipIf(!hasDb)('/api/jobs · modo demonstração', () => {
  let ctx;
  let person;
  let cookie;

  beforeAll(async () => {
    ctx = await setupApp({ ...AREA_ENV, DEMO_MODE: 'true' });
    ctx.services.jobs.now = () => NOW;
    await resetDb(ctx.prisma);
    await ctx.prisma.jobListing.deleteMany();
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    await ctx.prisma.company.update({ where: { id: person.company.id }, data: { operationalProfile: { jobSearch: { workArea: 'metalurgia' } } } });
    cookie = `${DEV_COOKIE[CPF_HOST]}=${(await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token}`;
    await ctx.services.jobs.sync();
  });
  afterAll(async () => {
    await ctx.prisma.jobListing.deleteMany();
    await ctx.prisma.syncState.deleteMany();
    await disconnectPrisma();
  });

  it('com DEMO_MODE=true as vagas de exemplo aparecem, marcadas como DEMO', async () => {
    const res = await call(ctx.app, CPF_HOST, 'get', '/api/jobs?limit=50', { cookie, origin: null, xrw: null });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(2);
    for (const item of res.body.items) {
      expect(item.source).toBe('DEMO');
      expect(item.title.startsWith('(DEMO) ')).toBe(true);
      expect(item.company.startsWith('(DEMO) ')).toBe(true);
    }
    expect(res.body.items.map((i) => i.area.slug)).toEqual(expect.arrayContaining(['metalurgia', 'logistica']));
    expect(res.body.source).toMatchObject({ demo: true });
  });
});

describe.skipIf(!hasDb)('/api/jobs · modo legado (sem hosts de área)', () => {
  let ctx;
  let person;
  let company;
  let tokens;

  const get = (token, path = '/api/jobs') => call(ctx.app, 'localhost:5173', 'get', path, { cookie: token ? `ap_session=${token}` : undefined, origin: null, xrw: null });

  beforeAll(async () => {
    ctx = await setupApp({ DEMO_MODE: 'false' });
    ctx.services.jobs.now = () => NOW;
    await resetDb(ctx.prisma);
    await ctx.prisma.jobListing.deleteMany();
    person = await makeAccount(ctx.prisma, { accountType: 'PERSON' });
    company = await makeAccount(ctx.prisma, { accountType: 'COMPANY' });
    tokens = {
      person: (await insertSession(ctx.prisma, ctx.config, { userId: person.user.id, area: 'CPF' })).token,
      company: (await insertSession(ctx.prisma, ctx.config, { userId: company.user.id, area: 'CNPJ' })).token,
    };
    await ctx.services.jobs.upsertMany([jobRow({ title: 'Motorista', daysAgo: 1 })], NOW);
  });
  afterAll(async () => {
    await ctx.prisma.jobListing.deleteMany();
    await disconnectPrisma();
  });

  it('a conta de empresa não lê vagas: 404 igual ao de rota inexistente, na lista e no detalhe', async () => {
    const id = (await ctx.prisma.jobListing.findFirst()).id;
    for (const path of ['/api/jobs', `/api/jobs/${id}`]) {
      const res = await get(tokens.company, path);
      expect(res.status, path).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
  });

  it('a pessoa lê as vagas transversais, e sem sessão é 401', async () => {
    const res = await get(tokens.person);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i) => i.title)).toEqual(['Motorista']);
    expect((await get(undefined)).status).toBe(401);
  });
});
