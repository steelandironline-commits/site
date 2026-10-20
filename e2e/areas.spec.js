import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { AREA_NAME as CNPJ_NAME } from '@autopix/areas/brand/cnpj';
import { AREA_NAME as CPF_NAME } from '@autopix/areas/brand/cpf';
import { HOST_CNPJ, HOST_CPF, PORT, REDIRECT_CNPJ, REDIRECT_CPF, ROOT, url } from './support/env.js';
import { closeDatabase, createAccount } from './support/accounts.js';

// Ponta a ponta das duas áreas, num Chromium de verdade, contra o servidor real e os builds de verdade
// (ver playwright.config.js). Os nomes são os de produção: temcnpj.com.br e cpf.temcnpj.com.br.

const NOT_FOUND_HEADING = 'Página não encontrada.';
const publicFile = (area, file) => fs.readFileSync(path.join(ROOT, 'apps/web/areas', area, 'public', file), 'utf8');

/** Lê um caminho do mesmo host, de dentro da página (assim passa pela rede do Chromium e pelas regras de host). */
const read = (page, pathname) =>
  page.evaluate(async (p) => {
    const res = await fetch(p, { headers: { Accept: 'text/html' }, cache: 'no-store' });
    return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
  }, pathname);

test.afterAll(async () => {
  await closeDatabase();
});

test.describe('home de cada área', () => {
  test('a home do CNPJ mostra "Tem CNPJ" e nada da área de pessoas', async ({ page }) => {
    const response = await page.goto(url(HOST_CNPJ));
    expect(response.status()).toBe(200);
    await expect(page.getByRole('link', { name: `${CNPJ_NAME} — início` })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(CNPJ_NAME);
    await expect(page.getByText('Tem CNPJ não tem vínculo com a Receita Federal.')).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('Tem CPF');
    expect(text).not.toMatch(/pessoa f[ií]sica/i);
  });

  test('a home do CPF mostra "Tem CPF" e nada da área de empresas', async ({ page }) => {
    const response = await page.goto(url(HOST_CPF));
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: CPF_NAME })).toBeVisible();
    await expect(page.getByText('Tem CPF não tem vínculo com a Receita Federal.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Criar conta' })).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text).not.toContain('CNPJ');
    expect(text).not.toMatch(/licita[cç][oõ]es|colaborador/i);
  });
});

test.describe('rotas da outra área caem em NotFound', () => {
  test('/app/licitacoes no CPF responde 404 e mostra a página não encontrada, sem redirecionar', async ({ page }) => {
    const response = await page.goto(url(HOST_CPF, '/app/licitacoes'));
    expect(response.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/app/licitacoes');
    expect(new URL(page.url()).host).toBe(HOST_CPF);
    // A página não cita o que existe do outro lado.
    expect(await page.locator('body').innerText()).not.toMatch(/CNPJ|licita[cç][oõ]es/i);
  });

  test('/app/perfil (página do CPF) no CNPJ também é NotFound, e o contrário vale para o painel de empresa', async ({ page }) => {
    const response = await page.goto(url(HOST_CNPJ, '/app/perfil'));
    expect(response.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible();
    for (const pathname of ['/app/radar', '/app/pay', '/app/freight', '/checkout', '/app/admin']) {
      const res = await page.goto(url(HOST_CPF, pathname));
      expect(res.status(), pathname).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING }), pathname).toBeVisible();
    }
  });

  test('um endereço que nenhuma área tem responde igual no CNPJ e no CPF', async ({ page }) => {
    for (const host of [HOST_CNPJ, HOST_CPF]) {
      const res = await page.goto(url(host, '/nada/aqui'));
      expect(res.status(), host).toBe(404);
      await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING }), host).toBeVisible();
    }
  });
});

test.describe('acesso do CPF', () => {
  test('o login do CPF pede só o CPF: "CNPJ" não aparece como opção de documento', async ({ page }) => {
    await page.goto(url(HOST_CPF, '/login'));
    await expect(page.getByRole('heading', { level: 1, name: `Entrar no ${CPF_NAME}` })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'CPF' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toContain('CNPJ');
    // Nem como opção de lista, aba ou botão de rádio.
    await expect(page.getByRole('option', { name: /CNPJ/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /CNPJ/ })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: /CNPJ/ })).toHaveCount(0);
    expect(await page.locator('select option').allInnerTexts()).not.toContain('CNPJ');
  });

  test('o cadastro e a recuperação de senha do CPF também não falam em CNPJ', async ({ page }) => {
    for (const pathname of ['/onboarding', '/forgot-password']) {
      await page.goto(url(HOST_CPF, pathname));
      await expect(page.locator('main, #root').first()).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      expect(await page.locator('body').innerText(), pathname).not.toContain('CNPJ');
    }
  });

  test('o login do CNPJ pede o CNPJ (e o do colaborador, o CPF), sem a opção de pessoa física', async ({ page }) => {
    await page.goto(url(HOST_CNPJ, '/login'));
    await expect(page.getByRole('heading', { level: 1, name: `Entrar no ${CNPJ_NAME}` })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'CNPJ' })).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/pessoa f[ií]sica/i);
  });
});

