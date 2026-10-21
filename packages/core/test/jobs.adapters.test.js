import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { ADZUNA_ANNUAL_FROM, AdzunaAdapter, adzunaSalary, parseAdzunaLocation, toRawJob } from '../src/jobs/adzunaAdapter.js';
import { FeedAdapter, parseFeed } from '../src/jobs/feedAdapter.js';
import { DemoJobSource } from '../src/jobs/demoSource.js';
import { JobSourceError, getWithBackoff, retryWaitMs } from '../src/jobs/http.js';
import { nextJobSyncDelayMs } from '../src/jobs/backoff.js';
import { buildJobRecord } from '../src/jobs/normalize.js';
import { JobService } from '../src/jobs/jobService.js';

// Adaptadores de vagas com fetch falso: nada sai para a rede e nada toca o banco.

const NOW = new Date('2026-10-21T15:00:00.000Z');
const KEY = 'chave-secreta-da-api-0123456789';

const ok = (body, headers = {}) => ({ ok: true, status: 200, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const fail = (status, headers = {}) => ({ ok: false, status, headers: { get: (h) => headers[h.toLowerCase()] ?? null }, text: async () => '' });

/** fetch que responde em sequência e anota as URLs. */
function sequence(...responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

const sleeps = () => {
  const waited = [];
  return { waited, sleep: async (ms) => void waited.push(ms) };
};

// ------------------------------------------------------------------------------------------------ Adzuna
const RESULT = {
  id: '5012345678',
  title: 'Soldador <strong>MIG</strong> / MAG',
  description: 'Atuar na <strong>soldagem</strong> de estruturas.&nbsp;Contato: (47) 99999-8888 &amp; vagas@metal.com.br ...',
  created: '2026-10-19T10:00:00Z',
  redirect_url: 'https://www.adzuna.com.br/land/ad/5012345678?se=abc',
  company: { display_name: 'Metalúrgica Alfa' },
  location: { display_name: 'Joinville, Santa Catarina', area: ['Brasil', 'Santa Catarina', 'Joinville'] },
  salary_min: 36000,
  salary_max: 42000,
  salary_is_predicted: '0',
  category: { label: 'Indústria', tag: 'trade-construction-jobs' },
};

describe('Adzuna · pedido', () => {
  it('chama /v1/api/jobs/br/search/{página} com as chaves, 50 por página e a busca', async () => {
    const { fetchImpl, calls } = sequence(ok({ results: [] }));
    await new AdzunaAdapter({ appId: 'meu-id', appKey: KEY, fetchImpl }).fetchPage('auxiliar de logística', 2);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.adzuna.com/v1/api/jobs/br/search/2');
    expect(url.searchParams.get('app_id')).toBe('meu-id');
    expect(url.searchParams.get('app_key')).toBe(KEY);
    expect(url.searchParams.get('results_per_page')).toBe('50');
    expect(url.searchParams.get('what')).toBe('auxiliar de logística');
    expect(calls[0].init.headers.Accept).toContain('json');
  });

  it('sem as duas chaves, nem constrói', () => {
    expect(() => new AdzunaAdapter({ appId: 'x' })).toThrow(/ADZUNA_APP_ID/);
    expect(() => new AdzunaAdapter({ appKey: 'x' })).toThrow(/ADZUNA_APP_KEY/);
    expect(() => new AdzunaAdapter({})).toThrow();
  });
});

describe('Adzuna · mapeamento dos campos', () => {
  it('título, empresa, local, link, data, descrição e salário', () => {
    const job = toRawJob(RESULT);
    expect(job).toMatchObject({
      externalId: '5012345678',
      title: 'Soldador MIG / MAG',
      company: 'Metalúrgica Alfa',
      city: 'Joinville',
      state: 'SC',
      sourceUrl: 'https://www.adzuna.com.br/land/ad/5012345678?se=abc',
      postedAt: '2026-10-19T10:00:00Z',
      expiresAt: null, // a Adzuna não informa prazo
      salary: { min: 3000, max: 3500, period: 'MES' }, // valor anual / 12
      contactText: [],
    });
    expect(job.description).toBe('Atuar na soldagem de estruturas. Contato: (47) 99999-8888 & vagas@metal.com.br ...');
  });

  it('o registro final: área, salário, contato tirado do texto e score', () => {
    const row = buildJobRecord(toRawJob(RESULT), { source: 'ADZUNA', now: NOW });
    expect(row).toMatchObject({
      source: 'ADZUNA',
      externalId: '5012345678',
      area: 'metalurgia',
      company: 'Metalúrgica Alfa',
      state: 'SC',
      salaryMin: 3000,
      salaryMax: 3500,
      salaryPeriod: 'MES',
      salaryText: 'R$ 3.000 a R$ 3.500 por mês',
      contactWhatsapp: '5547999998888',
      contactEmail: 'vagas@metal.com.br',
      expiresAt: null,
    });
    expect(row.scoreLevel).toBe('BOM');
    expect(row.scoreReasons.map((r) => r.code)).toEqual(expect.arrayContaining(['SALARY', 'CONTACT', 'COMPANY']));
  });

  it('salário: valor anual vira mensal, valor mensal fica, estimativa da Adzuna é descartada', () => {
    expect(adzunaSalary({ salary_min: 24000, salary_max: 24000 })).toEqual({ min: 2000, max: 2000, period: 'MES' });
    expect(adzunaSalary({ salary_min: 2500, salary_max: 3000 })).toEqual({ min: 2500, max: 3000, period: 'MES' });
    expect(ADZUNA_ANNUAL_FROM).toBe(12000);
    expect(adzunaSalary({ salary_min: 36000, salary_max: 42000, salary_is_predicted: '1' })).toBeNull();
    expect(adzunaSalary({})).toBeNull();
    expect(adzunaSalary({ salary_min: 0, salary_max: 0 })).toBeNull();
  });

  it('local: nome do estado vira UF; sem área, usa o display_name', () => {
    expect(parseAdzunaLocation({ area: ['Brasil', 'São Paulo', 'São Paulo (Capital)'] })).toEqual({ city: 'São Paulo', state: 'SP' });
    expect(parseAdzunaLocation({ display_name: 'Curitiba, Paraná' })).toEqual({ city: 'Curitiba', state: 'PR' });
    expect(parseAdzunaLocation({ area: ['Brasil', 'Espírito Santo'] })).toEqual({ city: null, state: 'ES' });
    expect(parseAdzunaLocation(undefined)).toEqual({ city: null, state: null });
  });

  it('descarta resultado sem id, título ou link seguro', () => {
    expect(toRawJob({ ...RESULT, id: undefined })).toBeNull();
    expect(toRawJob({ ...RESULT, title: '  ' })).toBeNull();
    expect(toRawJob({ ...RESULT, redirect_url: 'javascript:alert(1)' })).toBeNull();
    expect(toRawJob(null)).toBeNull();
  });

  it('dedupe: o mesmo id duas vezes na página vale uma vez, com o último', async () => {
    const { fetchImpl } = sequence(ok({ results: [RESULT, { ...RESULT, title: 'Soldador (atualizado)' }, { ...RESULT, id: '2', redirect_url: 'ftp://x' }] }));
    const { jobs, received } = await new AdzunaAdapter({ appId: 'a', appKey: 'b', fetchImpl }).fetchPage('soldador');
    expect(received).toBe(3);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('Soldador (atualizado)');
  });
});

describe('Adzuna · 429, erros e resposta inválida', () => {
  it('429: espera o Retry-After e tenta de novo', async () => {
    const { waited, sleep } = sleeps();
    const { fetchImpl, calls } = sequence(fail(429, { 'retry-after': '7' }), ok({ results: [RESULT] }));
    const { jobs } = await new AdzunaAdapter({ appId: 'a', appKey: KEY, fetchImpl, sleep }).fetchPage('soldador');
    expect(calls).toHaveLength(2);
    expect(waited).toEqual([7000]);
    expect(jobs).toHaveLength(1);
  });

  it('429 sem Retry-After: recua em dobro; 429 sem fim: erro com status 429, sem a chave na mensagem', async () => {
    const { waited, sleep } = sleeps();
    const { fetchImpl, calls } = sequence(fail(429));
    const error = await new AdzunaAdapter({ appId: 'a', appKey: KEY, fetchImpl, sleep }).fetchPage('soldador').catch((e) => e);
    expect(error).toBeInstanceOf(JobSourceError);
    expect(error.status).toBe(429);
    expect(calls).toHaveLength(3);
    expect(waited).toEqual([15_000, 30_000]);
    expect(`${error.message} ${error.stack}`).not.toContain(KEY);
    expect(error.message).not.toContain('adzuna.com');
  });

  it('erro de servidor e falha de rede também repetem; erro do cliente (401) não', async () => {
    const { sleep } = sleeps();
    const flaky = sequence(fail(503), new Error('rede'), ok({ results: [] }));
    await new AdzunaAdapter({ appId: 'a', appKey: 'b', fetchImpl: flaky.fetchImpl, sleep }).fetchPage('x');
    expect(flaky.calls).toHaveLength(3);

    const denied = sequence(fail(401));
    const error = await new AdzunaAdapter({ appId: 'a', appKey: 'b', fetchImpl: denied.fetchImpl, sleep }).fetchPage('x').catch((e) => e);
    expect(denied.calls).toHaveLength(1);
    expect(error.status).toBe(401);
  });

  it('resposta que não é JSON é erro da fonte', async () => {
    const { fetchImpl } = sequence(ok('<html>manutenção</html>'));
    await expect(new AdzunaAdapter({ appId: 'a', appKey: 'b', fetchImpl }).fetchPage('x')).rejects.toBeInstanceOf(JobSourceError);
  });
});

// ------------------------------------------------------------------------------------------------ http e recuo
describe('recuo de tentativas', () => {
  it('quanto esperar: Retry-After em segundos ou em data, ou o padrão de cada erro', () => {
    expect(retryWaitMs(429, 0, '3')).toBe(3000);
    expect(retryWaitMs(429, 0, '9999')).toBe(120_000);
    expect(retryWaitMs(429, 0, undefined)).toBe(15_000);
    expect(retryWaitMs(429, 2, undefined)).toBe(60_000);
    expect(retryWaitMs(503, 0)).toBe(2000);
    expect(retryWaitMs(0, 2)).toBe(8000);
    const future = new Date(Date.now() + 5000).toUTCString();
    expect(retryWaitMs(429, 0, future)).toBeGreaterThan(0);
    expect(retryWaitMs(429, 0, future)).toBeLessThanOrEqual(5000);
  });

  it('resposta grande demais é recusada', async () => {
    const { fetchImpl } = sequence(ok('x'.repeat(100)));
    await expect(getWithBackoff('Feed', 'https://exemplo.com/f', { fetchImpl, maxBytes: 50 })).rejects.toThrow(/grande demais/);
  });

  it('entre rodadas do worker: o intervalo normal sem erro, e o dobro a cada falha seguida (429 começa em 15 min)', () => {
    const base = { syncMinutes: 10 };
    expect(nextJobSyncDelayMs({ upserted: 3 }, base)).toBe(10 * 60_000);
    expect(nextJobSyncDelayMs(null, base)).toBe(10 * 60_000);
    expect(nextJobSyncDelayMs({ error: 'x', status: 429 }, { ...base, failures: 0 })).toBe(15 * 60_000);
    expect(nextJobSyncDelayMs({ error: 'x', status: 429 }, { ...base, failures: 1 })).toBe(30 * 60_000);
    expect(nextJobSyncDelayMs({ error: 'x', status: 500 }, { ...base, failures: 0 })).toBe(10 * 60_000); // nunca menos que o normal
    expect(nextJobSyncDelayMs({ error: 'x', status: 500 }, { ...base, failures: 3 })).toBe(40 * 60_000);
    expect(nextJobSyncDelayMs({ error: 'x', status: 429 }, { ...base, failures: 50 })).toBe(6 * 60 * 60_000);
  });
});

// ------------------------------------------------------------------------------------------------ feeds
const FEED = { url: 'https://empresa.example/vagas.json', name: null };
const feedOf = (body) => new FeedAdapter({ feeds: [FEED], fetchImpl: sequence(ok(body)).fetchImpl, sleep: async () => {} });

describe('feed JSON', () => {
  it('lista de itens com os campos em português ou inglês', async () => {
    const { jobs, received } = await feedOf({
      vagas: [
        {
          id: 77,
          cargo: 'Eletricista de Manutenção',
          empresa: 'Fábrica Beta',
          cidade: 'Blumenau',
          uf: 'sc',
          descricao: '<p>Manutenção de painéis.</p><p>Salário: R$ 3.100,00 por mês</p>',
          link: 'https://empresa.example/vaga/77',
          data: '2026-10-18T08:00:00Z',
          validThrough: '2026-11-18',
          whatsapp: '(47) 98888-7777',
          email: 'rh@beta.com.br',
        },
        { job_title: 'Auxiliar de limpeza', company: { name: 'Clean Ltda' }, location: 'Joinville - SC', url: 'https://empresa.example/vaga/78', posted_at: '2026-10-20T08:00:00Z', salary_min: 1700, salary_max: 1900 },
      ],
    }).fetchFeed(FEED);
    expect(received).toBe(2);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      title: 'Eletricista de Manutenção',
      company: 'Fábrica Beta',
      city: 'Blumenau',
      state: 'sc',
      sourceUrl: 'https://empresa.example/vaga/77',
      postedAt: '2026-10-18T08:00:00Z',
      expiresAt: '2026-11-18',
      contactText: ['(47) 98888-7777', 'rh@beta.com.br'],
    });
    expect(jobs[0].description).toBe('Manutenção de painéis.\n\nSalário: R$ 3.100,00 por mês');
    expect(jobs[1]).toMatchObject({ company: 'Clean Ltda', city: 'Joinville', state: 'SC', salary: { min: 1700, max: 1900 } });

    const rows = jobs.map((j) => buildJobRecord(j, { source: 'FEED', now: NOW }));
    expect(rows[0]).toMatchObject({ area: 'eletrica', state: 'SC', salaryMin: 3100, contactWhatsapp: '5547988887777', contactEmail: 'rh@beta.com.br' });
    expect(rows[0].expiresAt.toISOString()).toBe('2026-11-18T00:00:00.000Z');
    expect(rows[1]).toMatchObject({ area: 'limpeza', salaryMin: 1700, salaryMax: 1900, salaryPeriod: 'MES' });
  });

  it('JSON Feed e vaga no formato schema.org', async () => {
    const { jobs } = await feedOf({
      version: 'https://jsonfeed.org/version/1.1',
      items: [
        { id: 'a1', url: 'https://empresa.example/a1', title: 'Cozinheiro', content_html: '<ul><li>Turno noite</li></ul>', date_published: '2026-10-20T00:00:00Z' },
        {
          identifier: { value: 'b2' },
          title: 'Professor de Matemática',
          url: 'https://empresa.example/b2',
          datePosted: '2026-10-19',
          hiringOrganization: { name: 'Escola Gama' },
          jobLocation: { address: { addressLocality: 'Curitiba', addressRegion: 'PR' } },
          baseSalary: { value: { minValue: 4000, maxValue: 5000, unitText: 'MONTH' } },
        },
      ],
    }).fetchFeed(FEED);
    expect(jobs.map((j) => j.title)).toEqual(['Cozinheiro', 'Professor de Matemática']);
    expect(jobs[0].description).toBe('- Turno noite');
    expect(jobs[1]).toMatchObject({ company: 'Escola Gama', city: 'Curitiba', state: 'PR', salary: { min: 4000, max: 5000, period: 'MES' } });
  });

  it('dedupe: id repetido vale uma vez; ids de feeds diferentes não se misturam', async () => {
    const item = { id: '1', title: 'Pedreiro', url: 'https://x.example/1', date: '2026-10-20T00:00:00Z' };
    const a = await feedOf([item, { ...item, title: 'Pedreiro (revisto)' }]).fetchFeed(FEED);
    expect(a.jobs).toHaveLength(1);
    expect(a.jobs[0].title).toBe('Pedreiro (revisto)');
    const b = await feedOf([item]).fetchFeed({ url: 'https://outro.example/vagas.json' });
    expect(b.jobs[0].externalId).not.toBe(a.jobs[0].externalId);
  });

  it('sem id, usa o link como identidade', async () => {
    const { jobs } = await feedOf([{ title: 'Vigilante', link: 'https://x.example/v', date: '2026-10-20T00:00:00Z' }]).fetchFeed(FEED);
    expect(jobs[0].externalId).toMatch(/:https:\/\/x\.example\/v$/);
  });

  it('descarta item sem título ou com link que não é http(s); registro final descarta o que não tem data', async () => {
    const { jobs } = await feedOf([
      { id: '1', url: 'https://x.example/1', date: '2026-10-20' },
      { id: '2', title: 'Perigoso', url: 'javascript:alert(1)', date: '2026-10-20' },
      { id: '3', title: 'Sem data', url: 'https://x.example/3' },
      { id: '4', title: 'Boa', url: 'https://x.example/4', date: '2026-10-20' },
    ]).fetchFeed(FEED);
    expect(jobs.map((j) => j.title)).toEqual(['Sem data', 'Boa']);
    expect(buildJobRecord(jobs[0], { source: 'FEED', now: NOW })).toBeNull(); // nunca se inventa a data
    expect(buildJobRecord(jobs[1], { source: 'FEED', now: NOW })).not.toBeNull();
  });

  it('o texto da fonte é só texto: nada de HTML nem de script no que sai', async () => {
    const { jobs } = await feedOf([{ id: '1', title: '<img src=x onerror=alert(1)>Soldador', url: 'https://x.example/1', date: '2026-10-20', description: '<script>alert(1)</script><b>Vaga</b>', company: '<i>ACME</i>' }]).fetchFeed(FEED);
    expect(jobs[0].title).toBe('Soldador');
    expect(jobs[0].description).toBe('Vaga');
    expect(jobs[0].company).toBe('ACME');
  });

  it('JSON inválido e formato desconhecido são erros do feed', () => {
    expect(() => parseFeed('{ quebrado')).toThrow(JobSourceError);
    expect(() => parseFeed('<html><body>oi</body></html>')).toThrow(/formato/);
    expect(parseFeed('{"outra":1}')).toEqual([]);
  });
});

describe('feed RSS e Atom', () => {
  const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Vagas</title>
  <item>
    <title><![CDATA[Motorista de Caminhão &amp; Carreta]]></title>
    <link>https://empresa.example/vagas/9</link>
    <guid isPermaLink="false">vaga-9</guid>
    <pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate>
    <description><![CDATA[<p>Rota Itajaí &rarr; Curitiba.</p>]]></description>
    <company>Transportes Delta</company>
    <city>Itajaí</city><state>SC</state>
    <salary>R$ 4.500,00 por mês</salary>
    <phone>(47) 99777-6666</phone>
  </item>
  <item><title>Sem link</title><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate></item>
  <item><title>Segundo</title><link>https://empresa.example/vagas/10</link><guid>vaga-9</guid><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><description>&lt;b&gt;Texto&lt;/b&gt; escapado</description></item>
</channel></rss>`;

  it('mapeia título, link, id, data, descrição e campos extras; CDATA e entidades', async () => {
    const { jobs, received } = await feedOf(RSS).fetchFeed(FEED);
    expect(received).toBe(3);
    // "vaga-9" aparece em dois itens: vale uma vez, com o último
    expect(jobs.map((j) => j.title)).toEqual(['Segundo']);
    const first = parseFeed(RSS)[0];
    expect(first).toMatchObject({ title: 'Motorista de Caminhão &amp; Carreta', link: 'https://empresa.example/vagas/9', id: 'vaga-9', company: 'Transportes Delta', phone: '(47) 99777-6666' });
    expect(jobs[0].description).toBe('Texto escapado');
  });

  it('uma vaga RSS completa até o registro final', async () => {
    const [raw] = (await feedOf(RSS.replace('<guid>vaga-9</guid>', '<guid>vaga-10</guid>')).fetchFeed(FEED)).jobs;
    expect(raw.title).toBe('Motorista de Caminhão & Carreta');
    const row = buildJobRecord(raw, { source: 'FEED', now: NOW });
    expect(row).toMatchObject({ area: 'logistica', company: 'Transportes Delta', city: 'Itajaí', state: 'SC', salaryMin: 4500, contactWhatsapp: '5547997776666' });
    expect(row.postedAt.toISOString()).toBe('2026-10-20T10:00:00.000Z');
  });

  it('Atom: link em href', async () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Auxiliar Administrativo</title><link href="https://empresa.example/a/1" rel="alternate"/><id>tag:a,1</id><updated>2026-10-20T09:00:00Z</updated><summary>Rotinas de escritório</summary></entry></feed>`;
    const { jobs } = await feedOf(atom).fetchFeed(FEED);
    expect(jobs[0]).toMatchObject({ title: 'Auxiliar Administrativo', sourceUrl: 'https://empresa.example/a/1', postedAt: '2026-10-20T09:00:00Z', description: 'Rotinas de escritório' });
  });
});

