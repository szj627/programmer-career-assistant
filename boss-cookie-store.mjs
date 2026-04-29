import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const RUNTIME_DIR = resolve(__dirname, '.career-ops');
export const DEFAULT_COOKIE_PATH = resolve(RUNTIME_DIR, 'boss-cookies.json');

export function ensureRuntimeDir() {
  mkdirSync(RUNTIME_DIR, { recursive: true });
}

export function resolveCookiePath(path) {
  return path ? resolve(path) : DEFAULT_COOKIE_PATH;
}

export function loadBossCookies(path) {
  const cookiePath = resolveCookiePath(path);
  if (!existsSync(cookiePath)) {
    throw new Error(`BOSS cookie file not found: ${cookiePath}. Run npm run boss-login first.`);
  }

  const parsed = JSON.parse(readFileSync(cookiePath, 'utf-8'));
  const cookies = Array.isArray(parsed) ? parsed : parsed?.cookies;
  return normalizeBossCookies(cookies);
}

export function saveBossCookies(cookies, path) {
  ensureRuntimeDir();
  const cookiePath = resolveCookiePath(path);
  const normalized = normalizeBossCookies(cookies);
  writeFileSync(cookiePath, JSON.stringify(normalized, null, 2), 'utf-8');
  return { cookiePath, cookies: normalized };
}

export function normalizeBossCookies(cookies) {
  if (!Array.isArray(cookies)) {
    throw new Error('Cookie JSON must be an array or an object with a cookies array.');
  }

  const normalized = cookies
    .filter(cookie => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
    .filter(cookie => {
      const domain = String(cookie.domain || '').toLowerCase();
      return domain === 'zhipin.com' || domain.endsWith('.zhipin.com');
    })
    .map(cookie => {
      const out = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.zhipin.com',
        path: cookie.path || '/',
        httpOnly: Boolean(cookie.httpOnly),
        secure: cookie.secure !== false,
      };

      const expires = Number(cookie.expires);
      if (Number.isFinite(expires) && expires > 0) out.expires = expires;

      const sameSite = normalizeSameSite(cookie.sameSite);
      if (sameSite) out.sameSite = sameSite;

      return out;
    });

  if (normalized.length === 0) {
    throw new Error('No zhipin.com cookies found in the provided cookie JSON.');
  }

  return normalized;
}

function normalizeSameSite(value) {
  if (!value) return undefined;
  const text = String(value).toLowerCase();
  if (text === 'lax') return 'Lax';
  if (text === 'strict') return 'Strict';
  if (text === 'none' || text === 'no_restriction') return 'None';
  return undefined;
}
