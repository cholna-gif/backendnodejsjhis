"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/chat/:rideId — load chat history
router.get('/:rideId', auth_1.requireAuth, async (req, res) => {
    const { data, error } = await supabase_1.supabase
        .from('chat_messages')
        .select('*')
        .eq('ride_id', req.params.rideId)
        .order('created_at', { ascending: true });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data ?? []);
});
// POST /api/chat/:rideId — send a message
router.post('/:rideId', auth_1.requireAuth, async (req, res) => {
    const { message, sender_role } = req.body;
    const { data, error } = await supabase_1.supabase
        .from('chat_messages')
        .insert({
        ride_id: req.params.rideId,
        sender_id: req.userId,
        sender_role,
        message,
        created_at: new Date().toISOString(),
    })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
exports.default = router;
