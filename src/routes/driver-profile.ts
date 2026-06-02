import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/driver/profile
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('user_id', req.userId!)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Driver profile not found' });
  res.json(data);
});

// PUT /api/driver/profile
router.put('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const updates = req.body as Record<string, unknown>;
  const { data, error } = await supabase
    .from('driver_profiles')
    .update(updates)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/driver/profile/online
router.patch('/online', requireAuth, async (req: AuthRequest, res: Response) => {
  const { online } = req.body as { online: boolean };
  const { error } = await supabase
    .from('driver_profiles')
    .update({ is_online: online })
    .eq('user_id', req.userId!);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PATCH /api/driver/profile/location
router.patch('/location', requireAuth, async (req: AuthRequest, res: Response) => {
  const { lat, lng } = req.body as { lat: number; lng: number };
  const { error } = await supabase
    .from('driver_profiles')
    .update({ current_lat: lat, current_lng: lng, last_location_update: new Date().toISOString() })
    .eq('user_id', req.userId!);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PATCH /api/driver/profile/active-ride
router.patch('/active-ride', requireAuth, async (req: AuthRequest, res: Response) => {
  const { value } = req.body as { value: boolean };
  const { error } = await supabase
    .from('driver_profiles')
    .update({ has_active_ride: value })
    .eq('user_id', req.userId!);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// POST /api/driver/profile/earnings — credit earnings after ride completes
router.post('/earnings', requireAuth, async (req: AuthRequest, res: Response) => {
  const { earnings } = req.body as { earnings: number };
  const { data: dp } = await supabase
    .from('driver_profiles')
    .select('total_earnings, total_rides, wallet_balance')
    .eq('user_id', req.userId!)
    .single();
  if (!dp) return res.status(404).json({ error: 'Driver profile not found' });
  const { error } = await supabase
    .from('driver_profiles')
    .update({
      total_earnings:  ((dp as any).total_earnings  || 0) + earnings,
      total_rides:     ((dp as any).total_rides     || 0) + 1,
      wallet_balance:  ((dp as any).wallet_balance  || 0) + earnings,
      has_active_ride: false,
    })
    .eq('user_id', req.userId!);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
