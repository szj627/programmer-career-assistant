#!/usr/bin/env node

/**
 * cv-sync-check.mjs - validates that user data and prompts are consistent.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

const warnings = [];
const errors = [];

const cvPath = join(projectRoot, 'cv.md');
if (!existsSync(cvPath)) {
  errors.push('cv.md not found. Create it with your Chinese resume in Markdown.');
} else {
  const cvContent = readFileSync(cvPath, 'utf-8');
  if (cvContent.trim().length < 100) warnings.push('cv.md looks short. Confirm it contains a complete resume.');
}

const profilePath = join(projectRoot, 'config', 'profile.yml');
if (!existsSync(profilePath)) {
  errors.push('config/profile.yml not found. Copy config/profile.example.yml and fill it in.');
} else {
  const profileContent = readFileSync(profilePath, 'utf-8');
  for (const token of ['full_name', 'email', 'phone']) {
    if (!profileContent.includes(token)) warnings.push(`config/profile.yml may be missing ${token}.`);
  }
  if (profileContent.includes('张三') || profileContent.includes('zhangsan@example.com')) {
    warnings.push('config/profile.yml still appears to contain example data.');
  }
}

const filesToCheck = [
  { path: join(projectRoot, 'modes', '_shared.md'), name: 'modes/_shared.md' },
  { path: join(projectRoot, 'modes', 'pdf.md'), name: 'modes/pdf.md' },
  { path: join(projectRoot, 'modes', 'oferta.md'), name: 'modes/oferta.md' },
];

const metricPattern = /\b\d{2,4}\+?\s*(%|小时|人|万|k|K|QPS|TPS|ms|毫秒)\b/g;

for (const { path, name } of filesToCheck) {
  if (!existsSync(path)) continue;
  const lines = readFileSync(path, 'utf-8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.includes('不编造') || line.includes('不得编造')) continue;
    const match = line.match(metricPattern);
    if (match) warnings.push(`${name}:${i + 1} possible hardcoded metric: ${match[0]}`);
  }
}

const digestPath = join(projectRoot, 'article-digest.md');
if (existsSync(digestPath)) {
  const stats = statSync(digestPath);
  const days = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
  if (days > 60) warnings.push(`article-digest.md is ${Math.round(days)} days old.`);
}

console.log('\n=== sync check ===\n');
for (const error of errors) console.log(`ERROR: ${error}`);
for (const warning of warnings) console.log(`WARN: ${warning}`);
if (errors.length === 0 && warnings.length === 0) console.log('All checks passed.');
console.log('');

process.exit(errors.length > 0 ? 1 : 0);
