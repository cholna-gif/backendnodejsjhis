"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/driver/auth/user-data — role + profile for the authenticated driver
router.get('/user-data', auth_1.requireAuth, async (req, res) => {
    const [roleRes, profileRes] = await Promise.all([
        supabase_1.supabase.from('user_roles').select('role').eq('user_id', req.userId).maybeSingle(),
        supabase_1.supabase.from('profiles').select('*').eq('id', req.userId).maybeSingle(),
    ]);
    res.json({
        role: roleRes.data?.role ?? null,
        profile: profileRes.data ?? null,
    });
});
exports.default = router;