describe('feed · 429 e erros', () => {
  it('429: espera, tenta de novo e segue', async () => {
    const { waited, sleep } = sleeps();
    const { fetchImpl, calls } = sequence(fail(429, { 'retry-after': '2' }), ok([{ id: '1', title: 'Pedreiro', url: 'https://x.example/1', date: '2026-10-20' }]));
    const { jobs } = await new FeedAdapter({ feeds: [FEED], fetchImpl, sleep }).fetchFeed(FEED);
    expect(calls).toHaveLength(2);
    expect(waited).toEqual([2000]);
    expect(jobs).toHaveLength(1);
  });

  it('429 sem fim: erro 429 que não cita o endereço do feed', async () => {
    const { sleep } = sleeps();
    const error = await new FeedAdapter({ feeds: [FEED], fetchImpl: sequence(fail(429)).fetchImpl, sleep }).fetchFeed(FEED).catch((e) => e);
    expect(error).toMatchObject({ name: 'JobSourceError', status: 429 });
    expect(error.message).not.toContain('empresa.example');
  });
});

// ------------------------------------------------------------------------------------------------ demonstração
describe('vagas de demonstração', () => {
  const jobs = new DemoJobSource().list(NOW);

  it('são de 8 a 12, com título e empresa começando por "(DEMO)" e fonte DEMO', () => {
    expect(jobs.length).toBeGreaterThanOrEqual(8);
    expect(jobs.length).toBeLessThanOrEqual(12);
    for (const job of jobs) {
      expect(job.title.startsWith('(DEMO) ')).toBe(true);
      expect(job.company.startsWith('(DEMO) ')).toBe(true);
      expect(job.sourceUrl).toMatch(/^https:\/\/[^/]+\.example\//);
    }
    expect(new Set(jobs.map((j) => j.externalId)).size).toBe(jobs.length);
    expect(new DemoJobSource().name).toBe('DEMO');
  });

  it('cobrem várias áreas, níveis de score e prazos informados ou não', () => {
    const rows = jobs.map((j) => buildJobRecord(j, { source: 'DEMO', now: NOW }));
    expect(rows.every(Boolean)).toBe(true);
    expect(new Set(rows.map((r) => r.area)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(rows.map((r) => r.scoreLevel))).toEqual(new Set(['BOM', 'VERIFIQUE', 'ATENCAO']));
    expect(rows.some((r) => r.expiresAt === null)).toBe(true);
    expect(rows.some((r) => r.expiresAt !== null)).toBe(true);
    expect(rows.some((r) => r.area === 'logistica')).toBe(true);
    for (const row of rows) {
      expect(row.description + row.title + (row.company ?? '')).not.toMatch(/cnpj/i);
      expect(row.postedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });
});

// ------------------------------------------------------------------------------------------------ registro final
describe('registro final da vaga', () => {
  const raw = { externalId: '1', title: 'Soldador', sourceUrl: 'https://x.example/1', postedAt: '2026-10-20T00:00:00Z' };

  it('sem título, link http(s) ou data de publicação, a vaga é descartada', () => {
    expect(buildJobRecord(raw, { source: 'FEED', now: NOW })).not.toBeNull();
    expect(buildJobRecord({ ...raw, title: '' }, { source: 'FEED', now: NOW })).toBeNull();
    expect(buildJobRecord({ ...raw, sourceUrl: 'javascript:alert(1)' }, { source: 'FEED', now: NOW })).toBeNull();
    expect(buildJobRecord({ ...raw, sourceUrl: undefined }, { source: 'FEED', now: NOW })).toBeNull();
    expect(buildJobRecord({ ...raw, postedAt: 'ontem' }, { source: 'FEED', now: NOW })).toBeNull();
    expect(buildJobRecord({ ...raw, externalId: '' }, { source: 'FEED', now: NOW })).toBeNull();
  });

  it('fonte desconhecida é erro de programação', () => {
    expect(() => buildJobRecord(raw, { source: 'OUTRA', now: NOW })).toThrow(TypeError);
  });

  it('data de publicação no futuro vira agora; data brasileira dia/mês/ano é lida', () => {
    expect(buildJobRecord({ ...raw, postedAt: '2027-01-01T00:00:00Z' }, { source: 'FEED', now: NOW }).postedAt).toEqual(NOW);
    const br = buildJobRecord({ ...raw, postedAt: '15/10/2026', expiresAt: '31/10/2026' }, { source: 'FEED', now: NOW });
    expect(br.postedAt.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(br.expiresAt.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    expect(buildJobRecord({ ...raw, postedAt: '31/02/2026' }, { source: 'FEED', now: NOW })).toBeNull();
  });

  it('prazo só existe quando a fonte informa; salário do campo vale mais que o do texto; UF inválida some', () => {
    expect(buildJobRecord(raw, { source: 'FEED', now: NOW }).expiresAt).toBeNull();
    const row = buildJobRecord({ ...raw, description: 'Salário: R$ 1.000 por mês', salary: { min: 2000, max: 2400 }, state: 'Santa Catarina' }, { source: 'FEED', now: NOW });
    expect(row).toMatchObject({ salaryMin: 2000, salaryMax: 2400, state: null });
  });

  it('o texto pede pagamento: ATENÇÃO, com os motivos guardados', () => {
    const row = buildJobRecord({ ...raw, company: 'Fulano', description: 'Renda extra! Pague a taxa de inscrição de R$ 50.' }, { source: 'FEED', now: NOW });
    expect(row.scoreLevel).toBe('ATENCAO');
    expect(row.scoreReasons.map((r) => r.code)).toEqual(expect.arrayContaining(['PAYMENT_REQUEST', 'EASY_MONEY']));
  });

  it('limita o tamanho dos textos', () => {
    const row = buildJobRecord({ ...raw, title: 'T'.repeat(500), description: 'd '.repeat(9000), company: 'E'.repeat(500) }, { source: 'FEED', now: NOW });
    expect(row.title.length).toBeLessThanOrEqual(200);
    expect(row.company.length).toBeLessThanOrEqual(120);
    expect(row.description.length).toBeLessThanOrEqual(8000);
  });
});

// ------------------------------------------------------------------------------------------------ configuração e fontes ativas
const BASE_ENV = { NODE_ENV: 'test' };

describe('configuração das vagas', () => {
  it('por padrão a sincronização está desligada, a cada 60 minutos, sem Adzuna nem feeds', () => {
    const { jobs } = loadConfig(BASE_ENV);
    expect(jobs).toMatchObject({ syncEnabled: false, syncMinutes: 60, adzuna: { enabled: false }, feeds: [] });
  });

  it('a Adzuna só liga com as duas chaves', () => {
    expect(loadConfig({ ...BASE_ENV, ADZUNA_APP_ID: 'a' }).jobs.adzuna.enabled).toBe(false);
    expect(loadConfig({ ...BASE_ENV, ADZUNA_APP_KEY: 'b' }).jobs.adzuna.enabled).toBe(false);
    expect(loadConfig({ ...BASE_ENV, ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' }).jobs.adzuna).toMatchObject({ enabled: true, appId: 'a', appKey: 'b', requestsPerRun: 6 });
  });

  it('JOB_FEEDS é um JSON de URLs https, sem repetição', () => {
    const feeds = loadConfig({ ...BASE_ENV, JOB_FEEDS: '["https://a.example/f.json", {"url":"https://b.example/rss","name":"B"}, "https://a.example/f.json"]' }).jobs.feeds;
    expect(feeds).toEqual([{ url: 'https://a.example/f.json', name: null }, { url: 'https://b.example/rss', name: 'B' }]);
  });

  it('JOB_FEEDS malformado ou com http é erro de configuração, nunca um feed ignorado em silêncio', () => {
    expect(() => loadConfig({ ...BASE_ENV, JOB_FEEDS: 'https://a.example/f.json' })).toThrow(/JOB_FEEDS/);
    expect(() => loadConfig({ ...BASE_ENV, JOB_FEEDS: '{"a":1}' })).toThrow(/JOB_FEEDS/);
    expect(() => loadConfig({ ...BASE_ENV, JOB_FEEDS: '["http://a.example/f.json"]' })).toThrow(/https/);
    expect(() => loadConfig({ ...BASE_ENV, JOB_FEEDS: '[42]' })).toThrow(/https/);
  });

  it('JOBS_SYNC_MINUTES tem piso de 10', () => {
    expect(() => loadConfig({ ...BASE_ENV, JOBS_SYNC_MINUTES: '5' })).toThrow();
    expect(loadConfig({ ...BASE_ENV, JOBS_SYNC_MINUTES: '120' }).jobs.syncMinutes).toBe(120);
  });
});

describe('quais fontes o serviço liga', () => {
  const service = (env) => new JobService({ prisma: {}, config: loadConfig({ ...BASE_ENV, ...env }), fetchImpl: async () => ok({ results: [] }) });
  const names = (env) => service(env).adapters().map((a) => a.name);

  it('sem chaves e sem feeds, nenhuma: a página mostra "Fonte de vagas não configurada"', () => {
    expect(names({ JOBS_SYNC_ENABLED: 'true' })).toEqual([]);
  });

  it('com as chaves mas a sincronização desligada, também nenhuma', () => {
    expect(names({ ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' })).toEqual([]);
  });

  it('Adzuna e feeds, quando ligados', () => {
    expect(names({ JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' })).toEqual(['ADZUNA']);
    expect(names({ JOBS_SYNC_ENABLED: 'true', JOB_FEEDS: '["https://a.example/f.json"]' })).toEqual(['FEED']);
    expect(names({ JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b', JOB_FEEDS: '["https://a.example/f.json"]' })).toEqual(['ADZUNA', 'FEED']);
  });

  it('DEMO_MODE=true: só a demonstração, mesmo com chaves; DEMO_MODE=false: a demonstração nunca roda', () => {
    expect(names({ DEMO_MODE: 'true' })).toEqual(['DEMO']);
    expect(names({ DEMO_MODE: 'true', JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' })).toEqual(['DEMO']);
    expect(names({ DEMO_MODE: 'false', JOBS_SYNC_ENABLED: 'true', ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b' })).not.toContain('DEMO');
    expect(names({ DEMO_MODE: 'false' })).toEqual([]);
  });
});
