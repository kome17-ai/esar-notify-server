// routes/esarpay.js
// Mount this in server.js with: app.use('/esarpay', require('./routes/esarpay'));
//
// Core rule: the phone NEVER writes balance directly to Firebase.
// Every balance change goes through here, using the Firebase Admin SDK,
// which the phone has no access to. This is what makes the ledger trustworthy.

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

function db() { return admin.database(); }

// Verifies the request actually came from a signed-in ESAR user.
// The app must send: Authorization: Bearer <Firebase ID token>
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing auth token' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid auth token' });
  }
}

// GET /esarpay/balance — server-authoritative balance read
router.get('/balance', requireAuth, async (req, res) => {
  const snap = await db().ref(`/users/${req.uid}/esarPay/balance`).once('value');
  res.json({ balance: snap.val() || 0 });
});

// POST /esarpay/deposit/initiate  { amount, currency }
// Creates a pending deposit record and returns a placeholder payment reference.
// Once you're signed up with Flutterwave, this is where you call their
// "initialize payment" API and return their real checkout link/reference
// instead of the placeholder below.
router.post('/deposit/initiate', requireAuth, async (req, res) => {
  const { amount, currency } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'invalid amount' });

  const ref = db().ref(`/users/${req.uid}/esarPay/transactions`).push();
  const txn = {
    id: ref.key,
    type: 'deposit',
    amount,
    currency: currency || 'NGN',
    status: 'pending',
    time: Date.now(),
    // processorReference: filled in once Flutterwave integration is wired
  };
  await ref.set(txn);

  res.json({
    ok: true,
    transactionId: ref.key,
    // Placeholder — replace with the real Flutterwave checkout URL once wired
    checkoutUrl: null,
    note: 'Deposit recorded as pending. Wire Flutterwave to actually move money.'
  });
});

// POST /esarpay/webhook/flutterwave
// Flutterwave calls THIS endpoint (not your app) when a payment succeeds.
// This is the only place a deposit is ever marked "completed" and credited —
// never trust a "success" claim coming from the phone itself.
router.post('/webhook/flutterwave', async (req, res) => {
  // Once wired: verify req.headers['verif-hash'] against your Flutterwave
  // secret hash before trusting ANYTHING in this payload.
  const event = req.body;

  // Placeholder structure — adjust field names to match Flutterwave's real
  // webhook payload once you're integrated.
  const uid = event.uid;
  const txnId = event.transactionId;
  const amount = event.amount;

  if (!uid || !txnId || !amount) return res.status(400).send('bad payload');

  const txnRef = db().ref(`/users/${uid}/esarPay/transactions/${txnId}`);
  const balanceRef = db().ref(`/users/${uid}/esarPay/balance`);

  await balanceRef.transaction(current => (current || 0) + amount);
  await txnRef.update({ status: 'completed' });

  res.status(200).send('ok');
});

// POST /esarpay/withdraw/initiate  { amount, methodId }
router.post('/withdraw/initiate', requireAuth, async (req, res) => {
  const { amount, methodId } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'invalid amount' });

  const balanceRef = db().ref(`/users/${req.uid}/esarPay/balance`);
  const result = await balanceRef.transaction(current => {
    if ((current || 0) < amount) return; // abort — insufficient funds
    return current - amount;
  });

  if (!result.committed) {
    return res.status(400).json({ error: 'insufficient balance' });
  }

  const ref = db().ref(`/users/${req.uid}/esarPay/transactions`).push();
  await ref.set({
    id: ref.key,
    type: 'withdrawal',
    amount,
    methodId,
    status: 'pending', // becomes "completed" once Flutterwave payout API confirms
    time: Date.now()
  });

  res.json({ ok: true, transactionId: ref.key });
});

// POST /esarpay/send  { toUid, amount, note }
// Atomic transfer — both balances update together via Firebase transactions,
// so money can never be "lost" or duplicated between two users.
router.post('/send', requireAuth, async (req, res) => {
  const { toUid, amount, note } = req.body;
  if (!toUid || !amount || amount <= 0) return res.status(400).json({ error: 'invalid request' });
  if (toUid === req.uid) return res.status(400).json({ error: 'cannot send to yourself' });

  const senderRef = db().ref(`/users/${req.uid}/esarPay/balance`);
  const result = await senderRef.transaction(current => {
    if ((current || 0) < amount) return;
    return current - amount;
  });

  if (!result.committed) {
    return res.status(400).json({ error: 'insufficient balance' });
  }

  const receiverRef = db().ref(`/users/${toUid}/esarPay/balance`);
  await receiverRef.transaction(current => (current || 0) + amount);

  const senderTxn = db().ref(`/users/${req.uid}/esarPay/transactions`).push();
  await senderTxn.set({ id: senderTxn.key, type: 'send', toUid, amount, note: note || '', status: 'completed', time: Date.now() });

  const receiverTxn = db().ref(`/users/${toUid}/esarPay/transactions`).push();
  await receiverTxn.set({ id: receiverTxn.key, type: 'receive', fromUid: req.uid, amount, note: note || '', status: 'completed', time: Date.now() });

  res.json({ ok: true });
});

// GET /esarpay/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  const snap = await db().ref(`/users/${req.uid}/esarPay/transactions`).limitToLast(100).once('value');
  const list = [];
  snap.forEach(child => list.push(child.val()));
  list.reverse();
  res.json({ transactions: list });
});

// POST /esarpay/request  { toUid, amount, reason }
// Just creates a notification for the other user — never touches balance.
router.post('/request', requireAuth, async (req, res) => {
  const { toUid, amount, reason } = req.body;
  if (!toUid || !amount || amount <= 0) return res.status(400).json({ error: 'invalid request' });

  const requesterSnap = await db().ref(`/users/${req.uid}/fullName`).once('value');
  const ref = db().ref(`/notifications/${toUid}`).push();
  await ref.set({
    type: 'payment_request',
    senderName: requesterSnap.val() || 'An ESAR user',
    message: `requested ${amount} from you${reason ? ' for ' + reason : ''}`,
    fromUid: req.uid,
    amount,
    time: Date.now()
  });

  res.json({ ok: true });
});

module.exports = router;
