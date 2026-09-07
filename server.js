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
app.use('/', require('./routes/otp'));

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

app.get("/", async (req, res) => {
  let latestPostsHtml = '<p style="color:#6b8a76">No posts yet.</p>';
  try {
    const snap = await db.ref('posts').limitToLast(6).once('value');
    const posts = [];
    snap.forEach(child => posts.push(child.val()));
    posts.reverse();
    if (posts.length) {
      latestPostsHtml = posts.map(p => `
        <div class="post-card">
          <div class="post-author">
            <div class="post-avatar">${((p.authorName || 'E')[0] || 'E').toUpperCase()}</div>
            <span>${p.authorName || 'ESAR user'}</span>
          </div>
          <p class="post-text">${(p.text || '').toString().slice(0, 180)}</p>
        </div>
      `).join('');
    }
  } catch (e) {
    latestPostsHtml = '<p style="color:#6b8a76">No posts yet.</p>';
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="google-site-verification" content="dCdbYO7XVrYbQSWAvliF55p9V7QLZVW5E" />
<title>ESAR — Chat, Rides, Jobs, Marketplace & More, All in One App</title>
<meta name="description" content="ESAR brings chat, short videos, rides, jobs, and marketplace into a single app. Built for real life, all in one place." />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  ${SITE_STYLE}
  .hero { padding:90px 6% 70px; text-align:center; max-width:800px; margin:0 auto; }
  .hero h1 { font-size:44px; font-weight:800; margin-bottom:18px; }
  .hero span { color:#25D366; }
  .hero p { font-size:18px; color:#a9beb2; margin-bottom:32px; }
  .badge { display:inline-block; background:#132018; color:#25D366; font-size:13px; font-weight:700;
           padding:8px 18px; border-radius:30px; margin-bottom:24px; border:1px solid #1f3327; }
  .feature { display:flex; align-items:center; gap:60px; padding:80px 6%; max-width:1200px; margin:0 auto; }
  .feature.reverse { flex-direction:row-reverse; }
  .feature-text { flex:1; }
  .feature-text .tag { display:inline-block; background:#132018; color:#25D366; font-size:12px; font-weight:700;
           letter-spacing:0.5px; text-transform:uppercase; padding:5px 12px; border-radius:20px; margin-bottom:14px; }
  .feature-text h2 { font-size:32px; font-weight:800; margin-bottom:16px; }
  .feature-text p { font-size:16px; color:#a9beb2; }
  .feature-img { flex:1; text-align:center; }
  .feature-img img { border-radius:18px; box-shadow:0 20px 60px rgba(0,0,0,0.5); border:1px solid #1c2620; max-width:280px; margin:0 auto; }
  .section-alt { background:#0f1512; }
  @media (max-width: 800px) {
    .feature, .feature.reverse { flex-direction:column; padding:50px 6%; gap:30px; text-align:center; }
    .hero h1 { font-size:32px; }
  }
  .join { text-align:center; padding:90px 6%; background:#0f1512; }
  .join h2 { font-size:32px; font-weight:800; margin-bottom:40px; }
  .join-grid { display:flex; gap:30px; justify-content:center; max-width:900px; margin:0 auto; flex-wrap:wrap; }
  .join-grid img { border-radius:16px; width:260px; box-shadow:0 15px 40px rgba(0,0,0,0.5); }
  .ad-slot { max-width:900px; margin:60px auto; padding:0 6%; }
  .ad-card { display:flex; align-items:center; gap:20px; background:#132018; border:1px solid #1f3327;
             border-radius:16px; padding:20px; }
  .ad-card img { width:100px; height:100px; object-fit:cover; border-radius:10px; }
  .ad-card .ad-label { font-size:11px; color:#6b8a76; text-transform:uppercase; letter-spacing:1px; margin-bottom:6px; }
  .ad-card h4 { font-size:16px; margin-bottom:4px; }
  .ad-card p { font-size:13px; color:#a9beb2; }
  .latest { padding:80px 6%; max-width:1000px; margin:0 auto; }
  .latest h2 { font-size:30px; font-weight:800; margin-bottom:30px; text-align:center; }
  .posts-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:20px; }
  .post-card { background:#132018; border:1px solid #1f3327; border-radius:14px; padding:18px; }
  .post-author { display:flex; align-items:center; gap:10px; margin-bottom:10px; font-weight:600; font-size:14px; }
  .post-avatar { width:32px; height:32px; border-radius:50%; background:#25D366; color:#052013;
                 display:flex; align-items:center; justify-content:center; font-weight:800; }
  .post-text { font-size:14px; color:#c3d4ca; }
  .cta { text-align:center; padding:80px 6%; background:#0f1512; }
  .cta h2 { font-size:30px; font-weight:800; margin-bottom:14px; }
  .cta p { color:#a9beb2; margin-bottom:26px; }
  .cta a.btn { display:inline-block; background:#25D366; color:#052013; font-weight:700; padding:14px 32px; border-radius:30px; }
</style>
</head>
<body>
${NAV}

<section class="hero">
  <div class="badge">Coming soon — building in public</div>
  <h1>One app for everything you actually do <span>every day.</span></h1>
  <p>Chat with friends, watch short videos, book a ride, find work, and buy or sell — all inside ESAR. No app-switching, no clutter.</p>
</section>

<section class="feature" id="chat">
  <div class="feature-img"><img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788741557/Screenshot_20260907-013813_oq9ap3.png" alt="EsarChat"></div>
  <div class="feature-text">
    <span class="tag">Connect</span>
    <h2>💬 EsarChat</h2>
    <p>Fast, private messaging with individual chats, groups, and broadcast channels — built to feel instant, wherever you are.</p>
  </div>
</section>

<section class="feature reverse section-alt" id="video">
  <div class="feature-img"><img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788741316/IMG-20260905-WA0642_vvtvii.jpg" alt="EsarVid"></div>
  <div class="feature-text">
    <span class="tag">Watch</span>
    <h2>🎬 EsarVid</h2>
    <p>Scroll and share short videos right inside ESAR — no need to jump to another app to stay entertained.</p>
  </div>
</section>

<section class="feature" id="rides">
  <div class="feature-img"><img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788740735/IMG-20260905-WA5561_hggl5e.jpg" alt="EsarRides"></div>
  <div class="feature-text">
    <span class="tag">Move</span>
    <h2>🚗 EsarRides</h2>
    <p>Request a nearby ESAR driver and get where you're going. Track your ride live, right from the app.</p>
  </div>
</section>

<section class="feature reverse section-alt" id="jobs">
  <div class="feature-img"><img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788740883/IMG-20260905-WA8743_il26mt.jpg" alt="ESAR Jobs"></div>
  <div class="feature-text">
    <span class="tag">Earn</span>
    <h2>💼 ESAR Jobs</h2>
    <p>Where people look for work, and companies find workers. Post a role, apply to one, and connect directly — no middleman.</p>
  </div>
</section>

<section class="feature" id="marketplace">
  <div class="feature-img"><img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788741378/IMG-20260905-WA2789_mfjjrf.jpg" alt="Verified sellers"></div>
  <div class="feature-text">
    <span class="tag">Shop &amp; Sell</span>
    <h2>🛍️ Marketplace, with trust built in</h2>
    <p>Every seller goes through a verification step before they can list — so buyers know exactly who they're dealing with. ESAR drivers handle delivery for you.</p>
  </div>
</section>

<section class="join">
  <h2>Getting started takes a minute</h2>
  <div class="join-grid">
    <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788741190/IMG-20260905-WA5798_ry7omn.jpg" alt="Registration">
    <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788741256/IMG-20260905-WA2871_wd4qxy.jpg" alt="Profile">
  </div>
</section>

<div class="ad-slot" id="ad-slot"></div>

<section class="latest" id="latest">
  <h2>Latest from ESAR</h2>
  <div class="posts-grid">
    ${latestPostsHtml}
  </div>
</section>

<section class="cta">
  <h2>Get Started with ESAR</h2>
  <p>Sign up in seconds and start connecting, riding, earning, and shopping.</p>
  <a href="#" class="btn">Coming soon to app stores</a>
</section>

${FOOTER}

<script>
  fetch('/api/ad').then(r => r.json()).then(ad => {
    if (!ad || !ad.active) return;
    const mediaHtml = ad.videoUrl
      ? \`<video src="\${ad.videoUrl}" autoplay muted loop playsinline style="width:100px;height:100px;object-fit:cover;border-radius:10px"></video>\`
      : \`<img src="\${ad.imageUrl}" alt="Sponsored">\`;
    document.getElementById('ad-slot').innerHTML = \`
      <a href="\${ad.linkUrl}" target="_blank" style="display:block">
        <div class="ad-card">
          \${mediaHtml}
          <div>
            <div class="ad-label">Sponsored</div>
            <h4>\${ad.headline}</h4>
            <p>\${ad.description || ''}</p>
          </div>
        </div>
      </a>
    \`;
  }).catch(() => {});
</script>

</body>
</html>`);
});

app.get("/privacy", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>ESAR - Privacy Policy</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${SITE_STYLE}</style>
</head>
<body>
${NAV}
<div class="legal-body">
<h1>Privacy Policy</h1>
<p class="updated">Last updated: September 2026</p>
<p>This Privacy Policy explains how ESAR ("we", "our", "the app") collects, uses, and protects information when you use our mobile application.</p>

<h2>Information We Collect</h2>
<ul>
<li><strong>Account information:</strong> full name, email address, phone number, and password (or Google account information if you sign in with Google).</li>
<li><strong>Profile information:</strong> profile photo, cover photo, bio, and location that you choose to provide.</li>
<li><strong>Content you create:</strong> messages, photos, and voice messages you send within the app.</li>
<li><strong>Usage data:</strong> basic technical information needed to operate notifications and app functionality.</li>
</ul>

<h2>How We Use Information</h2>
<ul>
<li>To create and manage your account.</li>
<li>To provide core app features such as messaging, photo sharing, and voice messages.</li>
<li>To send you notifications about activity relevant to you (such as new messages).</li>
<li>To verify your identity during account registration.</li>
</ul>

<h2>Third-Party Services</h2>
<p>ESAR uses the following third-party services to operate:</p>
<ul>
<li><strong>Google Firebase</strong> — authentication, database storage, and push notifications.</li>
<li><strong>Cloudinary</strong> — storage and delivery of photos and voice messages.</li>
<li><strong>Brevo</strong> — sending email verification codes.</li>
</ul>
<p>These providers process data on our behalf and are bound by their own privacy and security policies.</p>

<h2>Data Sharing</h2>
<p>We do not sell your personal information. Information is only shared with the third-party services listed above, as necessary to operate the app, or when required by law.</p>

<h2>Data Retention and Deletion</h2>
<p>Your information is retained as long as your account is active. You may request deletion of your account and associated data at any time by contacting us at the email below.</p>

<h2>Your Choices</h2>
<p>You can update or delete your profile information within the app, or contact us to request full account deletion.</p>

<h2>Contact Us</h2>
<p>If you have questions about this Privacy Policy, contact us at: <strong>komesammuel@gmail.com</strong></p>
</div>
${FOOTER}
</body></html>`);
});

app.get("/terms", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>ESAR - Terms of Service</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${SITE_STYLE}</style>
</head>
<body>
${NAV}
<div class="legal-body">
<h1>Terms of Service</h1>
<p class="updated">Last updated: September 2026</p>
<p>By creating an account or using ESAR, you agree to these Terms of Service.</p>

<h2>Use of the App</h2>
<p>ESAR is provided for personal, non-commercial communication between users. You agree to use the app lawfully and not to harass, abuse, or harm other users.</p>

<h2>Account Responsibility</h2>
<p>You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.</p>

<h2>Content</h2>
<p>You retain ownership of content you send through ESAR (messages, photos, voice messages). You are responsible for the content you share and agree not to share unlawful, harmful, or infringing content.</p>

<h2>Termination</h2>
<p>We may suspend or terminate accounts that violate these Terms.</p>

<h2>Changes</h2>
<p>These Terms may be updated from time to time. Continued use of the app after changes constitutes acceptance of the updated Terms.</p>

<h2>Contact</h2>
<p>Questions about these Terms can be sent to: <strong>komesammuel@gmail.com</strong></p>
</div>
${FOOTER}
</body></html>`);
});

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
    } catch (err) {
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
