const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

function sanitizeEmail(email) {
  return email.toLowerCase().replace(/[.#$\[\]]/g, '_');
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
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Your ESAR verification code',
      text: `Your verification code is ${pin}. It expires in 10 minutes.`
    });
    res.json({ sent: true });
  } catch (e) {
    res.status(500).json({ error: 'failed to send email' });
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
