#!/usr/bin/env node

/**
 * boss-scan.mjs - semi-automated BOSS Zhipin JD scanner
 *
 * Opens a visible Chromium session, lets the user log in and navigate, then
 * reads visible job detail pages without clicking chat/apply/submit controls.
 * Captured JDs are stored in jds/ and their URLs are imported through scan.mjs.
 *
 * Usage:
 *   node boss-scan.mjs
 *   node boss-scan.mjs --url "https://www.zhipin.com/web/geek/job"
 *   node boss-scan.mjs --limit 10
 *   node boss-scan.mjs --headless --url "https://www.zhipin.com/web/geek/job"
 *   node boss-scan.mjs --dry-run
 */

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = 'https://www.zhipin.com/';
const DEFAULT_LIMIT = 5;
const DEFAULT_PROFILE_DIR = '.playwright/boss-profile';
const JD_DIR = 'jds';

function usage(exitCode = 0) {
  const out = [
    'BOSS 直聘半自动 JD 扫描器',
    '',
    'Usage:',
    '  node boss-scan.mjs',
    '  node boss-scan.mjs --url "https://www.zhipin.com/web/geek/job"',
    '  node boss-scan.mjs --limit 10',
    '  node boss-scan.mjs --headless --url "https://www.zhipin.com/web/geek/job"',
    '  node boss-scan.mjs --dry-run',
    '',
    'Options:',
    '  --url <url>             打开的起始页面，默认 https://www.zhipin.com/',
    `  --limit <n>             列表页最多扫描岗位数，默认 ${DEFAULT_LIMIT}`,
    `  --profile-dir <path>    浏览器登录态目录，默认 ${DEFAULT_PROFILE_DIR}`,
    '  --headless              后台运行，复用已保存登录态；需要先用可见模式登录',
    '  --no-import             只保存 JD，不导入 data/pipeline.md',
    '  --dry-run               只读取并打印摘要，不写文件、不导入',
    '  -h, --help              显示帮助',
  ].join('\n');
  console.log(out);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    url: DEFAULT_URL,
    limit: DEFAULT_LIMIT,
    profileDir: DEFAULT_PROFILE_DIR,
    headless: false,
    noImport: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') {
      opts.url = requireValue(argv, ++i, '--url');
    } else if (arg === '--limit') {
      const raw = requireValue(argv, ++i, '--limit');
      const limit = Number.parseInt(raw, 10);
      if (!Number.isFinite(limit) || limit < 1) throw new Error('--limit must be a positive integer');
      opts.limit = limit;
    } else if (arg === '--profile-dir') {
      opts.profileDir = requireValue(argv, ++i, '--profile-dir');
    } else if (arg === '--headless') {
      opts.headless = true;
    } else if (arg === '--no-import') {
      opts.noImport = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
      opts.noImport = true;
    } else if (arg === '-h' || arg === '--help') {
      usage(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  try {
    const parsed = new URL(opts.url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`Invalid --url: ${opts.url}`);
  }

  return opts;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    usage(1);
  }

  const profileDir = resolve(__dirname, opts.profileDir);
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(resolve(__dirname, JD_DIR), { recursive: true });

  console.log(`Opening BOSS 直聘 in Chromium (${opts.headless ? 'headless' : 'visible'} mode)...`);
  console.log(`Browser profile: ${profileDir}`);
  if (opts.headless) {
    console.log('后台模式会复用已保存登录态；如果需要登录、验证码或安全验证，请先运行可见模式处理。');
  } else {
    console.log('请手动登录、处理验证码，并打开岗位列表页或岗位详情页。脚本不会点击沟通、投递或发送按钮。');
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: opts.headless,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });

  const rl = createInterface({ input, output });

  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (opts.headless) {
      await waitForPage(page);
      if (await pageNeedsUserAction(page)) {
        throw new Error('后台模式检测到需要登录、验证码或安全验证。请先运行 npm run boss-scan，在可见浏览器里登录后再重试 --headless。');
      }
    } else {
      await rl.question('\n完成登录并打开要扫描的 BOSS 岗位列表页或详情页后，回到这里按 Enter 开始扫描...');
    }

    const jobs = await scanCurrentView(context, page, opts.limit, {
      rl,
      interactive: !opts.headless,
    });
    if (jobs.length === 0) {
      console.log('\nNo visible job details or job_detail links were found.');
      console.log('请确认当前页面是 BOSS 岗位详情页，或岗位列表里有可见的 job_detail 链接。');
      return;
    }

    const timestamp = timestampForPath();
    const saved = opts.dryRun ? [] : saveJobs(jobs, timestamp);

    console.log(`\nScanned jobs: ${jobs.length}`);
    for (const job of jobs) {
      console.log(`- ${job.company || '待识别'} | ${job.title || '待识别'} | ${job.url}`);
    }

    if (!opts.dryRun) {
      const summaryPath = saveSummary(jobs, saved, timestamp);
      console.log(`\nJD files saved under: ${resolve(__dirname, JD_DIR)}`);
      console.log(`Summary: ${summaryPath}`);
    }

    if (!opts.noImport) {
      importUrls(jobs.map(job => job.url).filter(Boolean));
    } else if (opts.dryRun) {
      console.log('\nDry run: skipped writing JD files and importing URLs.');
    } else {
      console.log('\nSkipped pipeline import because --no-import was set.');
    }

    console.log('\n下一步：在 Codex 中说“处理最近一次 BOSS 扫描结果”，我会按 modes/oferta.md 生成评估报告并更新 tracker。');
  } finally {
    rl.close();
    await context.close();
  }
}

