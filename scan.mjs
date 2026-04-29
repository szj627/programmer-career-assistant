#!/usr/bin/env node

/**
 * scan.mjs - platform URL importer
 *
 * This script imports JD URLs into data/pipeline.md. It does not crawl company
 * career pages, call overseas ATS APIs, bypass login, or submit applications.
 *
 * Usage:
 *   node scan.mjs --file urls.txt
 *   node scan.mjs --urls "url1;url2;url3"
 *   node scan.mjs --file urls.txt --dry-run
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';

mkdirSync('data', { recursive: true });

function usage(exitCode = 0) {
  const out = [
    '程序员求职助手 URL 导入器',
    '',
    'Usage:',
    '  node scan.mjs --file urls.txt',
    '  node scan.mjs --urls "url1;url2;url3"',
    '  node scan.mjs --file urls.txt --dry-run',
    '',
    'File rules:',
    '  - one URL per line',
    '  - blank lines are skipped',
    '  - lines whose trimmed value starts with # are comments',
    '  - inline # comments are not supported',
  ].join('\n');
  console.log(out);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = { dryRun: false, files: [], urls: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--file') {
      const value = argv[++i];
      if (!value) throw new Error('--file requires a path');
      opts.files.push(value);
    } else if (arg === '--urls') {
      const value = argv[++i];
      if (!value) throw new Error('--urls requires a semicolon-separated string');
      opts.urls.push(value);
    } else if (arg === '-h' || arg === '--help') {
      usage(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (opts.files.length === 0 && opts.urls.length === 0) {
    usage(1);
  }

  return opts;
}

function readUrlsFromFile(path) {
  const fullPath = resolve(path);
  const lines = readFileSync(fullPath, 'utf-8').split(/\r?\n/);
  return lines
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

function readUrlsFromCli(value) {
  return value
    .split(';')
    .map(url => url.trim())
    .filter(Boolean);
}

function normalizeUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host === 'zhipin.com' || host.endsWith('.zhipin.com')) return 'boss';
  return 'unknown';
}

function loadSeenUrls() {
  const seen = new Set();

  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split(/\r?\n/);
    for (const line of lines.slice(1)) {
      const url = line.split('\t')[0]?.trim();
      if (url) seen.add(url);
    }
  }

  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function ensurePipelineFile() {
  if (existsSync(PIPELINE_PATH)) return;
  writeFileSync(PIPELINE_PATH, '# Pipeline\n\n## 待处理\n\n## 已处理\n', 'utf-8');
}

function appendToPipeline(items) {
  if (items.length === 0) return;
  ensurePipelineFile();

  let text = readFileSync(PIPELINE_PATH, 'utf-8');
  const marker = '## 待处理';
  const doneMarker = '## 已处理';

  if (!text.includes(marker)) {
    const insertAt = text.includes(doneMarker) ? text.indexOf(doneMarker) : text.length;
    text = `${text.slice(0, insertAt).trimEnd()}\n\n${marker}\n\n${text.slice(insertAt)}`;
  }

  const markerIndex = text.indexOf(marker);
  const afterMarker = markerIndex + marker.length;
  const nextSection = text.indexOf('\n## ', afterMarker);
  const insertAt = nextSection === -1 ? text.length : nextSection;
  const block = '\n' + items.map(item =>
    `- [ ] ${item.url} | ${item.platform} | 待识别 | 待识别`
  ).join('\n') + '\n';

  text = text.slice(0, insertAt).trimEnd() + block + '\n' + text.slice(insertAt).trimStart();
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToHistory(items, date) {
  if (items.length === 0) return;

  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tplatform\ttitle\tcompany\tstatus\n', 'utf-8');
  }

  const lines = items.map(item =>
    `${item.url}\t${date}\t${item.platform}\t待识别\t待识别\tadded`
  ).join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

function collectUrls(opts) {
  const raw = [];

  for (const file of opts.files) {
    raw.push(...readUrlsFromFile(file));
  }
  for (const urlString of opts.urls) {
    raw.push(...readUrlsFromCli(urlString));
  }

  const invalid = [];
  const normalized = [];
  for (const candidate of raw) {
    const url = normalizeUrl(candidate);
    if (!url) {
      invalid.push(candidate);
    } else {
      normalized.push(url);
    }
  }

  return { rawCount: raw.length, normalized, invalid };
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    usage(1);
  }

  const { rawCount, normalized, invalid } = collectUrls(opts);
  const seen = loadSeenUrls();
  const seenInRun = new Set();
  const duplicates = [];
  const imported = [];

  for (const url of normalized) {
    if (seen.has(url) || seenInRun.has(url)) {
      duplicates.push(url);
      continue;
    }
    seenInRun.add(url);
    imported.push({ url, platform: detectPlatform(url) });
  }

  const date = new Date().toISOString().slice(0, 10);
  if (!opts.dryRun) {
    appendToPipeline(imported);
    appendToHistory(imported, date);
  }

  console.log(`URL input: ${rawCount}`);
  console.log(`Valid URLs: ${normalized.length}`);
  console.log(`Invalid URLs: ${invalid.length}`);
  console.log(`Duplicates skipped: ${duplicates.length}`);
  console.log(`New URLs: ${imported.length}`);
  console.log(`Mode: ${opts.dryRun ? 'dry-run' : 'write'}`);

  if (invalid.length > 0) {
    console.log('\nInvalid entries:');
    for (const entry of invalid) console.log(`- ${entry}`);
  }

  if (imported.length > 0) {
    console.log('\nImported URLs:');
    for (const item of imported) console.log(`- ${item.platform}: ${item.url}`);
  }
}

main();
