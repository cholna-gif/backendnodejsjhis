import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL must be set in .env');
}
if (!serviceRoleKey || serviceRoleKey === 'your_service_role_key_here') {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set in .env (get it from Supabase Dashboard → Settings → API Keys → Secret keys)');
}

// Service role client — bypasses RLS, used only on the server for DB operations
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon client — used only to validate user JWTs (safe: anon key is not secret)
export const supabaseAnon = createClient(supabaseUrl, anonKey || serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
