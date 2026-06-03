"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAnon = exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl) {
    throw new Error('SUPABASE_URL must be set in .env');
}
if (!serviceRoleKey || serviceRoleKey === 'your_service_role_key_here') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set in .env (get it from Supabase Dashboard → Settings → API Keys → Secret keys)');
}
// Service role client — bypasses RLS, used only on the server for DB operations
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});
// Anon client — used only to validate user JWTs (safe: anon key is not secret)
exports.supabaseAnon = (0, supabase_js_1.createClient)(supabaseUrl, anonKey || serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});
