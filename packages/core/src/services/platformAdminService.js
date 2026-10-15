import { isValidCpf, onlyDigits, passwordSchema } from '@autopix/shared';
import { badRequest, conflict } from '../errors.js';
import { hashPassword } from '../security/password.js';

/**
 * Creates the first platform administrator: a personal (CPF) account that is
 * already active, so nobody needs the signup email to get in. It is run by an
 * operator with the production database URL (scripts/create-platform-admin.mjs),
 * never by a web request. The password is hashed here and never stored or logged
 * in plain text. The creation is recorded in the financial audit log.
 */
export async function createPlatformAdmin({ prisma, audit, cpf, email, name, password }) {
  const doc = onlyDigits(String(cpf || ''));
  if (!isValidCpf(doc)) throw badRequest('CPF inválido.');
  const mail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw badRequest('E-mail inválido.');
  const cleanName = String(name || '').trim();
  if (cleanName.length < 3) throw badRequest('Informe o nome completo.');
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || 'Senha inválida.');

  const existing = await prisma.user.findFirst({ where: { OR: [{ loginId: doc }, { email: mail }] }, select: { id: true } });
  if (existing) throw conflict('Já existe uma conta com este CPF ou e-mail. Nada foi alterado.');

  const passwordHash = await hashPassword(password);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: cleanName, accountType: 'PERSON', onboardingStep: 1, onboardingCompletedAt: now },
    });
    const user = await tx.user.create({
      data: {
        email: mail,
        name: cleanName,
        loginId: doc,
        passwordHash,
        passwordChangedAt: now,
        status: 'ACTIVE',
        role: 'OWNER',
        isPlatformAdmin: true,
        emailVerifiedAt: now,
        companyId: company.id,
      },
    });
    await audit.log({ action: 'PLATFORM_ADMIN_CREATED', source: 'ADMIN', userId: user.id, companyId: company.id, metadata: { cpfLast4: doc.slice(-4) } }, tx);
    return { userId: user.id, companyId: company.id };
  });
}
