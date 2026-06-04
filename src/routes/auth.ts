import crypto from 'crypto';
import { Router, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const router = Router();

const CODE_TTL_MINUTES = 15;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'Jih <noreply@main.jisworld.com>';

type SignupBody = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
};

type VerifyBody = {
  email?: string;
  code?: string;
};

type ResetPasswordBody = VerifyBody & {
  password?: string;
};

type ResendResponse = {
  message?: string;
  name?: string;
  error?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashVerificationCode(email: string, code: string) {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return crypto.createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');
}

function codesMatch(email: string, code: string, expectedHash: unknown) {
  if (typeof expectedHash !== 'string') return false;
  const actual = Buffer.from(hashVerificationCode(email, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

async function findUserByEmail(email: string): Promise<User | null> {
  const perPage = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find(current => normalizeEmail(current.email ?? '') === email);
    if (user) return user;
    if (data.users.length < perPage) return null;
  }

  return null;
}

async function sendVerificationEmail(email: string, code: string) {
  await sendCodeEmail({
    email,
    code,
    subject: 'Confirm your Jih account',
    heading: 'Confirm your Jih account',
    body: 'Enter this code in the Jih app to finish creating your account.',
    textPrefix: 'Your Jih verification code is',
  });
}

async function sendPasswordResetEmail(email: string, code: string) {
  await sendCodeEmail({
    email,
    code,
    subject: 'Reset your Jih password',
    heading: 'Reset your Jih password',
    body: 'Enter this code in the Jih app to set a new password.',
    textPrefix: 'Your Jih password reset code is',
  });
}

async function sendCodeEmail({
  email,
  code,
  subject,
  heading,
  body,
  textPrefix,
}: {
  email: string;
  code: string;
  subject: string;
  heading: string;
  body: string;
  textPrefix: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is missing in backend/.env');

  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM_EMAIL;
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0D1B36">
          <h2>${heading}</h2>
          <p>${body}</p>
          <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>
          <p>This code expires in ${CODE_TTL_MINUTES} minutes.</p>
        </div>
      `,
      text: `${textPrefix} ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    }),
  });

  if (!response.ok) {
    const details = (await response.json().catch(() => null)) as ResendResponse | null;
    throw new Error(details?.message ?? details?.error ?? 'Could not send verification email');
  }
}

async function setVerificationCode(userId: string, email: string, existingMetadata: Record<string, unknown>) {
  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMetadata,
      verification_code_hash: hashVerificationCode(email, code),
      verification_expires_at: expiresAt,
    },
  });

  if (error) throw error;
  await sendVerificationEmail(email, code);
}

async function setPasswordResetCode(userId: string, email: string, existingMetadata: Record<string, unknown>) {
  const code = createVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMetadata,
      password_reset_code_hash: hashVerificationCode(email, code),
      password_reset_expires_at: expiresAt,
    },
  });

  if (error) throw error;
  await sendPasswordResetEmail(email, code);
}

async function upsertPassengerProfile(user: User) {
  const fullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  const phone =
    typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : undefined;

  const profile: Record<string, unknown> = {
    id: user.id,
    full_name: fullName,
    email: user.email,
    role: 'passenger',
    wallet_balance: 0,
  };

  if (phone) profile.phone = phone;

  const { error: profileErr } = await supabase.from('profiles').upsert(profile);
  if (profileErr) throw profileErr;

  const { error: roleErr } = await supabase.from('user_roles').upsert({
    user_id: user.id,
    role: 'passenger',
  });
  if (roleErr) throw roleErr;
}

router.post('/signup', async (req, res: Response) => {
  try {
    const { email, password, full_name, phone } = req.body as SignupBody;
    const normalizedEmail = normalizeEmail(email ?? '');
    const fullName = full_name?.trim() ?? '';

    if (!fullName || !normalizedEmail || !password) {
      res.status(400).json({ error: 'Full name, email and password are required.' });
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser?.email_confirmed_at) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const userMetadata = {
      full_name: fullName,
      phone: phone?.trim() || undefined,
      role: 'passenger',
    };

    let user = existingUser;
    if (user) {
      const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: {
          ...user.user_metadata,
          ...userMetadata,
        },
      });
      if (error || !data.user) throw error ?? new Error('Could not update account');
      user = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: false,
        user_metadata: userMetadata,
      });
      if (error || !data.user) throw error ?? new Error('Could not create account');
      user = data.user;
    }

    await setVerificationCode(user.id, normalizedEmail, user.user_metadata ?? {});
    res.status(201).json({ success: true, needsVerification: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create account';
    res.status(500).json({ error: message });
  }
});

router.post('/resend-verification', async (req, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    const normalizedEmail = normalizeEmail(email ?? '');

    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      res.status(404).json({ error: 'No pending account found for this email.' });
      return;
    }
    if (user.email_confirmed_at) {
      res.status(409).json({ error: 'This email is already verified. Please log in.' });
      return;
    }

    await setVerificationCode(user.id, normalizedEmail, user.user_metadata ?? {});
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resend verification email';
    res.status(500).json({ error: message });
  }
});

