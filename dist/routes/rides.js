"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const ACTIVE_STATUSES = ['pending', 'matched', 'arrived', 'in_progress'];
// GET /api/rides/guard/active — check if passenger has an active ride
router.get('/guard/active', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('id')
        .eq('passenger_id', req.userId)
        .in('status', ACTIVE_STATUSES)
        .limit(1);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ hasActiveRide: (data?.length ?? 0) > 0 });
});
// GET /api/rides/active — get current active ride
router.get('/active', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('passenger_id', req.userId)
        .in('status', [...ACTIVE_STATUSES, 'completed'])
        .order('created_at', { ascending: false })
        .limit(1);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data?.[0] ?? null);
});
// GET /api/rides/history — all past rides
router.get('/history', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('passenger_id', req.userId)
        .order('created_at', { ascending: false });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
// GET /api/rides/clear-stuck — cancel ALL active rides for the passenger
router.post('/clear-stuck', auth_1.requireAuth, async (req, res) => {
    const { data: active } = await supabase_1.supabase
        .from('rides')
        .select('id')
        .eq('passenger_id', req.userId)
        .in('status', ACTIVE_STATUSES);
    for (const r of active ?? []) {
        await supabase_1.supabase.from('rides').update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancellation_reason: 'Force-cleared by passenger',
        }).eq('id', r.id);
    }
    res.json({ cleared: (active ?? []).length });
});
// GET /api/rides/:id — get a single ride by ID
router.get('/:id', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? null);
});
// POST /api/rides — book a new ride
router.post('/', auth_1.requireAuth, async (req, res) => {
    const body = req.body;
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .insert({ ...body, passenger_id: req.userId })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
// PATCH /api/rides/:id/cancel
router.patch('/:id/cancel', auth_1.requireAuth, async (req, res) => {
    const { reason, payment_status, final_fare } = req.body;
    const updates = {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? 'Cancelled by passenger',
        cancelled_by: 'passenger',
    };
    if (payment_status !== undefined)
        updates.payment_status = payment_status;
    if (final_fare !== undefined)
        updates.final_fare = final_fare;
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .update(updates)
        .eq('id', req.params.id)
        .eq('passenger_id', req.userId)
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
// POST /api/rides/:id/retry — cancel the old ride and re-book it as pending
router.post('/:id/retry', auth_1.requireAuth, async (req, res) => {
    // Cancel old ride
    const { data: oldRide, error: cancelErr } = await supabase_1.supabase
        .from('rides')
        .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: 'Retried by passenger',
        cancelled_by: 'passenger',
    })
        .eq('id', req.params.id)
        .eq('passenger_id', req.userId)
        .select()
        .single();
    if (cancelErr || !oldRide) {
        res.status(500).json({ error: cancelErr?.message ?? 'Ride not found' });
        return;
    }
    // Create new pending ride from old data
    const { id, created_at, status, cancelled_at, cancellation_reason, cancelled_by, matched_at, started_at, arrived_at, completed_at, driver_id, driver_name, agreed_price, final_fare, driver_rating, driver_review, passenger_rating, passenger_review, ...rideData } = oldRide;
    const { data: newRide, error: bookErr } = await supabase_1.supabase
        .from('rides')
        .insert({ ...rideData, passenger_id: req.userId, status: 'pending' })
        .select()
        .single();
    if (bookErr) {
        res.status(500).json({ error: bookErr.message });
        return;
    }
    res.status(201).json(newRide);
});
// PATCH /api/rides/:id/rate — submit passenger rating for driver
router.patch('/:id/rate', auth_1.requireAuth, async (req, res) => {
    const { rating, review, driver_id } = req.body;
    const { error: rideErr } = await supabase_1.supabase
        .from('rides')
        .update({ driver_rating: rating, driver_review: review ?? null })
        .eq('id', req.params.id)
        .eq('passenger_id', req.userId);
    if (rideErr) {
        res.status(500).json({ error: rideErr.message });
        return;
    }
    const { error: ratingErr } = await supabase_1.supabase.from('ride_ratings').insert({
        ride_id: req.params.id,
        rater_id: req.userId,
        rated_id: driver_id,
        rating,
        review: review ?? null,
        rated_as: 'driver',
    });
    if (ratingErr) {
        res.status(500).json({ error: ratingErr.message });
        return;
    }
    // Recalculate driver average rating
    const { data: allRatings } = await supabase_1.supabase
        .from('ride_ratings')
        .select('rating')
        .eq('rated_id', driver_id)
        .eq('rated_as', 'driver');
    if (allRatings?.length) {
        const avg = allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length;
        await supabase_1.supabase
            .from('driver_profiles')
            .update({ average_rating: parseFloat(avg.toFixed(2)) })
            .eq('user_id', driver_id);
    }
    res.json({ success: true });
});
exports.default = router;
