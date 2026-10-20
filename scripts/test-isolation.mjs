/*
 * Suíte de isolamento entre as áreas Tem CNPJ e Tem CPF (PLANO_DIVISAO, ETAPA 7, item 1).
 *
 *   npm run test:isolation              roda a suíte; sem banco ou sem build, avisa e PULA (com motivo)
 *   npm run test:isolation -- --strict  pular vira falha (é o que o CI faz sozinho, pela variável CI)
 *
 * Os itens, nesta ordem:
 *   a  toda rota e todo endpoint da outra área responde 404 ou 403, nos dois sentidos
 *   b  o cookie de uma área não autentica na outra, nos dois sentidos
 *   c  o token com área CPF é rejeitado na API do CNPJ, e o contrário (host == sessão == dono)
 *   d  o bundle de cada área sem texto nem nome de tela da outra
 *   e  os arquivos de uma área não saem pelo host da outra
 *
 * Os arquivos de teste ficam nos workspaces (apps/api/test/isolation, apps/web/test) e também rodam
 * dentro de `npm test`. Este script só os junta por item, roda, conta e falha se um item ficar vazio.
 * Não toca em produção: o banco é o de teste (nome com "test", ver apps/api/test/dbUrl.js).
 *
 * Pré-requisitos para não pular nada: um Postgres local (DATABASE_URL ou TEST_DATABASE_URL) e
 * `npm run build:areas` (apps/web/dist-cnpj e dist-cpf).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
const strict = process.argv.includes('--strict') || process.env.CI === 'true' || process.env.ISOLATION_STRICT === '1';

// Cada item e os arquivos que o provam, por workspace. A ordem aqui é a ordem do relatório.
const ITEMS = [
  { id: 'a', title: 'rota e endpoint da outra área: 404/403', files: [['apps/api', 'test/isolation/a-rotas-cruzadas.test.js'], ['apps/api', 'test/route-isolation.test.js']] },
  { id: 'b', title: 'cookie de uma área não autentica na outra', files: [['apps/api', 'test/isolation/b-cookies-cruzados.test.js']] },
  { id: 'c', title: 'token CPF rejeitado no CNPJ e o contrário', files: [['apps/api', 'test/isolation/c-tokens-cruzados.test.js']] },
  {
    id: 'd',
    title: 'bundle sem texto nem tela da outra área',
    files: [['apps/web', 'test/bundle-isolation.test.js'], ['apps/web', 'test/area-public.test.js'], ['apps/api', 'test/isolation/d-bundle-servido.test.js']],
  },
  { id: 'e', title: 'arquivos de uma área inacessíveis pela outra', files: [['apps/api', 'test/isolation/e-arquivos-cruzados.test.js']] },
];

const workspaces = [...new Set(ITEMS.flatMap((item) => item.files.map(([ws]) => ws)))];
const itemOf = new Map(ITEMS.flatMap((item) => item.files.map(([ws, file]) => [`${ws}/${file}`, item.id])));

for (const [rel] of itemOf) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`Arquivo de teste ausente: ${rel}. A suíte de isolamento está incompleta.`);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isolation-'));
const results = []; // { item, file, status, title, fileFailure }
const crashed = [];

for (const ws of workspaces) {
  const files = [...itemOf.keys()].filter((rel) => rel.startsWith(`${ws}/`)).map((rel) => rel.slice(ws.length + 1));
  const out = path.join(tmp, `${ws.replace('/', '-')}.json`);
  console.log(`\n=== ${ws}: ${files.length} arquivo(s) ===`);
  const run = spawnSync(process.execPath, [vitest, 'run', ...files, '--reporter=default', '--reporter=json', `--outputFile.json=${out}`], {
    cwd: path.join(root, ws),
    stdio: 'inherit',
    env: { ...process.env, ...(strict ? { ISOLATION_STRICT: '1' } : {}) },
  });
  if (!fs.existsSync(out)) {
    console.error(`O vitest de ${ws} não gerou relatório (código ${run.status}).`);
    crashed.push(ws);
    continue;
  }
  // Suíte que não carregou ou falhou na preparação (beforeAll): o vitest sai com código diferente de zero.
  if (run.status !== 0) crashed.push(ws);
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  for (const file of report.testResults) {
    const rel = path.relative(root, file.name).split(path.sep).join('/');
    const item = itemOf.get(rel);
    if (!item) continue;
    if (!file.assertionResults.length && file.status === 'failed') results.push({ item, file: rel, status: 'failed', title: `(arquivo não carregou) ${String(file.message).split('\n')[0]}` });
    for (const test of file.assertionResults) results.push({ item, file: rel, status: test.status, title: test.fullName });
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

// ---- relatório --------------------------------------------------------------------------------
const count = (item, status) => results.filter((r) => r.item === item && (Array.isArray(status) ? status.includes(r.status) : r.status === status)).length;
const pad = (text, n) => String(text).padEnd(n);

console.log('\n=== Isolamento entre as áreas: casos por item ===');
console.log(`${pad('item', 5)}${pad('o que prova', 46)}${'passou'.padStart(7)}${'falhou'.padStart(7)}${'pulado'.padStart(7)}${'total'.padStart(7)}`);
let failed = 0;
let skipped = 0;
const empty = [];
for (const item of ITEMS) {
  const passed = count(item.id, 'passed');
  const bad = count(item.id, 'failed');
  const skip = count(item.id, ['skipped', 'pending', 'todo']);
  const total = passed + bad + skip;
  failed += bad;
  skipped += skip;
  if (total === 0) empty.push(item.id);
  console.log(`${pad(item.id, 5)}${pad(item.title, 46)}${String(passed).padStart(7)}${String(bad).padStart(7)}${String(skip).padStart(7)}${String(total).padStart(7)}`);
}
const total = results.length;
console.log(`${pad('', 5)}${pad('', 46)}${String(results.filter((r) => r.status === 'passed').length).padStart(7)}${String(failed).padStart(7)}${String(skipped).padStart(7)}${String(total).padStart(7)}`);

if (skipped) {
  const reasons = new Set();
  for (const r of results) {
    if (!['skipped', 'pending', 'todo'].includes(r.status)) continue;
    const reason = /\[PULADO: ([^\]]+)\]/.exec(r.title)?.[1];
    if (reason) reasons.add(reason);
  }
  console.log(`\nATENÇÃO: ${skipped} caso(s) PULADO(S). A suíte NÃO provou isolamento nesses casos.`);
  for (const reason of reasons) console.log(`  - ${reason}`);
  if (!reasons.size) console.log('  - (pulado sem motivo no título: procure um it.skip/describe.skip que não veio de describeDb/describeBuild)');
}

const problems = [];
if (crashed.length) problems.push(`o vitest terminou com erro em: ${crashed.join(', ')}`);
if (failed) problems.push(`${failed} caso(s) falharam`);
if (empty.length) problems.push(`item(ns) sem nenhum caso executado: ${empty.join(', ')}`);
if (strict && skipped) problems.push(`${skipped} caso(s) pulado(s) no modo estrito (CI)`);

if (problems.length) {
  console.error(`\nSUÍTE DE ISOLAMENTO: FALHOU (${problems.join('; ')}).`);
  process.exit(1);
}
console.log(`\nSUÍTE DE ISOLAMENTO: OK${skipped ? ' (com casos pulados, ver acima)' : ''}${strict ? ' [modo estrito]' : ''}.`);
