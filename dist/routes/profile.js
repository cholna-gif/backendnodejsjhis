"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/profile
router.get('/', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('profiles')
        .select('*')
        .eq('id', req.userId)
        .maybeSingle();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
// POST /api/profile  — create or upsert profile after signup
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { full_name, email } = req.body;
    const { error: profileErr } = await supabase_1.supabase.from('profiles').upsert({
        id: req.userId,
        full_name,
        email,
        role: 'passenger',
        wallet_balance: 0,
    });
    if (profileErr) {
        res.status(500).json({ error: profileErr.message });
        return;
    }
    const { error: roleErr } = await supabase_1.supabase.from('user_roles').upsert({
        user_id: req.userId,
        role: 'passenger',
    });
    if (roleErr) {
        res.status(500).json({ error: roleErr.message });
        return;
    }
    res.status(201).json({ success: true });
});
// PUT /api/profile
router.put('/', auth_1.requireAuth, async (req, res) => {
    const { full_name, phone, wallet_balance } = req.body;
    const updates = {};
    if (full_name !== undefined)
        updates.full_name = full_name;
    if (phone !== undefined)
        updates.phone = phone;
    if (wallet_balance !== undefined)
        updates.wallet_balance = wallet_balance;
    const { data, error } = await supabase_1.supabase
        .from('profiles')
        .update(updates)
        .eq('id', req.userId)
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
// POST /api/profile/wallet/deduct
router.post('/wallet/deduct', auth_1.requireAuth, async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        res.status(400).json({ error: 'Invalid amount' });
        return;
    }
    const { data: profile, error: fetchErr } = await supabase_1.supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', req.userId)
        .single();
    if (fetchErr || !profile) {
        res.status(500).json({ error: 'Could not fetch wallet balance' });
        return;
    }
    const current = profile.wallet_balance;
    if (current < amount) {
        res.status(400).json({ error: 'Insufficient wallet balance' });
        return;
    }
    const { data, error } = await supabase_1.supabase
        .from('profiles')
        .update({ wallet_balance: current - amount })
        .eq('id', req.userId)
        .select('wallet_balance')
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
exports.default = router;
