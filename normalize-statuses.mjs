#!/usr/bin/env node

/**
 * normalize-statuses.mjs - normalize tracker status labels.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'applications.md');
const DRY_RUN = process.argv.includes('--dry-run');

mkdirSync(join(ROOT, 'data'), { recursive: true });

const CANONICAL = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
const ALIASES = new Map([
  ['已评估', 'Evaluated'],
  ['评估完成', 'Evaluated'],
  ['已投递', 'Applied'],
  ['已申请', 'Applied'],
  ['已回复', 'Responded'],
  ['有回应', 'Responded'],
  ['面试', 'Interview'],
  ['面试中', 'Interview'],
  ['收到 offer', 'Offer'],
  ['offer', 'Offer'],
  ['已拒绝', 'Rejected'],
  ['被拒', 'Rejected'],
  ['已放弃', 'Discarded'],
  ['已关闭', 'Discarded'],
  ['不考虑', 'Discarded'],
  ['跳过', 'SKIP'],
  ['不投', 'SKIP'],
  ['不建议投递', 'SKIP'],
]);

function normalizeStatus(raw) {
  const clean = raw.replace(/\*\*/g, '').replace(/\s+\d{4}-\d{2}-\d{2}.*$/, '').trim();
  for (const status of CANONICAL) {
    if (status.toLowerCase() === clean.toLowerCase()) return status;
  }
  if (ALIASES.has(clean)) return ALIASES.get(clean);
  if (/^dup|重复/.test(clean.toLowerCase())) return 'Discarded';
  return null;
}

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to normalize.');
  process.exit(0);
}

const lines = readFileSync(APPS_FILE, 'utf-8').split(/\r?\n/);
let changes = 0;
let unknowns = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|') || line.includes('---')) continue;
  const parts = line.split('|').map(s => s.trim());
  const num = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(num) || parts.length < 9) continue;

  const normalized = normalizeStatus(parts[6]);
  if (!normalized) {
    unknowns += 1;
    console.log(`WARN #${num}: unknown status "${parts[6]}"`);
    continue;
  }

  if (parts[6] !== normalized) {
    parts[6] = normalized;
    if (parts[5]) parts[5] = parts[5].replace(/\*\*/g, '');
    lines[i] = '| ' + parts.slice(1, -1).join(' | ') + ' |';
    changes += 1;
  }
}

console.log(`Normalized statuses: ${changes}, unknown: ${unknowns}`);
if (!DRY_RUN && changes > 0) {
  copyFileSync(APPS_FILE, `${APPS_FILE}.bak`);
  writeFileSync(APPS_FILE, lines.join('\n'), 'utf-8');
}
if (DRY_RUN) console.log('dry-run: no files changed');
