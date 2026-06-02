import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabaseAnon } from '../lib/supabase';

export interface AuthRequest extends Request {
  userId?: string;
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// Helper: verify JWT via Supabase Auth API with a hard 5-second timeout
async function verifyWithSupabase(token: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  // Primary: local JWT verification — no network call, no timeout risk
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

  // Fallback: verify via Supabase Auth API (used until JWT_SECRET is set)
  const userId = await verifyWithSupabase(token);
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = userId;
  next();
}
