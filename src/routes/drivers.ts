import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/drivers/:driverId — get driver name + profile
router.get('/:driverId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { driverId } = req.params;

  const [profileRes, driverProfileRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('id', driverId).maybeSingle(),
    supabase.from('driver_profiles').select('*').eq('user_id', driverId).maybeSingle(),
  ]);

  res.json({
    full_name: (profileRes.data as { full_name?: string } | null)?.full_name ?? null,
    driver_profile: driverProfileRes.data ?? null,
  });
});

export default router;
