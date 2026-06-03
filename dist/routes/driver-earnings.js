"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/driver/earnings — full earnings history + summary
router.get('/', auth_1.requireAuth, async (req, res) => {
    const [ridesRes, dpRes] = await Promise.all([
        supabase_1.supabase.from('rides').select('*').eq('driver_id', req.userId).eq('status', 'completed').order('completed_at', { ascending: false }),
        supabase_1.supabase.from('driver_profiles').select('wallet_balance, total_withdrawn').eq('user_id', req.userId).maybeSingle(),
    ]);
    const rides = (ridesRes.data ?? []);
    const earningsFare = (r) => r.final_fare ?? r.estimated_fare ?? 0;
    const isToday = (d) => { const n = new Date(); const t = new Date(d); return t.toDateString() === n.toDateString(); };
    const isThisWeek = (d) => { const n = new Date(); const t = new Date(d); const start = new Date(n); start.setDate(n.getDate() - n.getDay()); return t >= start; };
    const isThisMonth = (d) => { const n = new Date(); const t = new Date(d); return t.getMonth() === n.getMonth() && t.getFullYear() === n.getFullYear(); };
    const todayRides = rides.filter(r => r.completed_at && isToday(r.completed_at));
    const weekRides = rides.filter(r => r.completed_at && isThisWeek(r.completed_at));
    const monthRides = rides.filter(r => r.completed_at && isThisMonth(r.completed_at));
    res.json({
        rides,
        summary: {
            todayAmount: todayRides.reduce((s, r) => s + earningsFare(r), 0),
            todayRides: todayRides.length,
            weekAmount: weekRides.reduce((s, r) => s + earningsFare(r), 0),
            weekRides: weekRides.length,
            monthAmount: monthRides.reduce((s, r) => s + earningsFare(r), 0),
            monthRides: monthRides.length,
            walletBalance: dpRes.data?.wallet_balance ?? 0,
            totalWithdrawn: dpRes.data?.total_withdrawn ?? 0,
        },
    });
});
// GET /api/driver/earnings/today — lightweight, for requests tab header
router.get('/today', auth_1.requireAuth, async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase_1.supabase
        .from('rides')
        .select('driver_earnings')
        .eq('driver_id', req.userId)
        .eq('status', 'completed')
        .gte('completed_at', today.toISOString());
    const amount = (data ?? []).reduce((sum, r) => sum + (r.driver_earnings ?? 0), 0);
    res.json({ amount, rides: (data ?? []).length });
});
// POST /api/driver/earnings/withdraw
router.post('/withdraw', auth_1.requireAuth, async (req, res) => {
    const { amount, bankName, accountNumber, accountHolder } = req.body;
    const { data: dp } = await supabase_1.supabase.from('driver_profiles').select('wallet_balance, total_withdrawn').eq('user_id', req.userId).single();
    const walletBalance = dp?.wallet_balance ?? 0;
    if (!Number.isFinite(amount) || amount <= 0 || amount > walletBalance) {
        return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }
    await supabase_1.supabase.from('withdrawals').insert({
        driver_id: req.userId, amount, bank_name: bankName,
        account_number: accountNumber, account_holder: accountHolder,
    });
    await supabase_1.supabase.from('driver_profiles').update({
        wallet_balance: walletBalance - amount,
        total_withdrawn: (dp?.total_withdrawn ?? 0) + amount,
    }).eq('user_id', req.userId);
    res.json({ success: true });
});
exports.default = router;
