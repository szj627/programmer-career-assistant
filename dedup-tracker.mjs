#!/usr/bin/env node

/**
 * dedup-tracker.mjs - remove exact duplicate company+role tracker rows.
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

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function parseScore(score) {
  const match = score.replace(/\*\*/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function parseLine(line, index) {
  const parts = line.split('|').map(s => s.trim());
  const num = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(num) || parts.length < 9) return null;
  return {
    index,
    num,
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
  };
}

if (!existsSync(APPS_FILE)) {
  console.log('No applications.md found. Nothing to dedup.');
  process.exit(0);
}

const lines = readFileSync(APPS_FILE, 'utf-8').split(/\r?\n/);
const groups = new Map();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.startsWith('|') || line.includes('---')) continue;
  const row = parseLine(line, i);
  if (!row) continue;
  const key = `${normalizeText(row.company)}::${normalizeText(row.role)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const removeIndexes = new Set();
for (const rows of groups.values()) {
  if (rows.length < 2) continue;
  rows.sort((a, b) => parseScore(b.score) - parseScore(a.score));
  for (const duplicate of rows.slice(1)) removeIndexes.add(duplicate.index);
}

const nextLines = lines.filter((_, index) => !removeIndexes.has(index));
console.log(`Duplicates removed: ${removeIndexes.size}`);

if (!DRY_RUN && removeIndexes.size > 0) {
  copyFileSync(APPS_FILE, `${APPS_FILE}.bak`);
  writeFileSync(APPS_FILE, nextLines.join('\n'), 'utf-8');
}
if (DRY_RUN) console.log('dry-run: no files changed');
