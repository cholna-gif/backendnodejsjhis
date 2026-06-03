"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const express_1 = require("express");
const supabase_1 = require("../lib/supabase");
const router = (0, express_1.Router)();
const CODE_TTL_MINUTES = 15;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1000;
const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'Jih <noreply@main.jisworld.com>';
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function createVerificationCode() {
    return crypto_1.default.randomInt(100000, 1000000).toString();
}
function hashVerificationCode(email, code) {
    const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    return crypto_1.default.createHash('sha256').update(`${email}:${code}:${secret}`).digest('hex');
}
function codesMatch(email, code, expectedHash) {
    if (typeof expectedHash !== 'string')
        return false;
    const actual = Buffer.from(hashVerificationCode(email, code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && crypto_1.default.timingSafeEqual(actual, expected);
}
async function findUserByEmail(email) {
    const perPage = 1000;
    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await supabase_1.supabase.auth.admin.listUsers({ page, perPage });
        if (error)
            throw error;
        const user = data.users.find(current => normalizeEmail(current.email ?? '') === email);
        if (user)
            return user;
        if (data.users.length < perPage)
            return null;
    }
    return null;
}
async function sendVerificationEmail(email, code) {
    await sendCodeEmail({
        email,
        code,
        subject: 'Confirm your Jih account',
        heading: 'Confirm your Jih account',
        body: 'Enter this code in the Jih app to finish creating your account.',
        textPrefix: 'Your Jih verification code is',
    });
}
async function sendPasswordResetEmail(email, code) {
    await sendCodeEmail({
        email,
        code,
        subject: 'Reset your Jih password',
        heading: 'Reset your Jih password',
        body: 'Enter this code in the Jih app to set a new password.',
        textPrefix: 'Your Jih password reset code is',
    });
}
async function sendCodeEmail({ email, code, subject, heading, body, textPrefix, }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey)
        throw new Error('RESEND_API_KEY is missing in backend/.env');
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
        const details = (await response.json().catch(() => null));
        throw new Error(details?.message ?? details?.error ?? 'Could not send verification email');
    }
}
async function setVerificationCode(userId, email, existingMetadata) {
    const code = createVerificationCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await supabase_1.supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
            ...existingMetadata,
            verification_code_hash: hashVerificationCode(email, code),
            verification_expires_at: expiresAt,
        },
    });
    if (error)
        throw error;
    await sendVerificationEmail(email, code);
}
async function setPasswordResetCode(userId, email, existingMetadata) {
    const code = createVerificationCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error } = await supabase_1.supabase.auth.admin.updateUserById(userId, {
        user_metadata: {
            ...existingMetadata,
            password_reset_code_hash: hashVerificationCode(email, code),
            password_reset_expires_at: expiresAt,
        },
    });
    if (error)
        throw error;
    await sendPasswordResetEmail(email, code);
}
async function upsertPassengerProfile(user) {
    const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
    const phone = typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : undefined;
    const profile = {
        id: user.id,
        full_name: fullName,
        email: user.email,
        role: 'passenger',
        wallet_balance: 0,
    };
    if (phone)
        profile.phone = phone;
    const { error: profileErr } = await supabase_1.supabase.from('profiles').upsert(profile);
    if (profileErr)
        throw profileErr;
    const { error: roleErr } = await supabase_1.supabase.from('user_roles').upsert({
        user_id: user.id,
        role: 'passenger',
    });
    if (roleErr)
        throw roleErr;
}
router.post('/signup', async (req, res) => {
    try {
        const { email, password, full_name, phone } = req.body;
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
            const { data, error } = await supabase_1.supabase.auth.admin.updateUserById(user.id, {
                password,
                user_metadata: {
                    ...user.user_metadata,
                    ...userMetadata,
                },
            });
            if (error || !data.user)
                throw error ?? new Error('Could not update account');
            user = data.user;
        }
        else {
            const { data, error } = await supabase_1.supabase.auth.admin.createUser({
                email: normalizedEmail,
                password,
                email_confirm: false,
                user_metadata: userMetadata,
            });
            if (error || !data.user)
                throw error ?? new Error('Could not create account');
            user = data.user;
        }
        await setVerificationCode(user.id, normalizedEmail, user.user_metadata ?? {});
        res.status(201).json({ success: true, needsVerification: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not create account';
        res.status(500).json({ error: message });
    }
});
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not resend verification email';
        res.status(500).json({ error: message });
    }
});
router.post('/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
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
        const { data, error } = await supabase_1.supabase.auth.admin.updateUserById(user.id, {
            email_confirm: true,
            user_metadata: {
                ...user.user_metadata,
                verification_code_hash: null,
                verification_expires_at: null,
            },
        });
        if (error || !data.user)
            throw error ?? new Error('Could not verify email');
        await upsertPassengerProfile(data.user);
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not verify email';
        res.status(500).json({ error: message });
    }
});
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not send reset email';
        res.status(500).json({ error: message });
    }
});
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, password } = req.body;
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
        const { error } = await supabase_1.supabase.auth.admin.updateUserById(user.id, {
            password,
            user_metadata: {
                ...user.user_metadata,
                password_reset_code_hash: null,
                password_reset_expires_at: null,
            },
        });
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not reset password';
        res.status(500).json({ error: message });
    }
});
exports.default = router;
