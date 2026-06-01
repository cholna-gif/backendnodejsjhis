import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/chat/:rideId — load chat history
router.get('/:rideId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('ride_id', req.params.rideId)
    .order('created_at', { ascending: true });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data ?? []);
});

// POST /api/chat/:rideId — send a message
router.post('/:rideId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { message, sender_role } = req.body as { message: string; sender_role: string };

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      ride_id: req.params.rideId,
      sender_id: req.userId!,
      sender_role,
      message,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(201).json(data);
});

export default router;
