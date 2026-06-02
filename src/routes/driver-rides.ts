import { Router, Response } from 'express';
import { supabase } from '../lib/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const normalizeVehicle = (v?: string | null) =>
  (v ?? '').toLowerCase().replace(/[\s_-]+/g, '');

// GET /api/driver/rides/pending — filtered pending rides for this driver's vehicle
// Must be declared BEFORE /:rideId
router.get('/pending', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data: dp } = await supabase
    .from('driver_profiles')
    .select('vehicle_type')
    .eq('user_id', req.userId!)
    .maybeSingle();

  const { data } = await supabase
    .from('rides')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25);

  const normalized = normalizeVehicle((dp as any)?.vehicle_type);
  const matching = ((data ?? []) as any[]).filter(
    r => normalizeVehicle(r.vehicle_type) === normalized
  );
  matching.sort((a: any, b: any) => {
    const aP = a.preferred_driver_id === req.userId ? 1 : 0;
    const bP = b.preferred_driver_id === req.userId ? 1 : 0;
    return bP - aP;
  });

  res.json(matching);
});

// GET /api/driver/rides/group/:groupId — all rides in a share group
router.get('/group/:groupId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('shared_ride_group', req.params.groupId);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/driver/rides/:rideId — single ride
router.get('/:rideId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('id', req.params.rideId)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? null);
});

// POST /api/driver/rides/:rideId/accept
router.post('/:rideId/accept', requireAuth, async (req: AuthRequest, res: Response) => {
  const { passengerId, isFullDay, offeredFare } = req.body as {
    passengerId: string;
    isFullDay?: boolean;
    offeredFare?: number;
  };
  const update: Record<string, unknown> = { driver_id: req.userId!, status: 'matched' };
  if (isFullDay) { update.agreed_price = offeredFare; update.negotiation_status = 'agreed'; }

  const { error } = await supabase
    .from('rides').update(update).eq('id', req.params.rideId).eq('status', 'pending');
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('driver_profiles').update({ has_active_ride: true }).eq('user_id', req.userId!);
  await supabase.from('notifications').insert({
    user_id: passengerId, title: 'Driver Found!',
    message: 'Your driver is on the way!', type: 'ride_matched',
  });
  res.json({ success: true });
});

// POST /api/driver/rides/:rideId/accept-share
router.post('/:rideId/accept-share', requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentGroupId, currentRemainingSeats, newGroupSize } = req.body as {
    currentGroupId: string;
    currentRemainingSeats: number;
    newGroupSize: number;
  };
  const seatsNeeded  = newGroupSize ?? 1;
  const newRemaining = Math.max(currentRemainingSeats - seatsNeeded, 0);

  const { data: ride } = await supabase.from('rides').select('passenger_id').eq('id', req.params.rideId).single();
  const { error } = await supabase.from('rides').update({
    driver_id: req.userId!, status: 'matched',
    shared_ride_group: currentGroupId, remaining_seats: newRemaining,
  }).eq('id', req.params.rideId);
  if (error) return res.status(500).json({ error: error.message });

  await supabase.from('rides').update({ remaining_seats: newRemaining }).eq('shared_ride_group', currentGroupId);
  if (ride) {
    await supabase.from('notifications').insert({
      user_id: (ride as any).passenger_id, title: 'Driver Found!',
      message: 'A driver on a share ride has accepted your request!', type: 'ride_matched',
    });
  }
  res.json({ success: true });
});

// PATCH /api/driver/rides/:rideId/arrived
router.patch('/:rideId/arrived', requireAuth, async (req: AuthRequest, res: Response) => {
  const { passengerId } = req.body as { passengerId: string };
  await supabase.from('rides').update({ status: 'arrived', arrived_at: new Date().toISOString() }).eq('id', req.params.rideId);
  await supabase.from('notifications').insert({
    user_id: passengerId, title: 'Driver Arrived',
    message: 'Your driver has arrived at the pickup location!', type: 'driver_arrived',
  });
  res.json({ success: true });
});

