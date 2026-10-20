// Contas de teste para o ponta a ponta, gravadas no banco de teste (o mesmo que o servidor do E2E usa).
//
// Por que direto no banco e não pela API: o cadastro do CPF termina num link de ativação enviado por
// e-mail, e a API não devolve esse token (só o e-mail o carrega). Aqui nasce uma conta já ativa, com o
// mesmo formato que o cadastro deixa, e o login é feito pela tela de verdade.
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { COMMISSION_PLAN_CODE } from '@autopix/shared';
import { hashPassword } from '../../packages/core/src/security/password.js';
import { databaseUrl } from './env.js';

export const PASSWORD = 'e2e-senha-forte-2026';

let prisma;
const client = () => (prisma ??= new PrismaClient({ datasources: { db: { url: databaseUrl() } }, log: ['error'] }));

const digits = (n) => Array.from({ length: n }, () => crypto.randomInt(0, 10));

function checkDigit(base, weights) {
  const sum = base.reduce((acc, d, i) => acc + d * weights[i], 0) % 11;
  return sum < 2 ? 0 : 11 - sum;
}

/** CPF válido e aleatório (os 9 primeiros dígitos nunca são todos iguais). */
export function randomCpf() {
  let base;
  do base = digits(9);
  while (new Set(base).size === 1);
  const d1 = checkDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

/** CNPJ válido e aleatório (matriz /0001). */
export function randomCnpj() {
  const base = [...digits(8), 0, 0, 0, 1];
  const d1 = checkDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

/**
 * Cria uma conta ativa: `PERSON` (área CPF) ou `COMPANY` (área CNPJ). Devolve o documento (só dígitos), a
 * senha e os ids, e `remove()` apaga o que foi criado.
 */
export async function createAccount(accountType) {
  const db = client();
  const tag = crypto.randomBytes(4).toString('hex');
  const document = accountType === 'COMPANY' ? randomCnpj() : randomCpf();
  const now = new Date();
  const company = await db.company.create({
    data: {
      name: accountType === 'COMPANY' ? `Empresa E2E ${tag}` : `Pessoa E2E ${tag}`,
      accountType,
      cnpj: accountType === 'COMPANY' ? document : null,
      onboardingStep: 1,
      onboardingCompletedAt: now,
    },
  });
  const user = await db.user.create({
    data: {
      email: `e2e-${tag}@area.example`,
      name: `Dono E2E ${tag}`,
      loginId: document,
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      role: 'OWNER',
      emailVerifiedAt: now,
      companyId: company.id,
    },
  });
  await db.subscription.create({
    data: { companyId: company.id, plan: COMMISSION_PLAN_CODE, priceCents: 0, status: 'ACTIVE', provider: 'none', activatedAt: now },
  });

  return {
    document,
    password: PASSWORD,
    email: user.email,
    userId: user.id,
    companyId: company.id,
    async remove() {
      // Melhor esforço: o login deixa sessão e eventos; se algo impedir a remoção, o banco de teste é zerado pela suíte da API.
      try {
        await db.session.deleteMany({ where: { userId: user.id } });
        await db.activityEvent.deleteMany({ where: { companyId: company.id } });
        await db.subscription.deleteMany({ where: { companyId: company.id } });
        await db.user.delete({ where: { id: user.id } });
        await db.company.delete({ where: { id: company.id } });
      } catch {
        /* ignorado de propósito */
      }
    },
  };
}

export async function closeDatabase() {
  await prisma?.$disconnect();
  prisma = undefined;
}
