"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const normalizeVehicle = (v) => (v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
// GET /api/driver/rides/pending — filtered pending rides for this driver's vehicle
// Must be declared BEFORE /:rideId
router.get('/pending', auth_1.requireAuth, async (req, res) => {
    const { data: dp } = await supabase_1.supabase
        .from('driver_profiles')
        .select('vehicle_type')
        .eq('user_id', req.userId)
        .maybeSingle();
    const { data } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(25);
    const normalized = normalizeVehicle(dp?.vehicle_type);
    const matching = (data ?? []).filter(r => normalizeVehicle(r.vehicle_type) === normalized);
    matching.sort((a, b) => {
        const aP = a.preferred_driver_id === req.userId ? 1 : 0;
        const bP = b.preferred_driver_id === req.userId ? 1 : 0;
        return bP - aP;
    });
    res.json(matching);
});
// GET /api/driver/rides/group/:groupId — all rides in a share group
router.get('/group/:groupId', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('shared_ride_group', req.params.groupId);
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data ?? []);
});
// GET /api/driver/rides/:rideId — single ride
router.get('/:rideId', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('rides')
        .select('*')
        .eq('id', req.params.rideId)
        .single();
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(data ?? null);
});
// POST /api/driver/rides/:rideId/accept
router.post('/:rideId/accept', auth_1.requireAuth, async (req, res) => {
    const { passengerId, isFullDay, offeredFare } = req.body;
    const update = { driver_id: req.userId, status: 'matched' };
    if (isFullDay) {
        update.agreed_price = offeredFare;
        update.negotiation_status = 'agreed';
    }
    const { error } = await supabase_1.supabase
        .from('rides').update(update).eq('id', req.params.rideId).eq('status', 'pending');
    if (error)
        return res.status(500).json({ error: error.message });
    await supabase_1.supabase.from('driver_profiles').update({ has_active_ride: true }).eq('user_id', req.userId);
    await supabase_1.supabase.from('notifications').insert({
        user_id: passengerId, title: 'Driver Found!',
        message: 'Your driver is on the way!', type: 'ride_matched',
    });
    res.json({ success: true });
});
// POST /api/driver/rides/:rideId/accept-share
router.post('/:rideId/accept-share', auth_1.requireAuth, async (req, res) => {
    const { currentGroupId, currentRemainingSeats, newGroupSize } = req.body;
    const seatsNeeded = newGroupSize ?? 1;
    const newRemaining = Math.max(currentRemainingSeats - seatsNeeded, 0);
    const { data: ride } = await supabase_1.supabase.from('rides').select('passenger_id').eq('id', req.params.rideId).single();
    const { error } = await supabase_1.supabase.from('rides').update({
        driver_id: req.userId, status: 'matched',
        shared_ride_group: currentGroupId, remaining_seats: newRemaining,
    }).eq('id', req.params.rideId);
    if (error)
        return res.status(500).json({ error: error.message });
    await supabase_1.supabase.from('rides').update({ remaining_seats: newRemaining }).eq('shared_ride_group', currentGroupId);
    if (ride) {
        await supabase_1.supabase.from('notifications').insert({
            user_id: ride.passenger_id, title: 'Driver Found!',
            message: 'A driver on a share ride has accepted your request!', type: 'ride_matched',
        });
    }
    res.json({ success: true });
});
// PATCH /api/driver/rides/:rideId/arrived
router.patch('/:rideId/arrived', auth_1.requireAuth, async (req, res) => {
    const { passengerId } = req.body;
    await supabase_1.supabase.from('rides').update({ status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', req.params.rideId);
    await supabase_1.supabase.from('notifications').insert({
        user_id: passengerId, title: 'Driver Arrived',
        message: 'Your driver has arrived at the pickup location!', type: 'driver_arrived',
    });
    res.json({ success: true });
});
// PATCH /api/driver/rides/:rideId/start
router.patch('/:rideId/start', auth_1.requireAuth, async (req, res) => {
    const { passengerId } = req.body;
    await supabase_1.supabase.from('rides').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', req.params.rideId);
    await supabase_1.supabase.from('notifications').insert({
        user_id: passengerId, title: 'Ride Started',
        message: 'Your ride has started. Enjoy!', type: 'ride_started',
    });
    res.json({ success: true });
});
// PATCH /api/driver/rides/:rideId/complete
router.patch('/:rideId/complete', auth_1.requireAuth, async (req, res) => {
    const { data: ride } = await supabase_1.supabase.from('rides').select('*').eq('id', req.params.rideId).single();
    if (!ride)
        return res.status(404).json({ error: 'Ride not found' });
    const r = ride;
    const isFullDay = r.booking_type === 'full_day';
    const fare = isFullDay ? (r.agreed_price ?? r.offered_fare ?? 0) : (r.estimated_fare ?? 0);
    const earnings = parseFloat((fare * 0.9).toFixed(2));
    const { error } = await supabase_1.supabase.from('rides').update({
        status: 'completed', completed_at: new Date().toISOString(),
        final_fare: fare, driver_earnings: earnings,
    }).eq('id', req.params.rideId).in('status', ['in_progress']);
    if (error)
        return res.status(409).json({ error: 'Ride already cancelled by passenger.' });
    await supabase_1.supabase.from('notifications').insert({
        user_id: r.passenger_id, title: 'Trip Completed',
        message: 'Your trip has been completed. Thank you for riding with Jih!',
        type: 'ride_complete', ride_id: req.params.rideId,
    });
    // Credit driver earnings
    const { data: dp } = await supabase_1.supabase.from('driver_profiles').select('total_earnings,total_rides,wallet_balance').eq('user_id', req.userId).single();
    if (dp) {
        await supabase_1.supabase.from('driver_profiles').update({
            total_earnings: (dp.total_earnings || 0) + earnings,
            total_rides: (dp.total_rides || 0) + 1,
            wallet_balance: (dp.wallet_balance || 0) + earnings,
            has_active_ride: false,
        }).eq('user_id', req.userId);
    }
    res.json({ earnings });
});
// PATCH /api/driver/rides/:rideId/dropoff — drop off one passenger in share ride
router.patch('/:rideId/dropoff', auth_1.requireAuth, async (req, res) => {
    const { data: ride } = await supabase_1.supabase.from('rides').select('*').eq('id', req.params.rideId).single();
    if (!ride)
        return res.status(404).json({ error: 'Ride not found' });
    const r = ride;
    const fare = r.estimated_fare ?? 0;
    const earnings = parseFloat((fare * 0.9).toFixed(2));
    const { error } = await supabase_1.supabase.from('rides').update({
        status: 'completed', completed_at: new Date().toISOString(),
        final_fare: fare, driver_earnings: earnings,
    }).eq('id', req.params.rideId).in('status', ['in_progress']);
    if (error)
        return res.status(409).json({ error: 'Ride already cancelled by passenger.' });
    await supabase_1.supabase.from('notifications').insert({
        user_id: r.passenger_id, title: 'Trip Completed',
        message: 'Your trip has been completed. Thank you for riding with Jih!',
        type: 'ride_complete', ride_id: req.params.rideId,
    });
    res.json({ earnings });
});
// PATCH /api/driver/rides/:rideId/cancel
router.patch('/:rideId/cancel', auth_1.requireAuth, async (req, res) => {
    const { error } = await supabase_1.supabase.rpc('handle_driver_cancellation', { p_ride_id: req.params.rideId });
    if (error)
        return res.status(500).json({ error: error.message });
    res.json({ success: true });
});
// PATCH /api/driver/rides/:rideId/rate-passenger
router.patch('/:rideId/rate-passenger', auth_1.requireAuth, async (req, res) => {
    const { rating, review } = req.body;
    const { data: ride } = await supabase_1.supabase.from('rides').select('passenger_id').eq('id', req.params.rideId).single();
    if (!ride)
        return res.status(404).json({ error: 'Ride not found' });
    await supabase_1.supabase.from('ride_ratings').insert({
        ride_id: req.params.rideId, rater_id: req.userId,
        rated_id: ride.passenger_id, rating,
        review: review || null, rated_as: 'passenger',
    });
    await supabase_1.supabase.from('rides').update({ passenger_rating: rating, passenger_review: review || null }).eq('id', req.params.rideId);
    res.json({ success: true });
});
exports.default = router;
