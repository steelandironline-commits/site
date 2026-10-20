import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ActionEngine } from '../src/actions/ActionEngine.js';
import { registerCoreActions } from '../src/actions/definitions.js';
import { loadConfig } from '../src/config.js';

// 4b · definições de ação e áreas (sem banco). O comportamento do motor com banco está em
// apps/api/test/action-areas.test.js.

const legacy = loadConfig({ NODE_ENV: 'test' });
const areaMode = loadConfig({ NODE_ENV: 'test', PUBLIC_HOST_CNPJ: 'temcnpj.com.br', PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br' });

describe('ActionEngine · definições e áreas', () => {
  const engine = registerCoreActions(new ActionEngine({ prisma: {}, config: legacy, services: {} }));
  const defs = [...engine.actions.values()];
  const namesFor = (area) => defs.filter((d) => d.areas?.includes(area)).map((d) => d.name).sort();

  it('toda ação declara areas, com áreas conhecidas e sem repetição', () => {
    expect(defs.length).toBeGreaterThan(50);
    for (const d of defs) {
      expect(Array.isArray(d.areas), d.name).toBe(true);
      expect(d.areas.length, d.name).toBeGreaterThan(0);
      expect(new Set(d.areas).size, d.name).toBe(d.areas.length);
      for (const a of d.areas) expect(['CNPJ', 'CPF', 'ADMIN'], `${d.name} ${a}`).toContain(a);
    }
  });

  it('ação de administração é só ADMIN e nenhuma outra ação é ADMIN', () => {
    for (const d of defs) {
      if (d.platformAdmin) expect(d.areas, d.name).toEqual(['ADMIN']);
      else expect(d.areas, d.name).not.toContain('ADMIN');
    }
    expect(namesFor('ADMIN')).toEqual(['RESOLVE_DISPUTE', 'RESOLVE_RECONCILIATION_ISSUE', 'UPDATE_COMMISSION_RULE']);
  });

  it('o CPF só tem as ações do feed social; o resto é do CNPJ', () => {
    expect(namesFor('CPF')).toEqual(['COMMENT_SOCIAL_POST', 'DELETE_SOCIAL_POST', 'PUBLISH_SOCIAL_POST', 'REPOST_SOCIAL_POST']);
    expect(namesFor('CNPJ')).toEqual(expect.arrayContaining(namesFor('CPF')));
    // Ações de empresa, de pagamento, de carga, de equipe, de agentes e de plano nunca chegam ao CPF.
    for (const name of [
      'CREATE_SUBSCRIPTION_PIX', 'CREATE_TRANSACTION', 'CREATE_PIX', 'RELEASE_PAYMENT', 'CHANGE_BANK_DETAILS', 'INVITE_COLLABORATOR',
      'REMOVE_COLLABORATOR', 'UPDATE_COMPANY_PROFILE', 'START_AGENT', 'CANCEL_SUBSCRIPTION', 'CREATE_FREIGHT_REQUEST', 'CREATE_WORKFORCE_DEMAND',
      'LIST_TODAY_OPPORTUNITIES', 'START_TRIP',
    ]) {
      expect(engine.get(name).areas, name).toEqual(['CNPJ']);
    }
  });

  it('o registro recusa areas inválidas e aceita uma definição sem areas (negada no modo de áreas)', () => {
    const base = { name: 'X', schema: z.object({}), handler: async () => ({}) };
    const e = new ActionEngine({ prisma: {}, config: legacy, services: {} });
    for (const bad of [[], ['cnpj'], ['PLATFORM'], 'CNPJ', [null]]) expect(() => e.register({ ...base, areas: bad }), String(bad)).toThrow(/areas/);
    expect(() => e.register(base)).not.toThrow();
  });

  it('o catálogo no modo legado lista tudo; no modo de áreas só o que a área pode rodar', () => {
    expect(engine.catalog().length).toBe(defs.length);
    const areaEngine = registerCoreActions(new ActionEngine({ prisma: {}, config: areaMode, services: {} }));
    expect(areaEngine.catalog({ area: 'CPF' }).map((a) => a.name).sort()).toEqual(namesFor('CPF'));
    expect(areaEngine.catalog({ area: 'CNPJ' }).length).toBe(defs.length - 3);
    expect(areaEngine.catalog({ area: 'ADMIN' }).map((a) => a.name).sort()).toEqual(namesFor('ADMIN'));
    // Sem área, nada (falha fechada).
    expect(areaEngine.catalog()).toEqual([]);
    expect(areaEngine.catalog({ area: 'OUTRA' })).toEqual([]);
  });
});

