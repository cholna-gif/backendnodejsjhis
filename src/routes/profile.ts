import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/profile
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', req.userId!)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// POST /api/profile  — create or upsert profile after signup
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { full_name, email } = req.body as { full_name: string; email: string };

  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: req.userId!,
    full_name,
    email,
    role: 'passenger',
    wallet_balance: 0,
  });

  if (profileErr) {
    res.status(500).json({ error: profileErr.message });
    return;
  }

  const { error: roleErr } = await supabase.from('user_roles').upsert({
    user_id: req.userId!,
    role: 'passenger',
  });

  if (roleErr) {
    res.status(500).json({ error: roleErr.message });
    return;
  }

  res.status(201).json({ success: true });
});

// PUT /api/profile
router.put('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { full_name, phone, wallet_balance } = req.body as {
    full_name?: string;
    phone?: string;
    wallet_balance?: number;
  };

  const updates: Record<string, unknown> = {};
  if (full_name !== undefined) updates.full_name = full_name;
  if (phone !== undefined) updates.phone = phone;
  if (wallet_balance !== undefined) updates.wallet_balance = wallet_balance;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', req.userId!)
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

// POST /api/profile/wallet/deduct
router.post('/wallet/deduct', requireAuth, async (req: AuthRequest, res: Response) => {
  const { amount } = req.body as { amount: number };

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }

  const { data: profile, error: fetchErr } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', req.userId!)
    .single();

  if (fetchErr || !profile) {
    res.status(500).json({ error: 'Could not fetch wallet balance' });
    return;
  }

  const current = (profile as { wallet_balance: number }).wallet_balance;
  if (current < amount) {
    res.status(400).json({ error: 'Insufficient wallet balance' });
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ wallet_balance: current - amount })
    .eq('id', req.userId!)
    .select('wallet_balance')
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json(data);
});

export default router;
