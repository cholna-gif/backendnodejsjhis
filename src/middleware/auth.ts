import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: string;
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  // Option 1: full signature verification (most secure)
  if (JWT_SECRET) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      req.userId = payload.sub;
      return next();
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
  }

  // Option 2: decode without signature check — checks structure, audience, expiry.
  // No network call, no timeout. Add SUPABASE_JWT_SECRET to .env for full security.
  try {
    const payload = jwt.decode(token) as {
      sub?: string;
      exp?: number;
      aud?: string;
    } | null;

    if (!payload?.sub || typeof payload.exp !== 'number' || payload.aud !== 'authenticated') {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
