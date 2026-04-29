#!/usr/bin/env node

/**
 * boss-login.mjs - collect BOSS Zhipin cookies for read-only scanning
 *
 * Usage:
 *   node boss-login.mjs
 *   node boss-login.mjs --manual
 *   node boss-login.mjs --from-file cookies.json
 *   node boss-login.mjs --channel chrome
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { DEFAULT_COOKIE_PATH, saveBossCookies } from './boss-cookie-store.mjs';

const DEFAULT_URL = 'https://www.zhipin.com/web/user/';
const VALID_CHANNELS = new Set(['msedge', 'chrome', 'chromium']);

function usage(exitCode = 0) {
  console.log([
    'BOSS 直聘 Cookie 登录助手',
    '',
    'Usage:',
    '  node boss-login.mjs',
    '  node boss-login.mjs --manual',
    '  node boss-login.mjs --from-file cookies.json',
    '  node boss-login.mjs --channel chrome',
    '',
    'Options:',
    '  --channel <name>       浏览器通道：msedge、chrome、chromium，默认 msedge',
    '  --url <url>            登录起始页，默认 https://www.zhipin.com/web/user/',
    `  --cookie-file <path>   Cookie 保存路径，默认 ${DEFAULT_COOKIE_PATH}`,
    '  --manual              从终端粘贴 Cookie JSON',
    '  --from-file <path>    从文件读取 Cookie JSON',
    '  -h, --help            显示帮助',
  ].join('\n'));
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    channel: 'msedge',
    url: DEFAULT_URL,
    cookieFile: undefined,
    manual: false,
    fromFile: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--channel') {
      const channel = requireValue(argv, ++i, '--channel').toLowerCase();
      if (!VALID_CHANNELS.has(channel)) throw new Error('--channel must be one of: msedge, chrome, chromium');
      opts.channel = channel;
    } else if (arg === '--url') {
      opts.url = requireValue(argv, ++i, '--url');
    } else if (arg === '--cookie-file') {
      opts.cookieFile = requireValue(argv, ++i, '--cookie-file');
    } else if (arg === '--manual') {
      opts.manual = true;
    } else if (arg === '--from-file') {
      opts.fromFile = requireValue(argv, ++i, '--from-file');
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

  if (opts.fromFile) {
    const cookies = JSON.parse(readFileSync(opts.fromFile, 'utf-8'));
    const saved = saveBossCookies(cookies, opts.cookieFile);
    console.log(`Saved ${saved.cookies.length} BOSS cookie(s) to ${saved.cookiePath}`);
    return;
  }

  if (opts.manual) {
    const cookies = await readManualCookieJson();
    const saved = saveBossCookies(cookies, opts.cookieFile);
    console.log(`Saved ${saved.cookies.length} BOSS cookie(s) to ${saved.cookiePath}`);
    return;
  }

  await collectCookiesFromBrowser(opts);
}

async function readManualCookieJson() {
  const rl = createInterface({ input, output });
  try {
    console.log('Paste Cookie JSON below, then submit an empty line:');
    const lines = [];
    while (true) {
      const line = await rl.question('');
      if (!line.trim()) break;
      lines.push(line);
    }
    return JSON.parse(lines.join('\n'));
  } finally {
    rl.close();
  }
}

async function collectCookiesFromBrowser(opts) {
  const launchOptions = {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  };
  if (opts.channel !== 'chromium') launchOptions.channel = opts.channel;

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();
  const rl = createInterface({ input, output });

  try {
    console.log('请在打开的浏览器中手动登录 BOSS 直聘；脚本只会保存 Cookie，不会点击沟通、投递或发送。');
    await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await rl.question('\n登录完成后按 Enter 保存 Cookie；如果遇到安全验证，请先手动完成验证...');

    const cookies = await context.cookies('https://www.zhipin.com/');
    const saved = saveBossCookies(cookies, opts.cookieFile);
    console.log(`Saved ${saved.cookies.length} BOSS cookie(s) to ${saved.cookiePath}`);
  } finally {
    rl.close();
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('boss-login failed:', err.message);
  process.exit(1);
});
