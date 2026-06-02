import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/driver/auth/user-data — role + profile for the authenticated driver
router.get('/user-data', requireAuth, async (req: AuthRequest, res: Response) => {
  const [roleRes, profileRes] = await Promise.all([
    supabase.from('user_roles').select('role').eq('user_id', req.userId!).maybeSingle(),
    supabase.from('profiles').select('*').eq('id', req.userId!).maybeSingle(),
  ]);
  res.json({
    role:    roleRes.data?.role ?? null,
    profile: profileRes.data   ?? null,
  });
});

export default router;
