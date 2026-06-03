"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/driver/profile
router.get('/', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('driver_profiles')
        .select('*')
        .eq('user_id', req.userId)
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!data)
        return res.status(404).json({ error: 'Driver profile not found' });
    res.json(data);
});
// PUT /api/driver/profile
router.put('/', auth_1.requireAuth, async (req, res) => {
    const updates = req.body;
    const { data, error } = await supabase_1.supabase
        .from('driver_profiles')
        .update(updates)
        .eq('user_id', req.userId)
        .select()
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data);
});
// PATCH /api/driver/profile/online
router.patch('/online', auth_1.requireAuth, async (req, res) => {
    const { online } = req.body;
    const { error } = await supabase_1.supabase
        .from('driver_profiles')
        .update({ is_online: online })
        .eq('user_id', req.userId);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
// PATCH /api/driver/profile/location
router.patch('/location', auth_1.requireAuth, async (req, res) => {
    const { lat, lng } = req.body;
    const { error } = await supabase_1.supabase
        .from('driver_profiles')
        .update({ current_lat: lat, current_lng: lng, last_location_update: new Date().toISOString() })
        .eq('user_id', req.userId);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
// PATCH /api/driver/profile/active-ride
router.patch('/active-ride', auth_1.requireAuth, async (req, res) => {
    const { value } = req.body;
    const { error } = await supabase_1.supabase
        .from('driver_profiles')
        .update({ has_active_ride: value })
        .eq('user_id', req.userId);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
// POST /api/driver/profile/earnings — credit earnings after ride completes
router.post('/earnings', auth_1.requireAuth, async (req, res) => {
    const { earnings } = req.body;
    const { data: dp } = await supabase_1.supabase
        .from('driver_profiles')
        .select('total_earnings, total_rides, wallet_balance')
        .eq('user_id', req.userId)
        .single();
    if (!dp)
        return res.status(404).json({ error: 'Driver profile not found' });
    const { error } = await supabase_1.supabase
        .from('driver_profiles')
        .update({
        total_earnings: (dp.total_earnings || 0) + earnings,
        total_rides: (dp.total_rides || 0) + 1,
        wallet_balance: (dp.wallet_balance || 0) + earnings,
        has_active_ride: false,
    })
        .eq('user_id', req.userId);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
exports.default = router;
