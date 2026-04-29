#!/usr/bin/env node

/**
 * merge-tracker.mjs - merge batch/tracker-additions/*.tsv into applications.md.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'data/applications.md');
const ADDITIONS_DIR = join(ROOT, 'batch/tracker-additions');
const MERGED_DIR = join(ADDITIONS_DIR, 'merged');
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY = process.argv.includes('--verify');

mkdirSync(join(ROOT, 'data'), { recursive: true });
mkdirSync(ADDITIONS_DIR, { recursive: true });

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
  const clean = raw.replace(/\*\*/g, '').trim();
  for (const status of CANONICAL) {
    if (status.toLowerCase() === clean.toLowerCase()) return status;
  }
  return ALIASES.get(clean) || 'Evaluated';
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function sameCompanyRole(a, b) {
  return normalizeText(a.company) === normalizeText(b.company)
    && normalizeText(a.role) === normalizeText(b.role);
}

function parseScore(score) {
  const match = score.replace(/\*\*/g, '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number.parseFloat(match[1]) : 0;
}

function parseAppLine(line) {
  const parts = line.split('|').map(s => s.trim());
  if (parts.length < 9 || parts[1] === '#') return null;
  const num = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(num)) return null;
  return {
    num,
    date: parts[2],
    company: parts[3],
    role: parts[4],
    score: parts[5],
    status: parts[6],
    pdf: parts[7],
    report: parts[8],
    notes: parts[9] || '',
    raw: line,
  };
}

function parseAddition(content, filename) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const parts = trimmed.startsWith('|')
    ? trimmed.split('|').map(s => s.trim()).filter(Boolean)
    : trimmed.split('\t').map(s => s.trim());

  if (parts.length < 8) {
    console.warn(`WARN skip malformed tracker addition ${filename}`);
    return null;
  }

  const num = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(num)) {
    console.warn(`WARN skip tracker addition with invalid number ${filename}`);
    return null;
  }

  const col4 = parts[4] || '';
  const col5 = parts[5] || '';
  const col4IsScore = /^\d+(\.\d+)?\/5$/.test(col4) || col4 === 'N/A' || col4 === 'DUP';
  const status = col4IsScore ? col5 : col4;
  const score = col4IsScore ? col4 : col5;

  return {
    num,
    date: parts[1],
    company: parts[2],
    role: parts[3],
    status: normalizeStatus(status),
    score,
    pdf: parts[6],
    report: parts[7],
    notes: parts[8] || '',
  };
}

const files = readdirSync(ADDITIONS_DIR)
  .filter(file => file.endsWith('.tsv'))
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));

if (files.length === 0) {
  console.log('No pending tracker additions.');
  process.exit(0);
}

function ensureApplicationsFile() {
  if (existsSync(APPS_FILE)) return;
  const header = [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '',
  ].join('\n');
  writeFileSync(APPS_FILE, header, 'utf-8');
}

ensureApplicationsFile();

const appLines = readFileSync(APPS_FILE, 'utf-8').split(/\r?\n/);
const existing = [];
let maxNum = 0;
for (const line of appLines) {
  if (!line.startsWith('|') || line.includes('---')) continue;
  const row = parseAppLine(line);
  if (row) {
    existing.push(row);
    maxNum = Math.max(maxNum, row.num);
  }
}

let added = 0;
let updated = 0;
let skipped = 0;
const newLines = [];

for (const file of files) {
  const addition = parseAddition(readFileSync(join(ADDITIONS_DIR, file), 'utf-8'), file);
  if (!addition) {
    skipped += 1;
    continue;
  }

  const duplicate = existing.find(row => sameCompanyRole(row, addition));
  if (duplicate) {
    if (parseScore(addition.score) > parseScore(duplicate.score)) {
      const index = appLines.indexOf(duplicate.raw);
      appLines[index] = `| ${duplicate.num} | ${addition.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${duplicate.status} | ${duplicate.pdf} | ${addition.report} | 重新评估：${addition.notes} |`;
      updated += 1;
    } else {
      skipped += 1;
    }
    continue;
  }

  const num = addition.num > maxNum ? addition.num : maxNum + 1;
  maxNum = Math.max(maxNum, num);
  newLines.push(`| ${num} | ${addition.date} | ${addition.company} | ${addition.role} | ${addition.score} | ${addition.status} | ${addition.pdf} | ${addition.report} | ${addition.notes} |`);
  existing.push({ ...addition, num });
  added += 1;
}

if (newLines.length > 0) {
  const separatorIndex = appLines.findIndex(line => line.startsWith('|') && line.includes('---'));
  const insertAt = separatorIndex >= 0 ? separatorIndex + 1 : appLines.length;
  appLines.splice(insertAt, 0, ...newLines);
}

if (!DRY_RUN) {
  writeFileSync(APPS_FILE, appLines.join('\n'), 'utf-8');
  mkdirSync(MERGED_DIR, { recursive: true });
  for (const file of files) {
    renameSync(join(ADDITIONS_DIR, file), join(MERGED_DIR, file));
  }
}

console.log(`Merged tracker additions: +${added}, updated ${updated}, skipped ${skipped}`);
if (DRY_RUN) console.log('dry-run: no files changed');

if (VERIFY && !DRY_RUN) {
  execFileSync('node', [join(ROOT, 'verify-pipeline.mjs')], { stdio: 'inherit' });
}