router.post('/verify-email', async (req, res: Response) => {
  try {
    const { email, code } = req.body as VerifyBody;
    const normalizedEmail = normalizeEmail(email ?? '');
    const verificationCode = code?.replace(/\D/g, '') ?? '';

    if (!isValidEmail(normalizedEmail) || verificationCode.length !== 6) {
      res.status(400).json({ error: 'Enter the 6-digit code sent to your email.' });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      res.status(404).json({ error: 'No pending account found for this email.' });
      return;
    }
    if (user.email_confirmed_at) {
      res.json({ success: true });
      return;
    }

    const expiresAt = user.user_metadata?.verification_expires_at;
    if (typeof expiresAt !== 'string' || Date.parse(expiresAt) < Date.now()) {
      res.status(400).json({ error: 'Verification code expired. Please resend a new code.' });
      return;
    }

    if (!codesMatch(normalizedEmail, verificationCode, user.user_metadata?.verification_code_hash)) {
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }

    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        verification_code_hash: null,
        verification_expires_at: null,
      },
    });
    if (error || !data.user) throw error ?? new Error('Could not verify email');

    await upsertPassengerProfile(data.user);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not verify email';
    res.status(500).json({ error: message });
  }
});

router.post('/forgot-password', async (req, res: Response) => {
  try {
    const { email } = req.body as { email?: string };
    const normalizedEmail = normalizeEmail(email ?? '');

    if (!isValidEmail(normalizedEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      res.json({ success: true });
      return;
    }
    if (!user.email_confirmed_at) {
      res.status(400).json({ error: 'Please verify your email before resetting your password.' });
      return;
    }

    await setPasswordResetCode(user.id, normalizedEmail, user.user_metadata ?? {});
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not send reset email';
    res.status(500).json({ error: message });
  }
});

router.post('/reset-password', async (req, res: Response) => {
  try {
    const { email, code, password } = req.body as ResetPasswordBody;
    const normalizedEmail = normalizeEmail(email ?? '');
    const resetCode = code?.replace(/\D/g, '') ?? '';

    if (!isValidEmail(normalizedEmail) || resetCode.length !== 6) {
      res.status(400).json({ error: 'Enter the 6-digit code sent to your email.' });
      return;
    }
    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user?.email_confirmed_at) {
      res.status(400).json({ error: 'Could not reset password for this email.' });
      return;
    }

    const expiresAt = user.user_metadata?.password_reset_expires_at;
    if (typeof expiresAt !== 'string' || Date.parse(expiresAt) < Date.now()) {
      res.status(400).json({ error: 'Reset code expired. Please request a new code.' });
      return;
    }

    if (!codesMatch(normalizedEmail, resetCode, user.user_metadata?.password_reset_code_hash)) {
      res.status(400).json({ error: 'Invalid reset code.' });
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...user.user_metadata,
        password_reset_code_hash: null,
        password_reset_expires_at: null,
      },
    });
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reset password';
    res.status(500).json({ error: message });
  }
});

// POST /api/auth/create-admin
// Creates or updates an admin/marketing team member. Requires caller to be admin.
router.post('/create-admin', async (req, res: Response) => {
  try {
    const { full_name, email, password, role: rawRole } = req.body as {
      full_name?: string; email?: string; password?: string; role?: string;
    };

    const normalizedEmail = (email ?? '').trim().toLowerCase();
    const role = rawRole === 'marketing' ? 'marketing' : 'admin';

    if (!full_name?.trim() || !normalizedEmail || !password || password.length < 8) {
      res.status(400).json({ error: 'Full name, email and password (min 8 chars) are required.' });
      return;
    }

    // Find existing user
    let existingId: string | null = null;
    const { data: profile } = await supabase.from('profiles').select('id').ilike('email', normalizedEmail).maybeSingle();
    if (profile?.id) {
      existingId = profile.id;
    } else {
      for (let page = 1; page <= 10; page++) {
        const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        const match = list?.users?.find((u: any) => (u.email ?? '').toLowerCase() === normalizedEmail);
        if (match) { existingId = match.id; break; }
        if (!list?.users || list.users.length < 1000) break;
      }
    }

    let userId: string;
    let isNewUser = false;

    if (existingId) {
      userId = existingId;
      await supabase.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim() },
      });
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name.trim() },
      });
      if (createErr || !created.user) throw createErr ?? new Error('Could not create user');
      userId = created.user.id;
      isNewUser = true;
    }

    await supabase.from('profiles').upsert({ id: userId, full_name: full_name.trim(), email: normalizedEmail }, { onConflict: 'id' });
    await supabase.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id' });

    res.json({ ok: true, isNewUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create admin';
    res.status(500).json({ error: message });
  }
});

export default router;