test.describe('título, ícone e manifesto próprios', () => {
  for (const [label, host, area, name] of [
    ['CNPJ', HOST_CNPJ, 'cnpj', CNPJ_NAME],
    ['CPF', HOST_CPF, 'cpf', CPF_NAME],
  ]) {
    test(`${label}: o HTML, o título, o favicon e o manifesto são da área`, async ({ page }) => {
      await page.goto(url(host));
      // O que um buscador lê (HTML estático) e o que o navegador mostra depois do JavaScript.
      const html = (await read(page, '/')).text;
      expect(html).toContain(`<title>${name}</title>`);
      expect(html).toContain(`<meta property="og:title" content="${name}"`);
      await expect(page).toHaveTitle(new RegExp(`^${name}`));

      // O favicon que a página declara é o arquivo da área, byte a byte.
      const href = await page.locator('link[rel~="icon"]').first().getAttribute('href');
      expect(href).toBeTruthy();
      const favicon = await read(page, href);
      expect(favicon.status).toBe(200);
      expect(favicon.text).toBe(publicFile(area, 'favicon.svg'));

      // O manifesto também.
      const manifest = JSON.parse((await read(page, '/manifest.webmanifest')).text);
      expect(manifest.name).toBe(name);
      expect(manifest.short_name).toBe(name);
    });
  }

  test('os dois manifestos são diferentes entre si (id e cor do tema)', async ({ page }) => {
    await page.goto(url(HOST_CNPJ));
    const cnpj = JSON.parse((await read(page, '/manifest.webmanifest')).text);
    await page.goto(url(HOST_CPF));
    const cpf = JSON.parse((await read(page, '/manifest.webmanifest')).text);
    expect(cnpj.id).not.toBe(cpf.id);
    expect(cnpj.theme_color).not.toBe(cpf.theme_color);
  });

  // LACUNA CONHECIDA, não escondida: hoje cada área serve o PRÓPRIO arquivo (testes acima), mas os dois
  // favicon.svg e todos os ícones de apps/web/areas/<área>/public/ têm exatamente o mesmo desenho (o ícone
  // do TemPix). A arte de cada área depende da decisão de marca (Q7, docs/divisao/PROGRESSO.md). Quando
  // houver arte própria, troque test.fixme por test e o teste passa a valer.
  test.fixme('o favicon de cada área tem arte própria (hoje os dois são o mesmo desenho)', async ({ page }) => {
    await page.goto(url(HOST_CNPJ));
    const cnpj = (await read(page, '/favicon.svg')).text;
    await page.goto(url(HOST_CPF));
    const cpf = (await read(page, '/favicon.svg')).text;
    expect(cnpj).not.toBe(cpf);
  });

  test('o robots.txt e o sitemap de cada host apontam para o próprio host', async ({ page }) => {
    for (const [host, other] of [[HOST_CNPJ, HOST_CPF], [HOST_CPF, `https://${HOST_CNPJ}/`]]) {
      await page.goto(url(host));
      const robots = (await read(page, '/robots.txt')).text;
      expect(robots).toContain(`Sitemap: https://${host}/sitemap.xml`);
      expect(robots).not.toContain(other);
      const sitemap = (await read(page, '/sitemap.xml')).text;
      expect(sitemap).toContain(`https://${host}/`);
      expect(sitemap).not.toContain(other);
    }
  });
});

