const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

function sanitizeEmail(email) {
  return email.toLowerCase().replace(/[.#$\[\]]/g, '_');
}

async function sendViaBrevo(toEmail, pin) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'ESAR', email: process.env.GMAIL_USER },
      to: [{ email: toEmail }],
      subject: 'Your ESAR verification code',
      textContent: `Your verification code is ${pin}. It expires in 10 minutes.`
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Brevo error: ' + errText);
  }
}

router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 10 * 60 * 1000;

  await admin.database().ref('otpVerifications/' + sanitizeEmail(email)).set({
    pin, expiresAt, verified: false
  });

  try {
    await sendViaBrevo(email, pin);
    res.json({ sent: true });
  } catch (e) {
    console.error('EMAIL SEND ERROR:', e.message);
    res.status(500).json({ error: 'failed to send email', detail: e.message });
  }
});

router.post('/verify-otp', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.status(400).json({ error: 'email and pin required' });

  const ref = admin.database().ref('otpVerifications/' + sanitizeEmail(email));
  const snap = await ref.once('value');
  const data = snap.val();

  if (!data) return res.json({ verified: false, reason: 'no_pin_sent' });
  if (Date.now() > data.expiresAt) return res.json({ verified: false, reason: 'expired' });
  if (data.pin !== String(pin)) return res.json({ verified: false, reason: 'wrong_pin' });

  await ref.update({ verified: true });
  res.json({ verified: true });
});

module.exports = router;
