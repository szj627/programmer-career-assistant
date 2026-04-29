#!/usr/bin/env node

/**
 * boss-scan.mjs - read-only BOSS Zhipin JD scanner
 *
 * Uses cookies saved by boss-login.mjs, opens BOSS pages, reads visible JD data
 * or in-page Vue job detail state, then stores JD markdown files and imports
 * URLs into data/pipeline.md. It never clicks chat/apply/submit controls.
 *
 * Usage:
 *   node boss-scan.mjs --limit 5
 *   node boss-scan.mjs --url "https://www.zhipin.com/web/geek/job" --limit 5
 *   node boss-scan.mjs --dry-run
 */

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { DEFAULT_COOKIE_PATH, loadBossCookies } from './boss-cookie-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_URL = 'https://www.zhipin.com/web/geek/jobs';
const DEFAULT_LIMIT = 5;
const JD_DIR = 'jds';
const VALID_CHANNELS = new Set(['msedge', 'chrome', 'chromium']);

function usage(exitCode = 0) {
  console.log([
    'BOSS 直聘只读 JD 扫描器',
    '',
    'Usage:',
    '  node boss-scan.mjs --limit 5',
    '  node boss-scan.mjs --url "https://www.zhipin.com/web/geek/job" --limit 5',
    '  node boss-scan.mjs --dry-run',
    '',
    'Options:',
    `  --url <url>            打开的起始页面，默认 ${DEFAULT_URL}`,
    `  --limit <n>            列表页最多扫描岗位数，默认 ${DEFAULT_LIMIT}`,
    '  --channel <name>       浏览器通道：msedge、chrome、chromium，默认 msedge',
    `  --cookie-file <path>   Cookie 文件路径，默认 ${DEFAULT_COOKIE_PATH}`,
    '  --no-import            只保存 JD，不导入 data/pipeline.md',
    '  --dry-run              只读取并打印摘要，不写文件、不导入',
    '  -h, --help             显示帮助',
  ].join('\n'));
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    url: DEFAULT_URL,
    limit: DEFAULT_LIMIT,
    channel: 'msedge',
    cookieFile: undefined,
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
    } else if (arg === '--channel') {
      const channel = requireValue(argv, ++i, '--channel').toLowerCase();
      if (!VALID_CHANNELS.has(channel)) throw new Error('--channel must be one of: msedge, chrome, chromium');
      opts.channel = channel;
    } else if (arg === '--cookie-file') {
      opts.cookieFile = requireValue(argv, ++i, '--cookie-file');
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
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
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

  const cookies = loadBossCookies(opts.cookieFile);
  mkdirSync(resolve(__dirname, JD_DIR), { recursive: true });

  const browser = await launchBrowser(opts.channel);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  await context.addCookies(cookies);

  try {
    const page = await context.newPage();
    const initialDetailResponse = waitForJobDetailResponse(page, 10000).catch(() => null);
    await gotoBossPage(page, opts.url);
    await assertPageReadable(page);

    const jobs = await scanCurrentView(context, page, opts.limit, initialDetailResponse);
    if (jobs.length === 0) {
      console.log('\nNo visible job details or job_detail links were found.');
      console.log('请确认 Cookie 有效，且页面是 BOSS 岗位详情页或岗位列表页。');
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
    await browser.close().catch(() => {});
  }
}

async function launchBrowser(channel) {
  const opts = { headless: false };
  if (channel !== 'chromium') opts.channel = channel;
  return chromium.launch(opts);
}

async function scanCurrentView(context, page, limit, initialDetailResponse) {
  await waitForPage(page);

  if (isBossDetailUrl(page.url()) || await pageLooksLikeDetail(page)) {
    const responseData = await initialDetailResponse.catch(() => null);
    const job = await extractJob(page, page.url(), responseData, null);
    return jobHasUsefulText(job) ? [job] : [];
  }

  const targets = (await collectJobTargets(page)).slice(0, limit);
  if (targets.length === 0) return [];

  console.log(`\nFound ${targets.length} job target(s), scanning up to ${limit}.`);

  const detailPage = await context.newPage();
  const jobs = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (i > 0) await randomDelay(2000, 5000);

      console.log(`[${i + 1}/${targets.length}] ${target.url}`);
      const detailResponse = waitForJobDetailResponse(detailPage, 10000);
      await gotoBossPage(detailPage, target.url);
      await assertPageReadable(detailPage);

      const responseData = await detailResponse.catch(() => null);
      const job = await extractJob(detailPage, target.url, responseData, target.listData);
      if (jobHasUsefulText(job)) jobs.push(job);
    }
  } finally {
    await detailPage.close().catch(() => {});
  }

  return jobs;
}

