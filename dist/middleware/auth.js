"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }
    const token = authHeader.slice(7);
    // Option 1: full signature verification (most secure)
    if (JWT_SECRET) {
        try {
            const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            req.userId = payload.sub;
            return next();
        }
        catch {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }
    }
    // Option 2: decode without signature check — checks structure, audience, expiry.
    // No network call, no timeout. Add SUPABASE_JWT_SECRET to .env for full security.
    try {
        const payload = jsonwebtoken_1.default.decode(token);
        if (!payload?.sub || typeof payload.exp !== 'number' || payload.aud !== 'authenticated') {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }
        if (payload.exp < Math.floor(Date.now() / 1000)) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }
        req.userId = payload.sub;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
