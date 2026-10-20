import { formatCnpj, maskCpf } from '@autopix/shared';
import { getPrisma } from '../db.js';
import { getConfig } from '../config.js';
import { conflict, notFound } from '../errors.js';
import { logger } from '../logger.js';
import { ActivityService } from './activityService.js';
import { AuthService } from './authService.js';

const MEMBER_SELECT = { id: true, name: true, email: true, role: true, status: true, loginId: true, createdAt: true, lastLoginAt: true };

/**
 * Collaborators. A company has one login (its CNPJ); the owner opens access
 * for collaborators inside, each with their own CPF and password. The owner
 * never sets a collaborator's password: an activation link does.
 */
export class TeamService {
  constructor({ prisma = getPrisma(), config = getConfig(), email } = {}) {
    this.prisma = prisma;
    this.config = config;
    this.email = email;
    this.auth = new AuthService({ prisma, config });
    this.activity = new ActivityService({ prisma });
  }

  view(u) {
    const doc = u.loginId || '';
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      login: doc.length === 14 ? formatCnpj(doc) : maskCpf(doc),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }

  async list(companyId) {
    const users = await this.prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' }, select: MEMBER_SELECT });
    return users.map((u) => this.view(u));
  }

  async invite(company, actor, { name, email, cpf }) {
    if (company.accountType !== 'COMPANY') throw conflict('Colaboradores são para contas de empresa.');
    if (await this.prisma.user.findUnique({ where: { email } })) throw conflict('Este e-mail já tem cadastro no TemPix.');
    if (await this.prisma.user.findUnique({ where: { loginId: cpf } })) throw conflict('Este CPF já tem cadastro no TemPix.');
    const { member, token, area } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { companyId: company.id, email, name, loginId: cpf, role: 'MEMBER', status: 'PENDING_ACTIVATION' },
        select: MEMBER_SELECT,
      });
      return { member: created, ...(await this.auth.issueActivation(created.id, tx)) };
    });
    const link = this.auth.activationLink(token, area);
    const emailed = this.email
      ? await this.email.collaboratorInviteEmail({ to: email, name, company: company.name, link }).catch((err) => {
          logger.error('collaborator invite email failed', { err });
          return false;
        })
      : false;
    await this.activity.record({
      companyId: company.id,
      userId: actor.id,
      type: 'SYSTEM',
      title: 'Colaborador convidado',
      description: `${name} poderá entrar com o próprio CPF.`,
      source: 'Equipe',
      severity: 'SUCCESS',
    });
    // The link goes back only to the owner who invited (to share by WhatsApp,
    // for instance); it is single-use and expires in 48 hours.
    return { member: this.view(member), invite: { link, emailed: Boolean(emailed) } };
  }

  async remove(company, actor, memberId) {
    const member = await this.prisma.user.findFirst({ where: { id: memberId, companyId: company.id } });
    if (!member) throw notFound('Colaborador não encontrado.');
    if (member.role === 'OWNER') throw conflict('O acesso principal da empresa não pode ser removido.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.session.deleteMany({ where: { userId: member.id } });
      await tx.activationToken.updateMany({ where: { userId: member.id, usedAt: null }, data: { usedAt: new Date() } });
      return tx.user.update({ where: { id: member.id }, data: { status: 'DISABLED' }, select: MEMBER_SELECT });
    });
    await this.activity.record({
      companyId: company.id,
      userId: actor.id,
      type: 'SYSTEM',
      title: 'Acesso de colaborador removido',
      description: member.name,
      source: 'Equipe',
      severity: 'WARNING',
    });
    return this.view(updated);
  }
}
