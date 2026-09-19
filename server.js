const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const admin = require("firebase-admin");
const express = require("express");
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jeko-b63b0-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
app.use(express.json());
app.use(express.static('public', { extensions: ['html'] }));
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\n');
});
app.use('/', require('./routes/otp'));
app.use('/esarpay', require('./routes/esarpay'));
const SITE_STYLE = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',-apple-system,sans-serif; background:#0b0f0d; color:#eaf5ef; line-height:1.6; }
  a { text-decoration:none; color:inherit; }
  img { max-width:100%; display:block; }
  nav { position:sticky; top:0; z-index:100; display:flex; align-items:center; justify-content:space-between;
        padding:18px 6%; background:rgba(11,15,13,0.92); backdrop-filter:blur(10px); border-bottom:1px solid #1c2620; }
  .logo { font-size:22px; font-weight:800; color:#25D366; }
  .nav-links { display:flex; gap:22px; flex-wrap:wrap; }
  .nav-links a { font-size:14px; font-weight:600; color:#b7c9bf; }
  .nav-links a:hover { color:#25D366; }
  .legal-body { max-width:720px; margin:0 auto; padding:60px 6% 100px; }
  .legal-body h1 { font-size:34px; font-weight:800; margin-bottom:8px; }
  .legal-body .updated { color:#6b8a76; font-size:13px; margin-bottom:36px; }
  .legal-body h2 { font-size:20px; font-weight:700; margin:32px 0 12px; color:#25D366; }
  .legal-body p, .legal-body li { color:#c3d4ca; font-size:15px; margin-bottom:8px; }
  .legal-body ul { padding-left:20px; margin-bottom:16px; }
  .legal-body strong { color:#eaf5ef; }
  footer { padding:50px 6% 30px; text-align:center; border-top:1px solid #1c2620; color:#6b8a76; font-size:13px; }
  footer a { color:#a9beb2; margin:0 10px; }
`;

const NAV = `
<nav>
  <a href="/" class="logo">ESAR</a>
  <div class="nav-links">
    <a href="/#chat">Chat</a>
    <a href="/#video">EsarVid</a>
    <a href="/#rides">Rides</a>
    <a href="/#jobs">Jobs</a>
    <a href="/#marketplace">Marketplace</a>
    <a href="/#latest">Latest</a>
  </div>
</nav>`;

const FOOTER = `
<footer>
  <div><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="mailto:komesammuel@gmail.com">Contact</a></div>
  <p style="margin-top:14px">© ${new Date().getFullYear()} ESAR. All rights reserved.</p>
</footer>`;


let currentAd = { active: false };
const ADMIN_KEY = process.env.ADMIN_KEY || "changeme123";

app.get('/api/ad', (req, res) => {
  res.json(currentAd);
});

app.post('/api/ad', (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  currentAd = {
    active: !!req.body.active,
    imageUrl: req.body.imageUrl || '',
    videoUrl: req.body.videoUrl || '',
    linkUrl: req.body.linkUrl || '#',
    headline: req.body.headline || '',
    description: req.body.description || ''
  };
  res.json({ ok: true, ad: currentAd });
});

console.log("Attaching listener to /notifications ...");

db.ref("/notifications").on("child_added", (parentSnap) => {
  const uid = parentSnap.key;
  console.log("Detected UID node under /notifications:", uid);

  parentSnap.ref.on("child_added", async (snap) => {
    console.log("New notification child detected for uid", uid, "key:", snap.key);
    const n = snap.val();
    if (!n) {
      console.log("Notification data was empty, skipping");
      return;
    }

if (n.sent === true) {
      console.log("Notification already sent previously, skipping:", snap.key);
      return;
    }

    const tokenSnap = await db.ref("/users/" + uid + "/fcmToken").get();
    const token = tokenSnap.val();
    console.log("Fetched token for uid", uid, ":", token ? token.substring(0, 20) + "..." : "NONE FOUND");

    if (!token) {
      console.log("No FCM token, cannot send. Aborting for this notification.");
      return;
    }

    const type = n.type || "general";
    const title = n.senderName || "ESAR";
    const body = n.message || "You have a new notification";

    const data = {
      title: String(title),
      body: String(body),
      type: String(type),
      notificationId: String(snap.key)
    };
    if (n.conversationId) data.conversationId = String(n.conversationId);
    if (n.postId) data.postId = String(n.postId);
    if (n.callId) data.callId = String(n.callId);
    if (n.callerId) data.callerId = String(n.callerId);
    if (n.callerName) data.callerName = String(n.callerName);

    data.title = String(title);
    data.body = String(body);

    const message = {
      token,
      data,
      android: {
        priority: "high"
      }
    };

    try {
      const result = await admin.messaging().send(message);
      console.log("SUCCESS: Notification sent to", uid, "messageId:", result);

await snap.ref.child("sent").set(true);    }
 catch (err) {
      console.error("FCM SEND ERROR for uid", uid, ":", err.message, err.code || "");
      if (err.code === "messaging/registration-token-not-registered") {
        await db.ref("/users/" + uid + "/fcmToken").remove();
        console.log("Removed dead token for uid", uid);
      }
    }
  }, (error) => {
    console.error("ERROR attaching inner listener for uid", uid, ":", error.message);
  });
}, (error) => {
  console.error("ERROR attaching outer /notifications listener:", error.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on port " + PORT));
