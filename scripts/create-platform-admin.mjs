#!/usr/bin/env node
/*
 * Creates the first platform administrator (a personal account with CPF).
 * Run it once, from your own machine, with the production database URL in the
 * environment. Never paste the URL or the password into a chat:
 *
 *   DATABASE_URL='...' node scripts/create-platform-admin.mjs \
 *     --cpf 500.765.758-10 --email voce@exemplo.com --name "Nome Completo"
 *
 * The password is asked on the terminal, hidden as you type. It must have at
 * least 10 characters with letters and numbers. It is hashed and never printed.
 */
import readline from 'node:readline';
import { loadConfig } from '../packages/core/src/config.js';
import { disconnectPrisma, getPrisma } from '../packages/core/src/db.js';
import { FinancialAuditService } from '../packages/core/src/finance/FinancialAuditService.js';
import { createPlatformAdmin } from '../packages/core/src/services/platformAdminService.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

/** Reads one line from the terminal without echoing it. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) rl.output.write(text);
      else rl.output.write('');
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPasswordFromPipe() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data.split(/\r?\n/)[0];
}

const args = parseArgs(process.argv.slice(2));
if (!args.cpf || !args.email || !args.name || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node scripts/create-platform-admin.mjs --cpf 000.000.000-00 --email voce@exemplo.com --name "Nome Completo"');
  process.exit(2);
}

const password = process.stdin.isTTY
  ? await askHidden('Senha do administrador (não aparece ao digitar): ')
  : await readPasswordFromPipe();

const config = loadConfig({ ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' });
const prisma = getPrisma();
const audit = new FinancialAuditService({ prisma, config });
try {
  const created = await createPlatformAdmin({ prisma, audit, cpf: args.cpf, email: args.email, name: args.name, password });
  console.log(`Conta de administrador criada (userId ${created.userId}). Entre com o CPF e a senha definida.`);
} catch (err) {
  console.error('Conta não criada:', err.message);
  process.exitCode = 1;
} finally {
  await disconnectPrisma();
}
