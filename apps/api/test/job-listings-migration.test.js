import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './dbUrl.js';

// A migração das vagas roda no deploy de produção (prisma migrate deploy). Ela só pode criar a tabela nova e os
// índices dela: nenhuma tabela existente é tocada. O lint geral (migration-lint.test.js) já barra DROP, DELETE etc.;
// aqui se confere que não há nada além de CREATE TABLE e CREATE INDEX, e que o esquema do Prisma tem o mesmo modelo.

const NAME = '20261021120000_job_listings';
const sql = fs.readFileSync(path.join(ROOT, 'prisma/migrations', NAME, 'migration.sql'), 'utf8');
const statements = sql
  .replace(/--[^\n]*/g, ' ')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

describe('migração das vagas · só aditiva', () => {
  it('tem a pasta com o nome combinado, depois das migrações das áreas', () => {
    expect(NAME > '20261020120000_area_isolation').toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'prisma/migrations', NAME, 'migration.sql'))).toBe(true);
  });

  it('só CREATE TABLE e CREATE INDEX (um da tabela e três índices)', () => {
    expect(statements).toHaveLength(4);
    expect(statements.filter((s) => /^CREATE TABLE /.test(s))).toHaveLength(1);
    expect(statements.filter((s) => /^CREATE (UNIQUE )?INDEX /.test(s))).toHaveLength(3);
    expect(statements.filter((s) => !/^CREATE (TABLE|INDEX|UNIQUE INDEX) /.test(s))).toEqual([]);
  });

  it('não usa nenhum comando que mexa em dado ou em tabela existente', () => {
    const clean = statements.join(';').replace(/"(?:[^"]|"")*"/g, '""');
    for (const word of ['DROP', 'ALTER', 'RENAME', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'SET NOT NULL', 'TYPE ', 'REFERENCES', 'FOREIGN KEY']) {
      expect(clean.toUpperCase().includes(word), word).toBe(false);
    }
  });

  it('é idempotente: tudo com IF NOT EXISTS', () => {
    for (const s of statements) expect(s, s).toMatch(/IF NOT EXISTS/);
  });

  it('mexe só na tabela JobListing', () => {
    const tables = [...sql.matchAll(/(?:TABLE(?: IF NOT EXISTS)?|ON)\s+"(\w+)"/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(['JobListing']));
  });

  it('cria os campos do modelo, com a chave única (fonte, id externo) e os índices de área e de data', () => {
    for (const col of ['id', 'source', 'externalId', 'title', 'company', 'city', 'state', 'area', 'salaryMin', 'salaryMax', 'salaryText', 'description', 'contactWhatsapp', 'contactEmail', 'sourceUrl', 'postedAt', 'expiresAt', 'scoreLevel', 'scoreValue', 'scoreReasons', 'fetchedAt', 'createdAt']) {
      expect(sql, col).toContain(`"${col}"`);
    }
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "JobListing_source_externalId_key" ON "JobListing"("source", "externalId")');
    expect(sql).toContain('"JobListing_area_idx" ON "JobListing"("area")');
    expect(sql).toContain('"JobListing_postedAt_idx" ON "JobListing"("postedAt")');
    // expiresAt é opcional: a fonte nem sempre informa o prazo.
    expect(sql).toMatch(/"expiresAt" TIMESTAMP\(3\),/);
    expect(sql).toMatch(/"postedAt" TIMESTAMP\(3\) NOT NULL,/);
  });

  it('o schema.prisma declara o mesmo modelo', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8');
    const model = /model JobListing \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    expect(model).toContain('@@unique([source, externalId])');
    expect(model).toContain('@@index([area])');
    expect(model).toContain('@@index([postedAt])');
    expect(model).toMatch(/expiresAt\s+DateTime\?/);
    expect(model).toMatch(/description\s+String\s+@db\.Text/);
  });
});
