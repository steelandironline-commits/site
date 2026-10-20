import request from 'supertest';
import { generateToken, hashToken, hashPassword } from '@autopix/core';
import { COMMISSION_PLAN_CODE } from '@autopix/shared';
import { STRONG_PASSWORD, testCnpj, testCpf } from './helpers.js';

/** Dois hosts de área; a configuração de teste (NODE_ENV=test) usa http. */
export const AREA_ENV = {
  PUBLIC_HOST_CNPJ: 'temcnpj.com.br',
  PUBLIC_HOST_CPF: 'cpf.temcnpj.com.br',
  BILLING_MODEL: 'commission',
};
export const CNPJ_HOST = 'temcnpj.com.br';
export const CPF_HOST = 'cpf.temcnpj.com.br';
export const ADMIN_HOST = 'admin.temcnpj.com.br';

/** Nome do cookie de cada host em desenvolvimento/teste (http, sem __Host-). */
export const DEV_COOKIE = { [CNPJ_HOST]: 'ap_session', [CPF_HOST]: 'ap_session_cpf', [ADMIN_HOST]: 'ap_session_admin' };

const origin = (host) => `http://${host}`;

/**
 * Um pedido ao app como o navegador de `host` o faria: Host, Origin do próprio host e
 * X-Requested-With. Cada campo pode ser trocado ou removido (`null`) para provar uma recusa.
 * `cookie` é "nome=valor" e `bearer` é um token; nada de cookie jar, para o teste mandar
 * exatamente o que quer.
 */
export function call(app, host, method, url, { body, cookie, bearer, origin: org = origin(host), xrw = 'autopix', headers = {} } = {}) {
  let req = request(app)[method](url).set('Host', host);
  if (org !== null) req = req.set('Origin', org);
  if (xrw !== null) req = req.set('X-Requested-With', xrw);
  if (cookie) req = req.set('Cookie', cookie);
  if (bearer) req = req.set('Authorization', `Bearer ${bearer}`);
  for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
  return body === undefined ? req : req.send(body);
}

/** O `Set-Cookie` de nome `name`, inteiro, ou undefined. */
export function setCookieOf(res, name) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
}

/** "nome=valor" de um Set-Cookie, para reenviar em `Cookie`. */
export function cookiePair(setCookie) {
  return setCookie.split(';')[0];
}

/** Valor do cookie de um Set-Cookie. */
export function cookieValue(setCookie) {
  return cookiePair(setCookie).split('=').slice(1).join('=');
}

let seq = 0;

/**
 * Conta ativa criada direto no banco (sem passar pelo cadastro), com senha e, por padrão, o
 * acesso ativo. `platformAdmin` cria a conta de admin como o script faz: PERSON.
 */
export async function makeAccount(prisma, { accountType = 'COMPANY', platformAdmin = false, status = 'ACTIVE', subscription = true, whatsapp = false } = {}) {
  seq += 1;
  const document = accountType === 'COMPANY' ? testCnpj() : testCpf();
  const email = `conta${seq}-${Date.now()}@area.example`;
  const now = new Date();
  const company = await prisma.company.create({
    data: {
      name: accountType === 'COMPANY' ? `Empresa ${seq}` : `Pessoa ${seq}`,
      accountType,
      cnpj: accountType === 'COMPANY' ? document : null,
      onboardingStep: 1,
      onboardingCompletedAt: now,
    },
  });
  const user = await prisma.user.create({
    data: {
      email,
      name: `Dono ${seq}`,
      loginId: document,
      passwordHash: await hashPassword(STRONG_PASSWORD),
      status,
      role: 'OWNER',
      isPlatformAdmin: platformAdmin,
      emailVerifiedAt: now,
      companyId: company.id,
    },
  });
  if (subscription) {
    await prisma.subscription.create({
      data: { companyId: company.id, plan: COMMISSION_PLAN_CODE, priceCents: 0, status: 'ACTIVE', provider: 'none', activatedAt: now },
    });
  }
  if (whatsapp) {
    await prisma.whatsAppConnection.create({
      data: { userId: user.id, phoneNumber: `55119${String(10_000_000 + seq).slice(-8)}`, provider: 'mock', status: 'VERIFIED', verifiedAt: now },
    });
  }
  return { user, company, email, document, password: STRONG_PASSWORD };
}

/** Sessão criada direto no banco com a área escolhida (para forjar o que o servidor não cria). */
export async function insertSession(prisma, config, { userId, area, scope = 'FULL' }) {
  const token = generateToken();
  const session = await prisma.session.create({
    data: {
      userId,
      scope,
      area,
      tokenHash: hashToken(token, config.secrets.session),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return { token, session };
}

/** Código do último desafio de WhatsApp enviado pelo provedor de mentira. */
export function lastAuthCode(services) {
  const sent = services.whatsappProvider.sent.findLast((m) => m.template?.name === 'mock_authentication_code');
  return sent.template.components.find((c) => c.type === 'body').parameters[0].text;
}
