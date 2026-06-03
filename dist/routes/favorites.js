"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/favorites — list favorite drivers
router.get('/', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('favorite_drivers')
        .select('*')
        .eq('passenger_id', req.userId);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
// GET /api/favorites/:driverId — check if a driver is a favorite
router.get('/:driverId', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('favorite_drivers')
        .select('id')
        .eq('passenger_id', req.userId)
        .eq('driver_id', req.params.driverId)
        .maybeSingle();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ isFavorite: data !== null });
});
// POST /api/favorites — add a favorite driver
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { driver_id } = req.body;
    const { error } = await supabase_1.supabase
        .from('favorite_drivers')
        .insert({ passenger_id: req.userId, driver_id });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json({ success: true });
});
// DELETE /api/favorites/:driverId — remove a favorite driver
router.delete('/:driverId', auth_1.requireAuth, async (req, res) => {
    const { error } = await supabase_1.supabase
        .from('favorite_drivers')
        .delete()
        .eq('passenger_id', req.userId)
        .eq('driver_id', req.params.driverId);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
});
exports.default = router;
