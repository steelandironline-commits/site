import { describe, it, expect } from 'vitest';
import express, { Router } from 'express';
import request from 'supertest';
import { ANY_AREA } from '@autopix/areas';
import { hostArea, initAreaMounts, mountArea, mountsOf, onlyArea } from '../src/middleware/area.js';
import { requireAuth } from '../src/middleware/session.js';
import { HOSTS } from './areaHelpers.js';
import { testConfig } from './helpers.js';

// 4b · mountArea e onlyArea. Sem banco: um app de sonda com o hostArea real e roteadores mínimos.

const CNPJ = 'temcnpj.com.br';
const CPF = 'cpf.temcnpj.com.br';

/** Roteador que responde 200 com a área vista; com `auth` ele exige sessão (401 sem). */
function probeRouter({ auth = false } = {}) {
  const r = Router();
  if (auth) r.use(requireAuth);
  r.get('/', (req, res) => res.json({ reached: true, area: req.area }));
  return r;
}

function probe(env, mounts) {
  const config = testConfig(env);
  const app = express();
  app.set('trust proxy', 1);
  app.use(hostArea(config));
  initAreaMounts(app, config);
  for (const [path, areas, opts] of mounts) mountArea(app, path, areas, probeRouter(opts));
  return app;
}

const get = (app, host, path) => request(app).get(path).set('Host', host);

describe('mountArea · declaração', () => {
  const config = testConfig(HOSTS);
  const fresh = () => initAreaMounts(express(), config);

  it('recusa montagem sem áreas declaradas, com lista vazia ou com área desconhecida', () => {
    for (const bad of [undefined, null, [], 'CNPJ', ['cnpj'], ['CNPJ', 'PLATFORM'], [undefined]]) {
      expect(() => mountArea(fresh(), '/api/x', bad, probeRouter()), String(bad)).toThrow(TypeError);
    }
  });

  it('recusa montar antes de o app declarar o modo de áreas, e caminho ou router inválidos', () => {
    expect(() => mountArea(express(), '/api/x', ['CNPJ'], probeRouter())).toThrow(/modo de áreas/);
    expect(() => mountArea(fresh(), 'api/x', ['CNPJ'], probeRouter())).toThrow(TypeError);
    expect(() => mountArea(fresh(), '/api/x', ['CNPJ'], undefined)).toThrow(TypeError);
  });

  it('registra cada montagem, na ordem, com as áreas congeladas e copiadas', () => {
    const app = fresh();
    const areas = ['CNPJ', 'CPF'];
    mountArea(app, '/api/a', areas, probeRouter());
    mountArea(app, '/api/b', ['ADMIN'], probeRouter());
    mountArea(app, '/api/c', ANY_AREA, probeRouter());
    areas.push('ADMIN'); // mudar a lista de quem chamou não muda o registro
    const mounts = mountsOf(app);
    expect(mounts.map((m) => m.path)).toEqual(['/api/a', '/api/b', '/api/c']);
    expect(mounts[0].areas).toEqual(['CNPJ', 'CPF']);
    expect(Object.isFrozen(mounts[0].areas)).toBe(true);
    expect(mounts[2].areas).toEqual(ANY_AREA);
  });

  it('cada app tem o seu registro', () => {
    const a = fresh();
    const b = fresh();
    mountArea(a, '/api/a', ['CNPJ'], probeRouter());
    expect(mountsOf(a)).toHaveLength(1);
    expect(mountsOf(b)).toHaveLength(0);
  });
});

describe('onlyArea · modo de áreas', () => {
  const app = probe(HOSTS, [
    ['/api/so-cnpj', ['CNPJ'], { auth: true }],
    ['/api/so-cpf', ['CPF'], { auth: true }],
    ['/api/os-dois', ['CNPJ', 'CPF'], { auth: true }],
    ['/api/infra', ANY_AREA],
  ]);

  it('responde 404 antes da autenticação: rota do CNPJ no host CPF é 404, não 401', async () => {
    const wrong = await get(app, CPF, '/api/so-cnpj');
    expect(wrong.status).toBe(404);
    expect(wrong.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
    // No host certo, a autenticação volta a mandar.
    expect((await get(app, CNPJ, '/api/so-cnpj')).status).toBe(401);
    expect((await get(app, CNPJ, '/api/so-cpf')).status).toBe(404);
    expect((await get(app, CPF, '/api/so-cpf')).status).toBe(401);
  });

  it('a mesma resposta de uma rota que não existe', async () => {
    const wrong = await get(app, CPF, '/api/so-cnpj');
    const unknown = await get(app, CPF, '/api/nao-existe-mesmo');
    expect(wrong.status).toBe(unknown.status);
    // A sonda não tem notFoundApi final; o corpo do guarda é o do notFoundApi.
    expect(wrong.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
  });

  it('deixa passar as áreas declaradas', async () => {
    for (const host of [CNPJ, CPF]) expect((await get(app, host, '/api/os-dois')).status, host).toBe(401);
  });

  it('host sem área só passa em ANY_AREA (falha fechada)', async () => {
    // /api/health e /api/webhooks/* chegam com req.area nulo; a sonda simula pelo caminho de saúde.
    const infra = probe(HOSTS, [['/api/health', ANY_AREA], ['/api/x', ['CNPJ']]]);
    const health = await get(infra, 'x.up.railway.app', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ reached: true, area: null });
    expect((await get(infra, 'x.up.railway.app', '/api/x')).status).toBe(404);
  });

  it('ANY_AREA responde em qualquer host de área', async () => {
    for (const host of [CNPJ, CPF]) expect((await get(app, host, '/api/infra')).status, host).toBe(200);
  });

  it('o guarda sozinho: área não declarada em nenhum lugar não passa', () => {
    expect(() => onlyArea(undefined, true)).toThrow(TypeError);
    expect(() => onlyArea([], true)).toThrow(TypeError);
  });
});

describe('onlyArea · modo legado', () => {
  const app = probe({}, [
    ['/api/so-cnpj', ['CNPJ'], { auth: true }],
    ['/api/so-cpf', ['CPF']],
    ['/api/so-admin', ['ADMIN']],
  ]);

  it('não bloqueia nada, em nenhum host (a área é nula)', async () => {
    for (const host of ['localhost:5173', 'x.up.railway.app', CNPJ, CPF, 'temcpf.com.br']) {
      expect((await get(app, host, '/api/so-cpf')).body, host).toEqual({ reached: true, area: null });
      expect((await get(app, host, '/api/so-admin')).status, host).toBe(200);
      // A autenticação continua a mesma de antes.
      expect((await get(app, host, '/api/so-cnpj')).status, host).toBe(401);
    }
  });
});
