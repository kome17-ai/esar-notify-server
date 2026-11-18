const express = require('express');
const router = express.Router();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const WEB_KEY = process.env.FIREBASE_WEB_API_KEY;
const REQUIRE_AUTH = process.env.AI_REQUIRE_AUTH !== 'false';

router.use(express.json({ limit: '64kb' }));

const tokenCache = new Map();

async function uidFromToken(token) {
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.uid;
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + WEB_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  if (!r.ok) return null;
  const j = await r.json();
  const uid = j.users && j.users[0] && j.users[0].localId;
  if (!uid) return null;
  tokenCache.set(token, { uid, exp: Date.now() + 5 * 60 * 1000 });
  if (tokenCache.size > 2000) tokenCache.clear();
  return uid;
}

const buckets = new Map();
function limited(uid) {
  const now = Date.now();
  let b = buckets.get(uid);
  if (!b || b.reset < now) b = { n: 0, reset: now + 60000 };
  b.n++;
  buckets.set(uid, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n > 20;
}

router.use(async (req, res, next) => {
  if (!GEMINI_KEY) return res.status(500).json({ ok: false, error: 'AI is not configured' });
  let uid = req.ip;
  if (REQUIRE_AUTH) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    try { uid = token && WEB_KEY ? await uidFromToken(token) : null; } catch (e) { uid = null; }
    if (!uid) return res.status(401).json({ ok: false, error: 'Please sign in again' });
  }
  if (limited(uid)) return res.status(429).json({ ok: false, error: 'Slow down a little' });
  next();
});

async function gemini(system, contents, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent',
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: Object.assign({ temperature: 0.7, maxOutputTokens: 600 }, opts)
        })
      }
    );
    if (!r.ok) throw new Error('gemini ' + r.status);
    const j = await r.json();
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || '').join('').trim() : '';
    if (!text) throw new Error('empty');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

const one = t => [{ role: 'user', parts: [{ text: t }] }];
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const langName = l => (l === 'fr' ? 'French' : 'English');
const fail = (res, e) => {
  console.error('[ai]', e && e.message);
  res.status(502).json({ ok: false, error: 'AI is busy, try again' });
};

const BASE = 'You are ESAR AI, a friendly assistant inside ESAR, a social app. Be concise, warm and practical. ' +
  'Never claim to be human. Do not give harmful, hateful or sexual content.';

router.post('/chat', async (req, res) => {
  try {
    const msgs = Array.isArray(req.body.messages) ? req.body.messages.slice(-14) : [];
    const contents = msgs
      .map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: clip(m.text, 2000) }] }))
      .filter(m => m.parts[0].text);
    if (!contents.length || contents[contents.length - 1].role !== 'user')
      return res.status(400).json({ ok: false, error: 'Empty message' });
    const text = await gemini(BASE + ' Reply in ' + langName(req.body.lang) + ' unless the user writes in another language. Keep answers under 150 words unless asked for more.', contents);
    res.json({ ok: true, text });
  } catch (e) { fail(res, e); }
});

router.post('/caption', async (req, res) => {
  try {
    const idea = clip(req.body.text, 600);
    const tone = clip(req.body.tone, 30) || 'friendly';
    const text = await gemini(
      BASE + ' Write ONE social media caption in ' + langName(req.body.lang) + ', tone: ' + tone + '. Max 200 characters, at most 2 emojis, end with up to 3 relevant hashtags. Output only the caption.',
      one(idea ? 'Post idea or draft: ' + idea : 'Write a fun general caption for a photo post.'),
      { temperature: 0.9, maxOutputTokens: 200 }
    );
    res.json({ ok: true, text });
  } catch (e) { fail(res, e); }
});

router.post('/bio', async (req, res) => {
  try {
    const name = clip(req.body.name, 60);
    const about = clip(req.body.text, 300);
    const tone = clip(req.body.tone, 30) || 'friendly';
    const text = await gemini(
      BASE + ' Write ONE profile bio in ' + langName(req.body.lang) + ', first person, tone: ' + tone + '. Max 150 characters, at most 2 emojis. Output only the bio.',
      one('Name: ' + (name || 'unknown') + '\nAbout me / interests: ' + (about || 'not given')),
      { temperature: 0.9, maxOutputTokens: 150 }
    );
    res.json({ ok: true, text });
  } catch (e) { fail(res, e); }
});

router.post('/replies', async (req, res) => {
  try {
    const msgs = Array.isArray(req.body.messages) ? req.body.messages.slice(-8) : [];
    if (!msgs.length) return res.json({ ok: true, items: [] });
    const convo = msgs.map(m => (m.mine ? 'Me: ' : 'Them: ') + clip(m.text, 300)).join('\n');
    const raw = await gemini(
      BASE + ' Suggest exactly 3 short, natural replies (max 8 words each) that "Me" could send next. Match the language of the conversation. Return a JSON array of 3 strings only.',
      one(convo),
      { temperature: 0.8, maxOutputTokens: 150, responseMimeType: 'application/json' }
    );
    let items = [];
    try { items = JSON.parse(raw); } catch (e) {}
    items = (Array.isArray(items) ? items : []).map(s => clip(s, 80)).filter(Boolean).slice(0, 3);
    res.json({ ok: true, items });
  } catch (e) { fail(res, e); }
});

router.post('/translate', async (req, res) => {
  try {
    const t = clip(req.body.text, 2000);
    if (!t) return res.status(400).json({ ok: false, error: 'Nothing to translate' });
    const text = await gemini(
      'You are a translator. Translate the user text into ' + clip(req.body.target, 30) + '. Output only the translation, nothing else.',
      one(t),
      { temperature: 0.2, maxOutputTokens: 800 }
    );
    res.json({ ok: true, text });
  } catch (e) { fail(res, e); }
});

router.post('/moderate', async (req, res) => {
  try {
    const t = clip(req.body.text, 3000);
    if (!t) return res.json({ ok: true, allowed: true, reason: '' });
    const raw = await gemini(
      'You moderate posts and comments for a social app. Allow normal speech, slang, criticism and mild profanity. ' +
      'Block only: threats or incitement of violence, hate against a group, sexual content involving minors, explicit sexual content, doxxing, scams or phishing, self-harm encouragement. ' +
      'Return JSON {"allowed":true|false,"reason":"<max 8 words, empty if allowed>"}.',
      one(t),
      { temperature: 0, maxOutputTokens: 60, responseMimeType: 'application/json' }
    );
    let j = {};
    try { j = JSON.parse(raw); } catch (e) {}
    res.json({ ok: true, allowed: j.allowed !== false, reason: clip(j.reason, 80) });
  } catch (e) { fail(res, e); }
});

module.exports = router;
