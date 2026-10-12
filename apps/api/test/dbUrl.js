import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Resolve the test database URL:
 *   TEST_DATABASE_URL, or DATABASE_URL (env or .env) with the database name
 *   suffixed by `_test`. The name must contain "test" — the suite resets it.
 */
export function resolveTestDatabaseUrl() {
  let fileEnv = {};
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) fileEnv = dotenv.parse(fs.readFileSync(envPath));
  const explicit = process.env.TEST_DATABASE_URL || fileEnv.TEST_DATABASE_URL;
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL || fileEnv.DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  if (!name.includes('test')) url.pathname = `/${name}_test`;
  return url.toString();
}

export const ROOT = root;
