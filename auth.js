// ESAR account helpers: smart sign-in errors + password reset with an emailed code.
//
// Mount in your main server file, after the /ai line:
//   app.use('/auth', require('./auth'));
//
// Needs the firebase-admin package. If your server already sends push notifications it is
// almost certainly installed and initialised. If not, set FIREBASE_SERVICE_ACCOUNT on Render to
// the full service-account JSON (Firebase console > Project settings > Service accounts).
// The 6-digit email code reuses your existing /send-otp and /verify-otp routes.
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
router.use(express.json({ limit: '20kb' }));

const SELF = (process.env.SELF_URL || 'https://esar-notify-server.onrender.com').replace(/\/$/, '');
let adminLib = null;
try { adminLib = require('firebase-admin'); } catch (e) { console.error('[auth] firebase-admin is not installed'); }

function getAdmin() {
  if (!adminLib) throw new Error('firebase-admin missing');
  if (!adminLib.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_KEY;
    if (!raw) throw new Error('firebase-admin is not initialised');
    adminLib.initializeApp({ credential: adminLib.credential.cert(JSON.parse(raw)) });
  }
  return adminLib;
}

/* ---------- tiny in-memory rate limits ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const a = (hits.get(key) || []).filter(t => now - t < windowMs);
  a.push(now);
  hits.set(key, a);
  return a.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some(t => now - t < 3600000)) hits.delete(k); }, 600000).unref();
const ipOf = req => String((req.headers['x-forwarded-for'] || req.ip || '')).split(',')[0].trim() || 'x';
const cleanEmail = v => String(v || '').trim().toLowerCase().slice(0, 200);
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const err = (res, status, code, message) => res.status(status).json({ ok: false, code, error: message });

async function findUser(email) {
  try { return await getAdmin().auth().getUserByEmail(email); }
  catch (e) { if (e && e.code === 'auth/user-not-found') return null; throw e; }
}
const providersOf = u => (u.providerData || []).map(p => p.providerId);
const hasPassword = u => providersOf(u).includes('password');

router.get('/health', (req, res) => {
  let admin = false;
  try { getAdmin(); admin = true; } catch (e) {}
  res.json({ ok: true, admin });
});

// Used by the login screen to say "wrong password" or "no account", not just "check your network".
router.post('/account-status', async (req, res) => {
  const email = cleanEmail(req.body && req.body.email);
  if (!emailOk(email)) return err(res, 400, 'bad_email', 'Invalid email');
  if (limited('st:' + ipOf(req), 12, 60000)) return err(res, 429, 'rate_limited', 'Too many requests');
  try {
    const u = await findUser(email);
    if (!u) return res.json({ ok: true, exists: false });
    const p = providersOf(u);
    res.json({ ok: true, exists: true, hasPassword: p.includes('password'), google: p.includes('google.com'), disabled: !!u.disabled });
  } catch (e) {
    console.error('[auth] status', e.message);
    err(res, 503, 'unavailable', 'Account check is not available');
  }
});

/* ---------- password reset ---------- */
const sendLog = new Map();   // email -> [timestamps]
const wrongLog = new Map();  // email -> { n, until }
const tokens = new Map();    // token -> { email, uid, exp }
setInterval(() => { const now = Date.now(); for (const [t, v] of tokens) if (v.exp < now) tokens.delete(t); }, 60000).unref();

async function selfPost(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(SELF + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, json: j };
  } finally { clearTimeout(timer); }
}

