#!/usr/bin/env node

/**
 * doctor.mjs - setup validation for 程序员求职助手.
 */

import { existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname;

const isTTY = process.stdout.isTTY;
const green = (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s;
const red = (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s;
const dim = (s) => isTTY ? `\x1b[2m${s}\x1b[0m` : s;

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10);
  if (major >= 18) return { pass: true, label: `Node.js >= 18 (${process.versions.node})` };
  return { pass: false, label: `Node.js >= 18 required (${process.versions.node})`, fix: 'Install Node.js 18 or later.' };
}

function checkDependencies() {
  if (existsSync(join(projectRoot, 'node_modules'))) return { pass: true, label: 'Dependencies installed' };
  return { pass: false, label: 'Dependencies not installed', fix: 'Run: npm install' };
}

async function checkPlaywright() {
  try {
    const { chromium } = await import('playwright');
    if (existsSync(chromium.executablePath())) return { pass: true, label: 'Playwright Chromium installed' };
  } catch {
    // handled below
  }
  return { pass: false, label: 'Playwright Chromium not installed', fix: 'Run: npx playwright install chromium' };
}

function checkFile(path, label, fix) {
  if (existsSync(join(projectRoot, path))) return { pass: true, label };
  return { pass: false, label: `${label} missing`, fix };
}

function checkFonts() {
  const fontsDir = join(projectRoot, 'fonts');
  if (!existsSync(fontsDir)) return { pass: false, label: 'fonts/ missing', fix: 'Keep fonts/ for PDF rendering.' };
  if (readdirSync(fontsDir).length === 0) return { pass: false, label: 'fonts/ is empty', fix: 'Add font files or restore fonts/.' };
  return { pass: true, label: 'fonts/ ready' };
}

function checkAutoDir(name) {
  const dirPath = join(projectRoot, name);
  if (existsSync(dirPath)) return { pass: true, label: `${name}/ ready` };
  try {
    mkdirSync(dirPath, { recursive: true });
    return { pass: true, label: `${name}/ ready (created)` };
  } catch {
    return { pass: false, label: `${name}/ could not be created`, fix: `Create ${name}/ manually.` };
  }
}

async function main() {
  console.log('\n程序员求职助手 doctor');
  console.log('==========================\n');

  const checks = [
    checkNodeVersion(),
    checkDependencies(),
    await checkPlaywright(),
    checkFile('cv.md', 'cv.md', 'Create cv.md with your Chinese resume in Markdown.'),
    checkFile('config/profile.yml', 'config/profile.yml', 'Copy config/profile.example.yml to config/profile.yml and fill it in.'),
    checkFonts(),
    checkAutoDir('data'),
    checkAutoDir('output'),
    checkAutoDir('reports'),
    checkAutoDir('batch/tracker-additions'),
  ];

  let failures = 0;
  for (const result of checks) {
    if (result.pass) {
      console.log(`${green('OK')} ${result.label}`);
    } else {
      failures += 1;
      console.log(`${red('FAIL')} ${result.label}`);
      const fixes = Array.isArray(result.fix) ? result.fix : [result.fix];
      for (const hint of fixes) console.log(`  ${dim('-> ' + hint)}`);
    }
  }

  console.log('');
  if (failures > 0) {
    console.log(`Result: ${failures} issue(s) found.`);
    process.exit(1);
  }

  console.log('Result: all checks passed.');
}

main().catch((err) => {
  console.error(`doctor failed: ${err.message}`);
  process.exit(1);
});