async function waitForPage(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function gotoBossPage(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  return response;
}

async function waitForJobDetailResponse(page, timeout) {
  const response = await page.waitForResponse(
    res => res.url().startsWith('https://www.zhipin.com/wapi/zpgeek/job/detail.json'),
    { timeout }
  );
  return response.json().catch(() => null);
}

async function assertPageReadable(page) {
  const url = page.url();
  const text = await getBodyText(page);
  if (/\/web\/common\/(403|error)\.html/i.test(url)) {
    throw new Error(`BOSS refused access at ${url}. Stop scanning and retry later or use manual JD paste.`);
  }
  if (/login|passport|security|captcha|verify/i.test(url) ||
      /登录后查看|请登录|扫码登录|安全验证|验证码|请完成验证|当前 IP 地址可能存在异常访问行为/.test(text)) {
    throw new Error('BOSS login/security verification detected. Stop scanning and run npm run boss-login again after manual verification.');
  }
}

function isBossDetailUrl(url) {
  return /zhipin\.com\/job_detail\//i.test(url);
}

async function pageLooksLikeDetail(page) {
  const text = await getBodyText(page);
  return /职位描述|岗位职责|任职要求|职位详情/.test(text) && text.length > 500;
}

async function getBodyText(page) {
  return page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
}

async function collectJobTargets(page) {
  const fromPage = await page.evaluate(() => {
    const targets = [];
    const add = (url, listData = null) => {
      if (url) targets.push({ url: new URL(url, location.href).toString(), listData });
    };

    for (const anchor of document.querySelectorAll('a[href]')) {
      const raw = anchor.getAttribute('href');
      if (raw && raw.includes('/job_detail/')) add(raw);
    }

    const vue = document.querySelector('.page-jobs-main')?.__vue__;
    const jobList = Array.isArray(vue?.jobList) ? vue.jobList : [];
    for (const item of jobList) {
      const id = item.encryptJobId || item.encryptId;
      if (!id) continue;
      add(`https://www.zhipin.com/job_detail/${id}.html`, {
        title: item.jobName || item.jobTitle || item.positionName || '',
        company: item.brandName || item.companyName || '',
        salary: item.salaryDesc || '',
        location: item.cityName || item.areaDistrict || '',
        experience: item.jobExperience || '',
      });
    }

    return targets;
  }).catch(() => []);

  const seen = new Set();
  return fromPage.filter(target => {
    const normalized = normalizeUrl(target.url);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    target.url = normalized;
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

async function extractJob(page, fallbackUrl, responseData, listData) {
  const vueData = await readVueJobDetail(page);
  const domData = await readDomJobDetail(page);
  const apiData = normalizeApiJobDetail(responseData);

  const title = firstNonEmpty(apiData.title, vueData.title, domData.title, listData?.title, inferTitle(domData.title, domData.titleText, domData.bodyText));
  const company = firstNonEmpty(apiData.company, vueData.company, domData.company, listData?.company, inferCompany(domData.bodyText));
  const salary = firstNonEmpty(apiData.salary, vueData.salary, domData.salary, listData?.salary, inferSalary(domData.bodyText), '未说明/需确认');
  const location = firstNonEmpty(apiData.location, vueData.location, domData.location, listData?.location, inferLocation(domData.bodyText), '未说明/需确认');
  const jdText = compactText(firstNonEmpty(apiData.jdText, vueData.jdText, domData.detail, extractDetailFromBody(domData.bodyText)));

  return {
    platform: 'boss',
    url: normalizeUrl(apiData.url) || normalizeUrl(vueData.url) || normalizeUrl(domData.url) || normalizeUrl(fallbackUrl) || fallbackUrl,
    title: title || '待识别',
    company: company || '待识别',
    salary,
    location,
    jdText,
  };
}

async function readVueJobDetail(page) {
  return page.evaluate(() => {
    const data = document.querySelector('.job-detail-box')?.__vue__?.data;
    const jobInfo = data?.jobInfo || {};
    const companyInfo = data?.brandComInfo || data?.companyInfo || {};
    const selected = document.querySelector('.page-jobs-main')?.__vue__?.currentJob || {};
    return {
      url: jobInfo.encryptId ? `https://www.zhipin.com/job_detail/${jobInfo.encryptId}.html` : location.href,
      title: jobInfo.jobName || jobInfo.positionName || selected.jobName || '',
      company: companyInfo.brandName || companyInfo.companyName || selected.brandName || '',
      salary: jobInfo.salaryDesc || selected.salaryDesc || '',
      location: jobInfo.cityName || selected.cityName || '',
      jdText: jobInfo.postDescription || jobInfo.description || '',
    };
  }).catch(() => ({}));
}

async function readDomJobDetail(page) {
  return page.evaluate(() => {
    const clean = value => (value || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    const readFirst = selectors => {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        const text = clean(node?.innerText || node?.textContent || '');
        if (text) return text;
      }
      return '';
    };
    const readLongest = selectors => {
      let best = '';
      for (const selector of selectors) {
        for (const node of document.querySelectorAll(selector)) {
          const text = clean(node.innerText || node.textContent || '');
          if (text.length > best.length) best = text;
        }
      }
      return best;
    };
    return {
      url: location.href,
      titleText: document.title || '',
      title: readFirst(['.job-name', '.job-title', '.job-detail-info h1', '[class*="job-name"]', '[class*="job-title"]', 'h1']),
      company: readFirst(['.company-info .name', '.company-name', '.sider-company .name', '[class*="company-name"]', '[class*="company"] a']),
      salary: readFirst(['.salary', '.job-salary', '[class*="salary"]']),
      location: readFirst(['.job-location', '.location', '.job-address', '[class*="location"]', '[class*="address"]']),
      detail: readLongest(['.job-sec', '.job-detail-section', '.job-detail', '.detail-content', '[class*="job-sec"]', '[class*="job-detail"]', '[class*="detail-content"]', 'main']),
      bodyText: clean(document.body?.innerText || ''),
    };
  }).catch(() => ({}));
}

function normalizeApiJobDetail(responseData) {
  const data = responseData?.zpData || responseData?.data || responseData || {};
  const jobInfo = data.jobInfo || data.job || {};
  const companyInfo = data.brandComInfo || data.companyInfo || data.company || {};
  return {
    url: jobInfo.encryptId ? `https://www.zhipin.com/job_detail/${jobInfo.encryptId}.html` : '',
    title: jobInfo.jobName || jobInfo.positionName || '',
    company: companyInfo.brandName || companyInfo.companyName || '',
    salary: jobInfo.salaryDesc || '',
    location: jobInfo.cityName || '',
    jdText: jobInfo.postDescription || jobInfo.description || '',
  };
}

function firstNonEmpty(...values) {
  return values.map(value => String(value || '').trim()).find(Boolean) || '';
}

function jobHasUsefulText(job) {
  return Boolean(job?.jdText && job.jdText.length > 100);
}

function compactText(value) {
  const noise = [/^登录$/, /^注册$/, /^首页$/, /^消息$/, /^我的$/, /^APP$/, /^下载APP$/, /^立即沟通$/, /^投递$/];
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
  if (title) return title.split('\n').find(Boolean) || '';
  const pageTitle = (titleText || '').split(/[|-]/)[0]?.trim();
  if (pageTitle && !/BOSS|直聘|招聘/.test(pageTitle)) return pageTitle;
  return (bodyText || '').split('\n').map(item => item.trim()).find(item =>
    item.length >= 2 && item.length <= 40 && /工程师|开发|架构|算法|产品|运营|测试/.test(item)
  ) || '';
}

function inferCompany(bodyText) {
  const lines = (bodyText || '').split('\n').map(line => line.trim()).filter(Boolean);
  const index = lines.findIndex(line => line === '公司介绍' || line === '工商信息');
  return index > 0 ? lines[index - 1].slice(0, 80) : '';
}

function inferSalary(bodyText) {
  const match = (bodyText || '').match(/(\d{1,3}\s*[-~]\s*\d{1,3}\s*[Kk]|[0-9.]+\s*[-~]\s*[0-9.]+\s*万)/);
  return match?.[1]?.replace(/\s+/g, '') || '';
}

function inferLocation(bodyText) {
  const lines = (bodyText || '').split('\n').map(line => line.trim()).filter(Boolean);
  return lines.find(line => /北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|厦门|长沙|重庆|天津/.test(line) && line.length <= 60) || '';
}

async function randomDelay(minMs, maxMs) {
  const delay = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  await new Promise(resolve => setTimeout(resolve, delay));
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
  if (result.status !== 0) throw new Error(`scan.mjs failed with exit code ${result.status}`);
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
