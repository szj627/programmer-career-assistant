#!/usr/bin/env node

/**
 * test-all.mjs - lightweight project test suite.
 */

import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  OK ${msg}`); passed += 1; }
function fail(msg) { console.log(`  FAIL ${msg}`); failed += 1; }

function run(cmd, args = [], opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch (err) {
    return null;
  }
}

function runShell(command) {
  try {
    return execSync(command, { cwd: ROOT, encoding: 'utf-8', timeout: 60000 }).trim();
  } catch {
    return null;
  }
}

function fileExists(path) {
  return existsSync(join(ROOT, path));
}

console.log('\n程序员求职助手 test suite\n');

console.log('1. JavaScript syntax');
const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const file of mjsFiles) {
  if (run('node', ['--check', file]) !== null) pass(`${file}`);
  else fail(`${file}`);
}

console.log('\n2. Required files');
const requiredFiles = [
  'AGENTS.md',
  'README.md',
  'DATA_CONTRACT.md',
  'docs/CODEX.md',
  'modes/_shared.md',
  'modes/_profile.template.md',
  'modes/oferta.md',
  'modes/auto-pipeline.md',
  'modes/scan.md',
  'modes/pipeline.md',
  'modes/batch.md',
  'modes/pdf.md',
  'modes/apply.md',
  'modes/tracker.md',
  'templates/cv-template.html',
  'templates/states.yml',
  'scan.mjs',
  'generate-pdf.mjs',
  'verify-pipeline.mjs',
];

for (const file of requiredFiles) {
  if (fileExists(file)) pass(`exists: ${file}`);
  else fail(`missing: ${file}`);
}

console.log('\n3. Removed legacy files');
const removedFiles = [
  'CLAUDE.md',
  'GEMINI.md',
  'gemini-eval.mjs',
  'generate-latex.mjs',
  'update-system.mjs',
  'templates/portals.example.yml',
  'templates/cv-template.tex',
  'modes/contacto.md',
  'modes/deep.md',
  'modes/ofertas.md',
  'modes/training.md',
];
for (const file of removedFiles) {
  if (!fileExists(file)) pass(`removed: ${file}`);
  else fail(`still exists: ${file}`);
}

console.log('\n4. URL importer');
const tempDir = mkdtempSync(join(tmpdir(), 'programmer-career-assistant-'));
const urlsFile = join(tempDir, 'urls.txt');
writeFileSync(urlsFile, [
  '# comment',
  '',
  'https://www.zhipin.com/job_detail/abc.html',
  'not-a-url',
  'https://example.com/job#fragment',
  'https://www.zhipin.com/job_detail/abc.html',
].join('\n'), 'utf-8');

const fileRun = run('node', ['scan.mjs', '--dry-run', '--file', urlsFile]);
if (fileRun && fileRun.includes('Valid URLs: 3') && fileRun.includes('Invalid URLs: 1') && fileRun.includes('New URLs: 2')) {
  pass('--file supports blank lines, # comments, invalid entries, duplicates');
} else {
  fail('--file dry-run output mismatch');
}

const cliRun = run('node', ['scan.mjs', '--dry-run', '--urls', ' https://a.example/jobs/1 ; https://b.example/jobs/2 ']);
if (cliRun && cliRun.includes('Valid URLs: 2') && cliRun.includes('New URLs: 2')) {
  pass('--urls supports semicolon input');
} else {
  fail('--urls dry-run output mismatch');
}

console.log('\n5. Script execution');
if (run('node', ['verify-pipeline.mjs']) !== null) pass('verify-pipeline.mjs');
else fail('verify-pipeline.mjs');

if (run('node', ['normalize-statuses.mjs']) !== null) pass('normalize-statuses.mjs');
else fail('normalize-statuses.mjs');

if (run('node', ['dedup-tracker.mjs']) !== null) pass('dedup-tracker.mjs');
else fail('dedup-tracker.mjs');

if (run('node', ['merge-tracker.mjs']) !== null) pass('merge-tracker.mjs');
else fail('merge-tracker.mjs');

if (!QUICK) {
  console.log('\n6. Dashboard build');
  if (runShell('cd dashboard && go build ./...') !== null) pass('dashboard builds');
  else fail('dashboard build');
} else {
  console.log('\n6. Dashboard build skipped (--quick)');
}

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
