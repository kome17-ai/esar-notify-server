const express = require('express');
const router = express.Router();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODELS = Array.from(new Set(
  [process.env.GEMINI_MODEL || 'gemini-3.5-flash']
    .concat((process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-flash,gemini-2.0-flash').split(','))
    .map(s => s.trim()).filter(Boolean)
));
let preferred = null;
const WEB_KEY = process.env.FIREBASE_WEB_API_KEY;
const REQUIRE_AUTH = process.env.AI_REQUIRE_AUTH !== 'false';

router.use(express.json({ limit: '25mb' }));

const one = t => [{ role: 'user', parts: [{ text: t }] }];
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

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

let healthCache = null;
router.get('/health', async (req, res) => {
  const out = { configured: !!GEMINI_KEY, webKey: !!WEB_KEY, models: MODELS };
  if (!GEMINI_KEY) return res.json(out);
  if (healthCache && healthCache.exp > Date.now()) return res.json(Object.assign(out, healthCache.v));
  let v;
  try {
    const t = await gemini('Reply with the single word: ok', one('ping'), { maxOutputTokens: 256 });
    v = { gemini: 'ok', workingModel: preferred, sample: clip(t, 20) };
  } catch (e) {
    v = { gemini: 'error', status: e.status, message: clip(e.message, 240) };
  }
  healthCache = { exp: Date.now() + 20000, v };
  res.json(Object.assign(out, v));
});

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

class AiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function callModel(model, system, contents, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28000);
  try {
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: Object.assign({ temperature: 0.7, maxOutputTokens: 2048 }, opts)
        })
      }
    );
    if (!r.ok) {
      let msg = '';
      try { const j = await r.json(); msg = (j.error && j.error.message) || ''; } catch (e) {}
      throw new AiError(r.status, msg || ('http ' + r.status));
    }
    const j = await r.json();
    const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
    const text = parts ? parts.filter(p => !p.thought).map(p => p.text || '').join('').trim() : '';
    if (!text) {
      const why = (j.candidates && j.candidates[0] && j.candidates[0].finishReason) ||
        (j.promptFeedback && j.promptFeedback.blockReason) || 'empty';
      throw new AiError(0, 'empty answer (' + why + ')');
    }
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    throw new AiError(0, e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'network');
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(system, contents, opts = {}) {
  const order = preferred ? [preferred].concat(MODELS.filter(m => m !== preferred)) : MODELS;
  const t0 = Date.now();
  let last = null;
  for (let round = 0; round < 2; round++) {
    for (const m of order) {
      if (Date.now() - t0 > 45000) throw last || new AiError(0, 'timeout');
      try {
        const text = await callModel(m, system, contents, opts);
        preferred = m;
        return text;
      } catch (e) {
        last = e;
        console.error('[ai] model', m, '->', e.status, e.message);
        if (e.status === 401 || e.status === 403) throw e;
      }
    }
    if (round === 0) await new Promise(r => setTimeout(r, 1500));
  }
  throw last || new AiError(0, 'no model');
}

const langName = l => (l === 'fr' ? 'French' : 'English');
const fail = (res, e) => {
  console.error('[ai] failed:', e && e.status, e && e.message);
  const code = e && e.status ? 'gemini_' + e.status : 'gemini_error';
  res.status(502).json({ ok: false, error: 'AI is busy, try again', code });
};

const FOUNDER = [
  'ABOUT ESAR AND ITS FOUNDER (share only when asked; never invent other details):',
  '- ESAR is a social app founded and built by Kome Samuel, a young protege who is a teacher. He proudly says he is the youngest teacher ever.',
  '- ESAR grew out of its root app, Clipora. He built it with the help of Kambang Sinclaire, Ekeme Rejoice, Kambang Derick and more.',
  '- Kome Samuel went to Remedial Citadel College in Tombel, where he did his Ordinary Level and Advanced Level in Sciences.',
  '- His godfather is Mr Kambang Derick.',
  '- Family: father Kome Johanes, mother Evelyn Kome, elder brother Kome Oscar, elder sister Kome Caline, little brother Kome Fahis.',
  '- Contact email: komesamuelkwelle@gmail.com',
  'If someone asks who created or founded ESAR, answer: ESAR is founded by Kome Samuel, a young protege who is a teacher. Give the extra details above only if they ask about them. If asked for anything not listed (phone number, home address, age, etc.), say you do not have that information.'
].join('\n');

const OK_MIME = /^(image\/(jpeg|png|webp|heic|heif)|audio\/(aac|mpeg|mp3|wav|x-wav|ogg|flac|aiff|mp4)|application\/pdf|text\/[\w.+-]+|application\/json)$/;

function toParts(m, isLast) {
  let text = clip(m.text, 4000);
  const parts = [];
  const atts = isLast && Array.isArray(m.attachments) ? m.attachments.slice(0, 3) : [];
  let hasAudio = false;
  for (const a of atts) {
    const mime = String((a && a.mime) || '').toLowerCase();
    const data = a && typeof a.data === 'string' ? a.data : '';
    if (!OK_MIME.test(mime) || !data || data.length > 9000000) continue;
    if (mime.startsWith('audio/')) hasAudio = true;
    parts.push({ inlineData: { mimeType: mime, data } });
  }
  if (!text && parts.length) {
    text = hasAudio ? 'This is my voice message. Listen and reply to what I said.' : 'Please look at what I attached and help me.';
  }
  if (text) parts.push({ text });
  return parts;
}

const BASE = 'You are ESAR AI, a friendly assistant inside ESAR, a social app. Be concise, warm and practical. ' +
  'Never claim to be human. Do not give harmful, hateful or sexual content.';

router.post('/chat', async (req, res) => {
  try {
    let msgs = Array.isArray(req.body.messages) ? req.body.messages.slice(-14) : [];
    while (msgs.length && msgs[0].role === 'model') msgs = msgs.slice(1);
    const contents = msgs
      .map((m, i) => ({ role: m.role === 'model' ? 'model' : 'user', parts: toParts(m, i === msgs.length - 1) }))
      .filter(m => m.parts.length);
    if (!contents.length || contents[contents.length - 1].role !== 'user')
      return res.status(400).json({ ok: false, error: 'Empty message' });
    const system = BASE + '\n' + FOUNDER + '\nReply in ' + langName(req.body.lang) +
      ' unless the user writes in another language. If the user sends audio, treat it as their spoken message and answer it. ' +
      'Keep answers short unless asked for more. You may use **bold**, bullet lists starting with "- ", and short headings; avoid tables.';
    const text = await gemini(system, contents);
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
      { temperature: 0.9, maxOutputTokens: 1024 }
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
      { temperature: 0.9, maxOutputTokens: 1024 }
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
      { temperature: 0.8, maxOutputTokens: 1024, responseMimeType: 'application/json' }
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
      { temperature: 0.2, maxOutputTokens: 2048 }
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
      { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json' }
    );
    let j = {};
    try { j = JSON.parse(raw); } catch (e) {}
    res.json({ ok: true, allowed: j.allowed !== false, reason: clip(j.reason, 80) });
  } catch (e) { fail(res, e); }
});

module.exports = router;
