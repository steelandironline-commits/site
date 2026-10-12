import { execSync } from 'node:child_process';
import { resolveTestDatabaseUrl, ROOT } from './dbUrl.js';

export default function setup() {
  const url = resolveTestDatabaseUrl();
  if (!url) {
    console.warn('\n⚠ No TEST_DATABASE_URL/DATABASE_URL: database test suites will be skipped.\n');
    return;
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!dbName.includes('test')) throw new Error(`Refusing to use non-test database "${dbName}"`);
  try {
    execSync('npx prisma migrate deploy', {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: 'pipe',
    });
    process.env.AUTOPIX_TEST_DB_READY = '1';
  } catch (err) {
    console.warn(`\n⚠ Could not prepare test database (${dbName}): ${err.stderr?.toString().split('\n').slice(-4).join(' ')}\n  Database suites will be skipped.\n`);
  }
}
