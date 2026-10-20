import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './dbUrl.js';

// T4. O `prisma migrate deploy` roda no deploy de produção, então toda migração que entrar depois
// do ponto de partida das áreas tem de ser aditiva (ARQUITETURA 3, 7.2 e 12). Este teste falha se
// alguém acrescentar uma que apague, esvazie, renomeie ou estreite dados. Não precisa de banco.

const MIGRATIONS_DIR = path.join(ROOT, 'prisma/migrations');
/** Última migração anterior às áreas: só as posteriores são conferidas. */
const BASELINE = '20261016190000_public_tenders';

/**
 * Regras: nome -> padrão. O SQL chega sem comentários e sem literais entre aspas (um valor de enum
 * 'DELETE' ou uma coluna "rename" não pode acusar). `ON DELETE` (ação de uma chave estrangeira em
 * tabela nova) não conta: o que se barra é a instrução DELETE.
 */
const FORBIDDEN = [
  ['DROP', /\bDROP\b/i],
  ['TRUNCATE', /\bTRUNCATE\b/i],
  ['DELETE', /(?<!\bON\s+)\bDELETE\b/i],
  ['RENAME', /\bRENAME\b/i],
  ['ALTER COLUMN ... TYPE', /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i],
  ['SET NOT NULL', /\bSET\s+NOT\s+NULL\b/i],
];

function stripNoise(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/** Nomes das regras que o SQL fere. Lista vazia = migração aditiva. */
export function lintMigration(sql) {
  const clean = stripNoise(sql);
  return FORBIDDEN.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name);
}

function migrationsAfterBaseline() {
  const stamp = BASELINE.slice(0, 14);
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{14}_/.test(d.name) && d.name !== BASELINE && d.name.slice(0, 14) >= stamp)
    .map((d) => d.name)
    .sort();
}

describe('T4 · lint das migrações posteriores às áreas', () => {
  const names = migrationsAfterBaseline();

  it('acha a migração do ponto de partida e as que vieram depois', () => {
    expect(fs.existsSync(path.join(MIGRATIONS_DIR, BASELINE, 'migration.sql'))).toBe(true);
    expect(names).toContain('20261020120000_area_isolation');
    for (const name of names) expect(fs.existsSync(path.join(MIGRATIONS_DIR, name, 'migration.sql')), name).toBe(true);
  });

  it('nenhuma migração posterior contém DROP, TRUNCATE, DELETE, RENAME, ALTER COLUMN ... TYPE nem SET NOT NULL', () => {
    for (const name of names) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
      expect(lintMigration(sql), `${name} não é aditiva`).toEqual([]);
    }
  });

  it('a migração das áreas é a da seção 7.2: tipo protegido e quatro colunas nulas, sem default', () => {
    const sql = fs
      .readFileSync(path.join(MIGRATIONS_DIR, '20261020120000_area_isolation/migration.sql'), 'utf8')
      .replace(/--[^\n]*/g, ' ')
      .replace(/\s+/g, ' ');
    expect(sql).toContain(`CREATE TYPE "Area" AS ENUM ('CNPJ', 'CPF', 'ADMIN');`);
    expect(sql).toMatch(/BEGIN CREATE TYPE "Area".*EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/);
    for (const table of ['Session', 'LoginChallenge', 'ActivationToken', 'PasswordResetToken']) {
      expect(sql, table).toContain(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "area" "Area";`);
    }
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(4);
    expect(sql).not.toMatch(/\bDEFAULT\b|\bNOT NULL\b|\bUPDATE\b|\bINSERT\b/i);
  });

  describe('o próprio lint', () => {
    const bad = {
      DROP: ['ALTER TABLE "Session" DROP COLUMN "area";', 'DROP TABLE "Session";', 'drop index "x";', 'ALTER TABLE "A" ALTER COLUMN "b" DROP DEFAULT;'],
      TRUNCATE: ['TRUNCATE "Session" CASCADE;', 'truncate table "Session";'],
      DELETE: ['DELETE FROM "Session";', 'delete from "Session" where true;', 'CREATE TRIGGER t AFTER DELETE ON "Session" FOR EACH ROW EXECUTE FUNCTION f();'],
      RENAME: ['ALTER TABLE "Session" RENAME TO "S2";', 'ALTER TABLE "Session" RENAME COLUMN "a" TO "b";', 'ALTER TYPE "Area" RENAME VALUE \'CPF\' TO \'PF\';'],
      'ALTER COLUMN ... TYPE': ['ALTER TABLE "A" ALTER COLUMN "b" TYPE TEXT;', 'ALTER TABLE "A"\n  ALTER COLUMN "b" SET DATA TYPE INTEGER USING "b"::integer;'],
      'SET NOT NULL': ['ALTER TABLE "A" ALTER COLUMN "b" SET NOT NULL;', 'alter table "A" alter column "b" set  not  null;'],
    };
    for (const [rule, samples] of Object.entries(bad)) {
      it(`acusa ${rule}`, () => {
        for (const sql of samples) expect(lintMigration(sql), sql).toContain(rule);
      });
    }

    it('acusa a instrução destrutiva dentro de um bloco DO', () => {
      expect(lintMigration('DO $$ BEGIN DELETE FROM "Session"; END $$;')).toContain('DELETE');
    });

    it('deixa passar o que é aditivo', () => {
      const good = [
        `DO $$ BEGIN CREATE TYPE "Area" AS ENUM ('CNPJ', 'CPF', 'ADMIN');\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        'ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "area" "Area";',
        'CREATE INDEX IF NOT EXISTS "Session_area_idx" ON "Session"("area");',
        'ALTER TABLE "A" ALTER COLUMN "b" SET DEFAULT 1;',
        'CREATE TABLE "N" ("id" TEXT NOT NULL, "uid" TEXT NOT NULL, CONSTRAINT "N_fkey" FOREIGN KEY ("uid") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE);',
        "CREATE TYPE \"Kind\" AS ENUM ('DELETE', 'RENAME', 'DROP');",
        'ALTER TABLE "A" ADD COLUMN "drop_zone" TEXT; -- DROP nada, só comentário',
        '/* TRUNCATE e DELETE só no comentário */ ALTER TABLE "A" ADD COLUMN IF NOT EXISTS "c" TEXT;',
        'ALTER TABLE "A" ADD COLUMN "type" TEXT;',
        'CREATE TYPE "Area2" AS ENUM (\'X\');',
      ];
      for (const sql of good) expect(lintMigration(sql), sql).toEqual([]);
    });
  });
});
