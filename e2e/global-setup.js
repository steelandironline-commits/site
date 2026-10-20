// Confere o que o ponta a ponta precisa antes de subir o navegador, com mensagem clara em vez de um erro solto.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { ROOT, chromiumPath, databaseUrl } from './support/env.js';

export default async function globalSetup() {
  for (const dir of ['dist-cnpj', 'dist-cpf']) {
    if (!fs.existsSync(path.join(ROOT, 'apps/web', dir, 'index.html'))) {
      throw new Error(`E2E: falta apps/web/${dir}. Rode "npm run build:areas" antes.`);
    }
  }
  const executable = chromiumPath();
  if (executable && !fs.existsSync(executable)) throw new Error(`E2E: o Chromium não existe em ${executable} (PW_CHROMIUM_EXECUTABLE).`);

  const client = new pg.Client({ connectionString: databaseUrl() });
  try {
    await client.connect();
    const { rows } = await client.query(`select 1 from information_schema.columns where table_name = 'Session' and column_name = 'area'`);
    if (rows.length === 0) throw new Error('o banco existe, mas não tem a migração area_isolation (coluna Session.area). Rode "prisma migrate deploy" nele');
  } catch (err) {
    throw new Error(`E2E: banco de teste indisponível ou sem migração: ${err.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
