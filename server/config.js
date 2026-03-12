import crypto from 'node:crypto';

const DEFAULT_JWT_SECRET = 'dev-secret-change-me';
const DEFAULT_ADMIN_USER = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin';

function parseJsonEnv(name) {
  const raw = process.env[name];
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn(`[config] ${name} is invalid JSON. Ignoring custom passwords.`);
    return {};
  }
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT || 3001);
export const JWT_SECRET = process.env.SESSION_SECRET || DEFAULT_JWT_SECRET;
export const ADMIN_USER = String(process.env.ADMIN_USER || DEFAULT_ADMIN_USER).trim().toLowerCase();
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
export const CONSULTANT_DEFAULT_PASSWORD = process.env.CONSULTANT_DEFAULT_PASSWORD || '';
export const CONSULTANT_PASSWORDS = parseJsonEnv('CONSULTANT_PASSWORDS_JSON');
export const RESET_CONSULTANT_PASSWORDS = process.env.RESET_CONSULTANT_PASSWORDS === '1';
export const RESET_SALES_DATA = process.env.RESET_SALES_DATA === '1';
export const DB_INIT_RETRIES = Math.max(1, Number(process.env.DB_INIT_RETRIES || 10));
export const DB_INIT_RETRY_DELAY_MS = Math.max(1000, Number(process.env.DB_INIT_RETRY_DELAY_MS || 5000));
export const CANCELLATION_PHASE_DAYS = Math.max(1, Number(process.env.CANCELLATION_PHASE_DAYS || 30));

export function validateRuntimeConfig() {
  const problems = [];

  if (!Number.isFinite(PORT) || PORT <= 0) {
    problems.push('PORT must be a positive number.');
  }

  if (IS_PRODUCTION && JWT_SECRET === DEFAULT_JWT_SECRET) {
    problems.push('SESSION_SECRET must be set in production.');
  }

  if (problems.length) {
    throw new Error(`Invalid runtime configuration:\n- ${problems.join('\n- ')}`);
  }

  if (!IS_PRODUCTION) {
    if (JWT_SECRET === DEFAULT_JWT_SECRET) {
      console.warn('[config] SESSION_SECRET is using the development default.');
    }
    if (ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
      console.warn('[config] ADMIN_PASSWORD is using the development default.');
    }
  }
}

export function assertAdminSeedIsSafe(adminExists) {
  if (!adminExists && IS_PRODUCTION && ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be set before creating the first admin in production.');
  }
}

export function resolveConsultantPassword(username, consultantId) {
  const configured = CONSULTANT_PASSWORDS[String(username || '').trim().toLowerCase()];
  if (configured) return configured;
  if (CONSULTANT_DEFAULT_PASSWORD) return CONSULTANT_DEFAULT_PASSWORD;

  const seed = `${username || 'consultor'}:${consultantId || 0}:${JWT_SECRET}`;
  const digest = crypto.createHash('sha256').update(seed).digest('base64url');
  return `Rc${digest.slice(0, 12)}!`;
}
