"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/support — submit a support ticket
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { subject, category, message } = req.body;
    const { data, error } = await supabase_1.supabase
        .from('support_tickets')
        .insert({
        user_id: req.userId,
        subject,
        category,
        message,
        status: 'open',
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