async function scanCurrentView(context, page, limit, { rl, interactive }) {
  await waitForPage(page);

  if (isBossDetailUrl(page.url()) || await pageLooksLikeDetail(page)) {
    const job = await extractJob(page, page.url());
    return jobHasUsefulText(job) ? [job] : [];
  }

  const links = await collectJobLinks(page);
  if (links.length === 0) return [];

  const targets = links.slice(0, limit);
  console.log(`\nFound ${links.length} job link(s), scanning ${targets.length}.`);

  const detailPage = await context.newPage();
  const jobs = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.log(`[${i + 1}/${targets.length}] ${url}`);
      await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await waitForPage(detailPage);

      if (await pageNeedsUserAction(detailPage)) {
        if (!interactive) {
          throw new Error('后台模式扫描详情页时遇到登录、验证码或安全验证。请先用可见模式处理登录态。');
        }
        console.log('页面可能需要登录、验证码或安全验证。请在打开的浏览器中处理后继续。');
        await rl.question('处理完成后按 Enter 继续扫描当前岗位...');
        await waitForPage(detailPage);
      }

      const job = await extractJob(detailPage, url);
      if (jobHasUsefulText(job)) jobs.push(job);
    }
  } finally {
    await detailPage.close().catch(() => {});
  }

  return jobs;
}

