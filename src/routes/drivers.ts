import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/drivers/online — online driver positions for map display
// Must be declared BEFORE /:driverId to avoid Express matching "online" as an ID
router.get('/online', requireAuth, async (_req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('user_id, current_lat, current_lng, vehicle_type')
    .eq('is_online', true)
    .not('current_lat', 'is', null)
    .not('current_lng', 'is', null);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/drivers/:driverId/location — single driver's live location
router.get('/:driverId/location', requireAuth, async (req: AuthRequest, res: Response) => {
  const { driverId } = req.params;

  const { data, error } = await supabase
    .from('driver_profiles')
    .select('current_lat, current_lng')
    .eq('user_id', driverId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Driver not found' });
  res.json(data);
});

// GET /api/drivers/:driverId — driver name + full profile
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