test.describe('sessão e API nas duas áreas (conta criada no banco de teste)', () => {
  for (const [label, host, otherHost, accountType, cookieName] of [
    ['CPF', HOST_CPF, HOST_CNPJ, 'PERSON', 'ap_session_cpf'],
    ['CNPJ', HOST_CNPJ, HOST_CPF, 'COMPANY', 'ap_session'],
  ]) {
    test(`${label}: entra pela tela, o cookie é só do host, e a sessão não vale na outra área`, async ({ page, context }) => {
      const account = await createAccount(accountType);
      try {
        await page.goto(url(host, '/login'));
        await page.getByRole('textbox', { name: accountType === 'PERSON' ? 'CPF' : 'CNPJ' }).fill(account.document);
        await page.getByRole('textbox', { name: 'Senha' }).fill(account.password);
        await page.getByRole('button', { name: 'ENTRAR' }).click();
        await expect(page).toHaveURL(url(host, '/app'));

        // Um cookie, com o nome da área, host-only (sem ponto na frente do domínio), HttpOnly e SameSite=Lax.
        const cookies = await context.cookies();
        expect(cookies.map((c) => c.name)).toEqual([cookieName]);
        expect(cookies[0]).toMatchObject({ domain: host, path: '/', httpOnly: true, sameSite: 'Lax' });

        const me = await read(page, '/api/me');
        expect(me.status).toBe(200);
        expect(JSON.parse(me.text)).toMatchObject({ area: accountType === 'PERSON' ? 'CPF' : 'CNPJ' });

        // Na outra área: o navegador não leva o cookie, então a pessoa cai no login e a API diz 401.
        await page.goto(url(otherHost, '/app'));
        await expect(page).toHaveURL(new RegExp(`^${url(otherHost, '/login')}`));
        expect((await read(page, '/api/me')).status).toBe(401);
        expect(JSON.parse((await read(page, '/api/session')).text)).toEqual({ session: null });

        // E a sessão do primeiro host continua de pé.
        await page.goto(url(host, '/app'));
        await expect(page).toHaveURL(url(host, '/app'));
        expect((await read(page, '/api/me')).status).toBe(200);
      } finally {
        await account.remove();
      }
    });
  }

  test('a conta de uma área não entra pela tela da outra: a resposta é a de senha errada', async ({ page }) => {
    const person = await createAccount('PERSON');
    try {
      await page.goto(url(HOST_CNPJ, '/login'));
      await page.getByRole('textbox', { name: 'CNPJ' }).fill(person.document);
      await page.getByRole('textbox', { name: 'Senha' }).fill(person.password);
      await page.getByRole('button', { name: 'ENTRAR' }).click();
      await expect(page.getByText('Documento ou senha incorretos.')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/login');
      expect(await page.context().cookies()).toEqual([]);
    } finally {
      await person.remove();
    }
  });

  test('a página de um host não alcança a API do outro, e a rota da outra área responde 404', async ({ page }) => {
    await page.goto(url(HOST_CPF));
    const result = await page.evaluate(async ({ cnpjApi, own }) => {
      const cross = await fetch(cnpjApi).then((r) => `status ${r.status}`, (e) => `bloqueado: ${e.name}`);
      const company = await fetch(own).then((r) => r.status);
      return { cross, company };
    }, { cnpjApi: url(HOST_CNPJ, '/api/session'), own: '/api/company' });
    // A CSP (connect-src 'self') barra o pedido para o outro host antes de sair do navegador.
    expect(result.cross).toMatch(/bloqueado/);
    expect(result.company).toBe(404);
  });
});

test.describe('hosts de redirecionamento e host desconhecido', () => {
  test('temcpf.com.br leva ao host do CPF com 301, mantendo caminho e parâmetros', async ({ page }) => {
    for (const alias of REDIRECT_CPF) {
      const response = await page.goto(url(alias, '/onboarding?utm_source=x'));
      expect(response.request().redirectedFrom()?.url(), alias).toBe(url(alias, '/onboarding?utm_source=x'));
      expect((await response.request().redirectedFrom().response()).status(), alias).toBe(301);
      expect(page.url()).toBe(url(HOST_CPF, '/onboarding?utm_source=x'));
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    }
  });

  test('www.temcnpj.com.br leva ao host do CNPJ com 301', async ({ page }) => {
    for (const alias of REDIRECT_CNPJ) {
      const response = await page.goto(url(alias, '/login'));
      expect((await response.request().redirectedFrom().response()).status(), alias).toBe(301);
      expect(page.url()).toBe(url(HOST_CNPJ, '/login'));
    }
  });

  test('um host que não é de nenhuma área responde 404 neutro, mas o health continua', async ({ page }) => {
    const stranger = await page.goto(`http://127.0.0.1:${PORT}/`);
    expect(stranger.status()).toBe(404);
    expect(await page.locator('body').innerText()).toBe('Not Found');
    const health = await page.goto(`http://127.0.0.1:${PORT}/api/health`);
    expect(health.status()).toBe(200);
  });
});
