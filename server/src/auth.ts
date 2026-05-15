import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { AuthUser } from './types';

const COOKIE_NAME = 'racon_session';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function signToken(user: AuthUser) {
  return jwt.sign(user, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, SECRET) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export const SESSION_COOKIE = COOKIE_NAME;

export function hashPassword(plain: string) {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compareSync(plain, hash);
}

export function deterministicConsultantPassword(username: string, id: number) {
  const h = crypto
    .createHash('sha256')
    .update(`${username}:${id}:${SECRET}`)
    .digest('hex')
    .slice(0, 12);
  return `Rc${h}!`;
}

export function resolveConsultantPassword(username: string, id: number): string {
  const json = process.env.CONSULTANT_PASSWORDS_JSON;
  if (json) {
    try {
      const map = JSON.parse(json) as Record<string, string>;
      if (map[username]) return map[username];
    } catch {
      /* ignore */
    }
  }
  if (process.env.CONSULTANT_DEFAULT_PASSWORD) return process.env.CONSULTANT_DEFAULT_PASSWORD;
  return deterministicConsultantPassword(username, id);
}
