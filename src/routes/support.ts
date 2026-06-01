import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /api/support — submit a support ticket
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { subject, category, message } = req.body as {
    subject: string;
    category: string;
    message: string;
  };

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: req.userId!,
      subject,
      category,
      message,
      status: 'open',
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
