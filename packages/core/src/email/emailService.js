import { getConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * EmailService — transactional e-mail with pluggable transport.
 *  - console: development only; prints the message (including links) to stdout.
 *             In production the body is NOT printed, only the recipient/subject.
 *  - resend:  https://resend.com HTTP API (EMAIL_API_KEY).
 */
export class EmailService {
  constructor({ config = getConfig(), fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.outbox = []; // last messages, useful for tests/dev tooling
  }

  async send({ to, subject, text, html }) {
    const { provider, apiKey, from } = this.config.email;
    this.outbox.push({ to, subject, text });
    if (this.outbox.length > 50) this.outbox.shift();

    if (provider === 'resend' && apiKey) {
      const res = await this.fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      if (!res.ok) {
        logger.error('email send failed', { status: res.status, subject });
        return false;
      }
      return true;
    }

    if (this.config.isProduction) {
      logger.warn('email provider not configured; message not delivered', { subject });
      return false;
    }
    if (!this.config.isTest) {
      // eslint-disable-next-line no-console
      console.log(`\n──── e-mail (dev) ────\nPara: ${to}\nAssunto: ${subject}\n\n${text}\n──────────────────────\n`);
    }
    return true;
  }

  activationEmail({ to, name, link }) {
    return this.send({
      to,
      subject: 'Seu TemPix foi ativado — crie sua senha',
      text: `Olá, ${name}.\n\nSeu pagamento foi confirmado e sua assinatura TemPix está ativa.\nCrie sua senha de acesso (link válido por 48 horas, uso único):\n\n${link}\n\nSe você não reconhece esta compra, ignore este e-mail.`,
    });
  }

  collaboratorInviteEmail({ to, name, company, link }) {
    return this.send({
      to,
      subject: `Você foi convidado para o TemPix de ${company}`,
      text: `Olá, ${name}.\n\n${company} liberou seu acesso ao TemPix. Crie sua senha (link válido por 48 horas, uso único):\n\n${link}\n\nDepois, entre com o seu CPF e a senha que você criar.\n\nSe você não esperava este convite, ignore este e-mail.`,
    });
  }

  passwordResetEmail({ to, name, link }) {
    return this.send({
      to,
      subject: 'Redefinição de senha — TemPix',
      text: `Olá, ${name}.\n\nRecebemos um pedido para redefinir sua senha. O link abaixo é válido por 1 hora e pode ser usado uma única vez:\n\n${link}\n\nSe você não fez esse pedido, ignore este e-mail. Sua senha atual continua valendo.`,
    });
  }
}