router.post('/reset/send', async (req, res) => {
  const email = cleanEmail(req.body && req.body.email);
  if (!emailOk(email)) return err(res, 400, 'bad_email', 'Enter a valid email');
  if (limited('rs:' + ipOf(req), 10, 3600000)) return err(res, 429, 'rate_limited', 'Too many requests, try again later');
  const now = Date.now();
  const log = (sendLog.get(email) || []).filter(t => now - t < 3600000);
  if (log.length && now - log[log.length - 1] < 40000) return err(res, 429, 'cooldown', 'Please wait a moment before asking for another code');
  if (log.length >= 5) return err(res, 429, 'rate_limited', 'Too many codes requested, try again in an hour');
  let user;
  try { user = await findUser(email); }
  catch (e) { console.error('[auth] reset/send', e.message); return err(res, 503, 'unavailable', 'Password reset is not available right now'); }
  if (!user) return err(res, 404, 'no_account', 'No account found with this email');
  if (user.disabled) return err(res, 403, 'disabled', 'This account has been disabled');
  if (!hasPassword(user)) return err(res, 409, 'google_only', 'This account uses Google sign-in');
  try {
    const r = await selfPost('/send-otp', { email });
    if (!r.ok) { console.error('[auth] send-otp ->', r.status, JSON.stringify(r.json).slice(0, 200)); return err(res, 502, 'send_failed', 'Could not send the code'); }
  } catch (e) { console.error('[auth] send-otp failed', e.message); return err(res, 502, 'send_failed', 'Could not send the code'); }
  log.push(now); sendLog.set(email, log);
  wrongLog.delete(email);
  res.json({ ok: true });
});

router.post('/reset/verify', async (req, res) => {
  const email = cleanEmail(req.body && req.body.email);
  const pin = String((req.body && req.body.pin) || '').replace(/\D/g, '').slice(0, 6);
  if (!emailOk(email) || pin.length !== 6) return err(res, 400, 'bad_request', 'Enter the 6-digit code');
  if (limited('rv:' + ipOf(req), 30, 3600000)) return err(res, 429, 'rate_limited', 'Too many attempts');
  const w = wrongLog.get(email) || { n: 0, until: 0 };
  if (w.until > Date.now()) return err(res, 429, 'locked', 'Too many wrong codes. Request a new code in a few minutes');
  let user;
  try { user = await findUser(email); } catch (e) { return err(res, 503, 'unavailable', 'Password reset is not available right now'); }
  if (!user) return err(res, 404, 'no_account', 'No account found with this email');
  let r;
  try { r = await selfPost('/verify-otp', { email, pin }); }
  catch (e) { return err(res, 502, 'verify_failed', 'Could not verify the code'); }
  const j = r.json || {};
  const good = j.verified === true || j.valid === true || j.success === true || (j.ok === true && j.verified !== false) || j.status === 'verified';
  if (!good) {
    const text = String(j.error || j.message || '').toLowerCase();
    if (text.includes('expire')) return err(res, 400, 'expired', 'This code has expired. Request a new one');
    w.n += 1;
    if (w.n >= 5) { w.until = Date.now() + 10 * 60000; w.n = 0; }
    wrongLog.set(email, w);
    return res.status(400).json({ ok: false, code: 'wrong_code', error: 'That code is not right', attemptsLeft: Math.max(0, 5 - w.n) });
  }
  wrongLog.delete(email);
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { email, uid: user.uid, exp: Date.now() + 10 * 60000 });
  res.json({ ok: true, resetToken: token });
});

const strong = p => typeof p === 'string' && p.length >= 8 && p.length <= 128 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);

router.post('/reset/confirm', async (req, res) => {
  const email = cleanEmail(req.body && req.body.email);
  const token = String((req.body && req.body.resetToken) || '');
  const password = (req.body && req.body.password) || '';
  if (limited('rc:' + ipOf(req), 20, 3600000)) return err(res, 429, 'rate_limited', 'Too many attempts');
  const t = tokens.get(token);
  if (!t || t.email !== email || t.exp < Date.now()) return err(res, 400, 'token_expired', 'This reset session expired. Please start again');
  if (!strong(password)) return err(res, 400, 'weak_password', 'Password must be strong (8+ characters with upper and lower case letters, a number and a symbol)');
  try {
    const a = getAdmin().auth();
    await a.updateUser(t.uid, { password });
    try { await a.revokeRefreshTokens(t.uid); } catch (e) {}
    tokens.delete(token);
    res.json({ ok: true });
  } catch (e) {
    console.error('[auth] confirm', e.message);
    err(res, 503, 'unavailable', 'Could not update the password right now');
  }
});

module.exports = router;
