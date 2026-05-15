import { Request, Response, NextFunction } from 'express';
import { SESSION_COOKIE, verifyToken } from './auth';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const user = verifyToken(token);
    if (user) req.user = user;
  }
  next();
}