// PATCH /api/driver/rides/:rideId/start
router.patch('/:rideId/start', requireAuth, async (req: AuthRequest, res: Response) => {
  const { passengerId } = req.body as { passengerId: string };
  await supabase.from('rides').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', req.params.rideId);
  await supabase.from('notifications').insert({
    user_id: passengerId, title: 'Ride Started',
    message: 'Your ride has started. Enjoy!', type: 'ride_started',
  });
  res.json({ success: true });
});

// PATCH /api/driver/rides/:rideId/complete
router.patch('/:rideId/complete', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data: ride } = await supabase.from('rides').select('*').eq('id', req.params.rideId).single();
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const r = ride as any;
  const isFullDay = r.booking_type === 'full_day';
  const fare      = isFullDay ? (r.agreed_price ?? r.offered_fare ?? 0) : (r.estimated_fare ?? 0);
  const earnings  = parseFloat((fare * 0.9).toFixed(2));

  const { error } = await supabase.from('rides').update({
    status: 'completed', completed_at: new Date().toISOString(),
    final_fare: fare, driver_earnings: earnings,
  }).eq('id', req.params.rideId).in('status', ['in_progress']);
  if (error) return res.status(409).json({ error: 'Ride already cancelled by passenger.' });

  await supabase.from('notifications').insert({
    user_id: r.passenger_id, title: 'Trip Completed',
    message: 'Your trip has been completed. Thank you for riding with Jih!',
    type: 'ride_complete', ride_id: req.params.rideId,
  });

  // Credit driver earnings
  const { data: dp } = await supabase.from('driver_profiles').select('total_earnings,total_rides,wallet_balance').eq('user_id', req.userId!).single();
  if (dp) {
    await supabase.from('driver_profiles').update({
      total_earnings:  ((dp as any).total_earnings  || 0) + earnings,
      total_rides:     ((dp as any).total_rides     || 0) + 1,
      wallet_balance:  ((dp as any).wallet_balance  || 0) + earnings,
      has_active_ride: false,
    }).eq('user_id', req.userId!);
  }

  res.json({ earnings });
});

// PATCH /api/driver/rides/:rideId/dropoff — drop off one passenger in share ride
router.patch('/:rideId/dropoff', requireAuth, async (req: AuthRequest, res: Response) => {
  const { data: ride } = await supabase.from('rides').select('*').eq('id', req.params.rideId).single();
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  const r        = ride as any;
  const fare     = r.estimated_fare ?? 0;
  const earnings = parseFloat((fare * 0.9).toFixed(2));

  const { error } = await supabase.from('rides').update({
    status: 'completed', completed_at: new Date().toISOString(),
    final_fare: fare, driver_earnings: earnings,
  }).eq('id', req.params.rideId).in('status', ['in_progress']);
  if (error) return res.status(409).json({ error: 'Ride already cancelled by passenger.' });

  await supabase.from('notifications').insert({
    user_id: r.passenger_id, title: 'Trip Completed',
    message: 'Your trip has been completed. Thank you for riding with Jih!',
    type: 'ride_complete', ride_id: req.params.rideId,
  });

  res.json({ earnings });
});

// PATCH /api/driver/rides/:rideId/cancel
router.patch('/:rideId/cancel', requireAuth, async (req: AuthRequest, res: Response) => {
  const { error } = await (supabase.rpc as any)('handle_driver_cancellation', { p_ride_id: req.params.rideId });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// PATCH /api/driver/rides/:rideId/rate-passenger
router.patch('/:rideId/rate-passenger', requireAuth, async (req: AuthRequest, res: Response) => {
  const { rating, review } = req.body as { rating: number; review?: string };
  const { data: ride } = await supabase.from('rides').select('passenger_id').eq('id', req.params.rideId).single();
  if (!ride) return res.status(404).json({ error: 'Ride not found' });

  await supabase.from('ride_ratings').insert({
    ride_id: req.params.rideId, rater_id: req.userId!,
    rated_id: (ride as any).passenger_id, rating,
    review: review || null, rated_as: 'passenger',
  });
  await supabase.from('rides').update({ passenger_rating: rating, passenger_review: review || null }).eq('id', req.params.rideId);
  res.json({ success: true });
});

export default router;