async function waitForPage(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

function isBossDetailUrl(url) {
  return /zhipin\.com\/job_detail\//i.test(url);
}

async function pageLooksLikeDetail(page) {
  const text = await getBodyText(page);
  return /职位描述|岗位职责|任职要求|职位详情/.test(text) && text.length > 500;
}

async function pageNeedsUserAction(page) {
  const url = page.url();
  const text = await getBodyText(page);
  return /login|security|captcha|verify/i.test(url) ||
    /登录后查看|请登录|扫码登录|安全验证|验证码|请完成验证/.test(text);
}

async function getBodyText(page) {
  return page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
}

async function collectJobLinks(page) {
  const links = await page.evaluate(() => {
    const out = [];
    for (const anchor of document.querySelectorAll('a[href]')) {
      const raw = anchor.getAttribute('href');
      if (!raw) continue;
      try {
        const url = new URL(raw, location.href).toString();
        if (url.includes('/job_detail/')) out.push(url);
      } catch {
        // Ignore invalid hrefs from the page.
      }
    }
    return out;
  });

  const seen = new Set();
  return links.filter((url) => {
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeUrl(raw) {
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

async function extractJob(page, fallbackUrl) {
  const data = await page.evaluate(() => {
    const readFirst = (selectors) => {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const text = clean(node?.innerText || node?.textContent || '');
        if (text) return text;
      }
      return '';
    };

    const readLongest = (selectors) => {
      let best = '';
      for (const selector of selectors) {
        for (const node of document.querySelectorAll(selector)) {
          const text = clean(node.innerText || node.textContent || '');
          if (text.length > best.length) best = text;
        }
      }
      return best;
    };

    const clean = (value) => value
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();

    return {
      url: location.href,
      title: readFirst([
        '.job-name',
        '.job-title',
        '.job-detail-info h1',
        '[class*="job-name"]',
        '[class*="job-title"]',
        'h1',
      ]),
      company: readFirst([
        '.company-info .name',
        '.company-name',
        '.sider-company .name',
        '[class*="company-name"]',
        '[class*="company"] a',
      ]),
      salary: readFirst([
        '.salary',
        '.job-salary',
        '[class*="salary"]',
      ]),
      location: readFirst([
        '.job-location',
        '.location',
        '.job-address',
        '[class*="location"]',
        '[class*="address"]',
      ]),
      detail: readLongest([
        '.job-sec',
        '.job-detail-section',
        '.job-detail',
        '.detail-content',
        '[class*="job-sec"]',
        '[class*="job-detail"]',
        '[class*="detail-content"]',
        'main',
      ]),
      bodyText: clean(document.body?.innerText || ''),
      titleText: document.title || '',
    };
  });

  const text = compactText(data.detail || extractDetailFromBody(data.bodyText));
  const fallbackTitle = inferTitle(data.title, data.titleText, data.bodyText);

  return {
    platform: 'boss',
    url: normalizeUrl(data.url) || normalizeUrl(fallbackUrl) || fallbackUrl,
    title: firstLine(data.title) || fallbackTitle || '待识别',
    company: firstLine(data.company) || inferCompany(data.bodyText) || '待识别',
    salary: firstLine(data.salary) || inferSalary(data.bodyText) || '未说明/需确认',
    location: firstLine(data.location) || inferLocation(data.bodyText) || '未说明/需确认',
    jdText: text,
  };
}

function jobHasUsefulText(job) {
  return Boolean(job?.jdText && job.jdText.length > 100);
}

function firstLine(value) {
  return (value || '').split('\n').map(line => line.trim()).find(Boolean) || '';
}

function compactText(value) {
  const noise = [
    /^登录$/,
    /^注册$/,
    /^首页$/,
    /^消息$/,
    /^我的$/,
    /^APP$/,
    /^下载APP$/,
    /^立即沟通$/,
    /^投递$/,
  ];

  return (value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !noise.some(pattern => pattern.test(line)))
    .join('\n')
    .slice(0, 24000);
}

function extractDetailFromBody(bodyText) {
  const body = compactText(bodyText);
  const startTokens = ['职位描述', '职位详情', '岗位职责', '任职要求'];
  const endTokens = ['公司介绍', '工商信息', '工作地址', '相似职位', '推荐职位'];

  const start = minIndex(body, startTokens, 0);
  if (start === -1) return body;

  const end = minIndex(body, endTokens, start + 4);
  return end === -1 ? body.slice(start) : body.slice(start, end);
}

function minIndex(text, tokens, fromIndex) {
  let best = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, fromIndex);
    if (index !== -1 && (best === -1 || index < best)) best = index;
  }
  return best;
}

function inferTitle(title, titleText, bodyText) {
  const candidate = firstLine(title);
  if (candidate) return candidate;

  const pageTitle = (titleText || '').split(/[|-]/)[0]?.trim();
  if (pageTitle && !/BOSS|直聘|招聘/.test(pageTitle)) return pageTitle;

  const line = (bodyText || '').split('\n').map(item => item.trim()).find(item =>
    item.length >= 2 && item.length <= 40 && /工程师|开发|架构|算法|产品|运营|测试/.test(item)
  );
  return line || '';
}

function inferCompany(bodyText) {
  const lines = (bodyText || '').split('\n').map(line => line.trim()).filter(Boolean);
  const index = lines.findIndex(line => line === '公司介绍' || line === '工商信息');
  if (index > 0) return lines[index - 1].slice(0, 80);
  return '';
}

function inferSalary(bodyText) {
  const match = (bodyText || '').match(/(\d{1,3}\s*[-~]\s*\d{1,3}\s*[Kk]|[0-9.]+\s*[-~]\s*[0-9.]+\s*万)/);
  return match?.[1]?.replace(/\s+/g, '') || '';
}

function inferLocation(bodyText) {
  const lines = (bodyText || '').split('\n').map(line => line.trim()).filter(Boolean);
  return lines.find(line => /北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|厦门|长沙|重庆|天津/.test(line) && line.length <= 60) || '';
}

function saveJobs(jobs, timestamp) {
  return jobs.map((job, index) => {
    const hash = createHash('sha1').update(job.url || `${timestamp}-${index}`).digest('hex').slice(0, 8);
    const path = resolve(__dirname, JD_DIR, `boss-${timestamp}-${String(index + 1).padStart(2, '0')}-${hash}.md`);
    writeFileSync(path, renderJobMarkdown(job), 'utf-8');
    return path;
  });
}

function saveSummary(jobs, savedPaths, timestamp) {
  const summaryPath = resolve(__dirname, JD_DIR, `boss-scan-${timestamp}.md`);
  const latestPath = resolve(__dirname, JD_DIR, 'boss-scan-latest.md');
  const content = renderSummaryMarkdown(jobs, savedPaths);
  writeFileSync(summaryPath, content, 'utf-8');
  writeFileSync(latestPath, content, 'utf-8');
  return summaryPath;
}

function renderJobMarkdown(job) {
  return [
    `# ${job.company} - ${job.title}`,
    '',
    `**Platform:** ${job.platform}`,
    `**URL:** ${job.url}`,
    `**Company:** ${job.company}`,
    `**Role:** ${job.title}`,
    `**Salary:** ${job.salary}`,
    `**Location:** ${job.location}`,
    `**Scanned At:** ${new Date().toISOString()}`,
    '',
    '## JD Text',
    '',
    job.jdText,
    '',
  ].join('\n');
}

function renderSummaryMarkdown(jobs, savedPaths) {
  const lines = [
    '# BOSS 扫描结果',
    '',
    `**Scanned At:** ${new Date().toISOString()}`,
    `**Count:** ${jobs.length}`,
    '',
    '## 评估方式',
    '',
    '请按 `modes/_shared.md` + `modes/oferta.md` 逐个评估以下 JD。不要自动投递、自动开聊或发送消息。',
    '',
    '## Jobs',
    '',
  ];

  jobs.forEach((job, index) => {
    const savedPath = savedPaths[index] || '';
    lines.push(`### ${index + 1}. ${job.company} - ${job.title}`);
    lines.push('');
    lines.push(`- Platform: ${job.platform}`);
    lines.push(`- URL: ${job.url}`);
    lines.push(`- Company: ${job.company}`);
    lines.push(`- Role: ${job.title}`);
    lines.push(`- Salary: ${job.salary}`);
    lines.push(`- Location: ${job.location}`);
    if (savedPath) lines.push(`- JD file: ${relativeToRoot(savedPath)}`);
    lines.push('');
    lines.push('```text');
    lines.push(job.jdText);
    lines.push('```');
    lines.push('');
  });

  return lines.join('\n');
}

function importUrls(urls) {
  if (urls.length === 0) return;
  if (!existsSync(resolve(__dirname, 'scan.mjs'))) {
    console.warn('scan.mjs not found; skipped pipeline import.');
    return;
  }

  console.log('\nImporting URLs into pipeline through scan.mjs...');
  const result = spawnSync(process.execPath, ['scan.mjs', '--urls', urls.join(';')], {
    cwd: __dirname,
    encoding: 'utf-8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`scan.mjs failed with exit code ${result.status}`);
  }
}

function relativeToRoot(path) {
  return path.replace(resolve(__dirname) + '\\', '').replace(resolve(__dirname) + '/', '').replace(/\\/g, '/');
}

function timestampForPath() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

main().catch((err) => {
  console.error('boss-scan failed:', err.message);
  process.exit(1);
});
