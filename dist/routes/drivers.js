"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/drivers/online — online driver positions for map display
// Must be declared BEFORE /:driverId to avoid Express matching "online" as an ID
router.get('/online', auth_1.requireAuth, async (_req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('driver_profiles')
        .select('user_id, current_lat, current_lng, vehicle_type')
        .eq('is_online', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data ?? []);
});
// GET /api/drivers/:driverId/location — single driver's live location
router.get('/:driverId/location', auth_1.requireAuth, async (req, res) => {
    const { driverId } = req.params;
    const { data, error } = await supabase_1.supabase
        .from('driver_profiles')
        .select('current_lat, current_lng')
        .eq('user_id', driverId)
        .maybeSingle();
    if (error)
        return res.status(500).json({ error: error.message });
    if (!data)
        return res.status(404).json({ error: 'Driver not found' });
    res.json(data);
});
// GET /api/drivers/:driverId — driver name + full profile
router.get('/:driverId', auth_1.requireAuth, async (req, res) => {
    const { driverId } = req.params;
    const [profileRes, driverProfileRes] = await Promise.all([
        supabase_1.supabase.from('profiles').select('id, full_name').eq('id', driverId).maybeSingle(),
        supabase_1.supabase.from('driver_profiles').select('*').eq('user_id', driverId).maybeSingle(),
    ]);
    res.json({
        full_name: profileRes.data?.full_name ?? null,
        driver_profile: driverProfileRes.data ?? null,
    });
});
exports.default = router;
