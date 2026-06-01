import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/favorites — list favorite drivers
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('favorite_drivers')
    .select('*')
    .eq('passenger_id', req.userId!);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});

// GET /api/favorites/:driverId — check if a driver is a favorite
router.get('/:driverId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('favorite_drivers')
    .select('id')
    .eq('passenger_id', req.userId!)
    .eq('driver_id', req.params.driverId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ isFavorite: data !== null });
});

// POST /api/favorites — add a favorite driver
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { driver_id } = req.body as { driver_id: string };

  const { error } = await supabase
    .from('favorite_drivers')
    .insert({ passenger_id: req.userId!, driver_id });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json({ success: true });
});

// DELETE /api/favorites/:driverId — remove a favorite driver
router.delete('/:driverId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await supabase
    .from('favorite_drivers')
    .delete()
    .eq('passenger_id', req.userId!)
    .eq('driver_id', req.params.driverId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ success: true });
});

export default router;
