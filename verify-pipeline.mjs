#!/usr/bin/env node

/**
 * verify-pipeline.mjs - tracker and pipeline health check.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, normalize } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(ROOT, 'data/applications.md'))
  ? join(ROOT, 'data/applications.md')
  : join(ROOT, 'applications.md');
const ADDITIONS_DIR = join(ROOT, 'batch/tracker-additions');
const REPORTS_DIR = join(ROOT, 'reports');

mkdirSync(join(ROOT, 'data'), { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });
mkdirSync(ADDITIONS_DIR, { recursive: true });

const CANONICAL = new Set([
  'evaluated',
  'applied',
  'responded',
  'interview',
  'offer',
  'rejected',
  'discarded',
  'skip',
]);

const ALIASES = new Set([
  '已评估', '评估完成',
  '已投递', '已申请',
  '已回复', '有回应',
  '面试', '面试中',
  '收到 offer', 'offer',
  '已拒绝', '被拒',
  '已放弃', '已关闭', '不考虑',
  '跳过', '不投', '不建议投递',
]);

let errors = 0;
let warnings = 0;

function error(message) {
  console.log(`ERROR ${message}`);
  errors += 1;
}

function warn(message) {
  console.log(`WARN ${message}`);
  warnings += 1;
}

function ok(message) {
  console.log(`OK ${message}`);
}

function parseRows(content) {
  const rows = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('|') || line.includes('---')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 9) continue;
    const num = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(num)) continue;
    rows.push({
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
    });
  }
  return rows;
}

if (!existsSync(APPS_FILE)) {
  console.log('\nNo applications.md found. This is normal for a fresh setup.\n');
  process.exit(0);
}

const rows = parseRows(readFileSync(APPS_FILE, 'utf-8'));
console.log(`\nChecking ${rows.length} tracker entries\n`);

for (const row of rows) {
  const clean = row.status.replace(/\*\*/g, '').trim();
  const lower = clean.toLowerCase();
  if (!CANONICAL.has(lower) && !ALIASES.has(clean)) {
    error(`#${row.num}: non-canonical status "${row.status}"`);
  }
  if (row.status.includes('**')) error(`#${row.num}: status contains markdown bold`);
  if (/\d{4}-\d{2}-\d{2}/.test(row.status)) error(`#${row.num}: status contains a date`);
}
if (errors === 0) ok('statuses are valid');

const seen = new Map();
for (const row of rows) {
  const key = `${row.company.toLowerCase()}::${row.role.toLowerCase()}`;
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(row.num);
}
for (const [key, nums] of seen) {
  if (nums.length > 1) warn(`possible duplicate ${key}: #${nums.join(', #')}`);
}

for (const row of rows) {
  const score = row.score.replace(/\*\*/g, '').trim();
  if (!/^\d+(\.\d+)?\/5$/.test(score) && score !== 'N/A' && score !== 'DUP') {
    error(`#${row.num}: invalid score "${row.score}"`);
  }

  const match = row.report.match(/\]\(([^)]+)\)/);
  if (match) {
    const reportPath = normalize(join(ROOT, match[1]));
    if (!reportPath.startsWith(ROOT) || !existsSync(reportPath)) {
      error(`#${row.num}: report not found ${match[1]}`);
    }
  }
}

const pendingTsvs = existsSync(ADDITIONS_DIR)
  ? readdirSync(ADDITIONS_DIR).filter(f => f.endsWith('.tsv'))
  : [];
if (pendingTsvs.length > 0) warn(`${pendingTsvs.length} pending tracker TSV(s) not merged`);
else ok('no pending tracker TSVs');

console.log('\n' + '='.repeat(40));
console.log(`Pipeline health: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
