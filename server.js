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
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<title>ESAR — Chat, Ride, Work, Shop</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    color: #1a1a2e;
    background: #fafafa;
    line-height: 1.6;
  }
  .hero {
    background: linear-gradient(135deg, #16213E 0%, #1F3A63 50%, #2E5C9A 100%);
    color: #fff;
    text-align: center;
    padding: 56px 20px 64px;
  }
  .hero img.logo {
    width: 96px;
    height: 96px;
    border-radius: 22px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.35);
    margin-bottom: 20px;
  }
  .hero h1 {
    font-size: 2.2rem;
    margin: 0 0 10px;
    letter-spacing: -0.5px;
  }
  .hero p {
    font-size: 1.05rem;
    color: #d8e0f0;
    max-width: 480px;
    margin: 0 auto;
  }
  .hero .badge {
    display: inline-block;
    margin-top: 24px;
    background: #FFD700;
    color: #16213E;
    font-weight: 700;
    padding: 12px 28px;
    border-radius: 30px;
    font-size: 0.95rem;
  }
  .container { max-width: 1000px; margin: 0 auto; padding: 0 20px; }
  .feature {
    display: flex;
    align-items: center;
    gap: 40px;
    padding: 60px 0;
    flex-wrap: wrap;
  }
  .feature.reverse { flex-direction: row-reverse; }
  .feature-text { flex: 1; min-width: 240px; }
  .feature-text .tag {
    display: inline-block;
    background: #eef2ff;
    color: #2E5C9A;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 5px 12px;
    border-radius: 20px;
    margin-bottom: 12px;
  }
  .feature-text h2 {
    font-size: 1.6rem;
    margin: 0 0 12px;
  }
  .feature-text p {
    color: #555;
    font-size: 1rem;
  }
  .feature-image {
    flex: 1;
    min-width: 240px;
    text-align: center;
  }
  .feature-image img {
    max-width: 260px;
    width: 100%;
    border-radius: 24px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.18);
    border: 6px solid #fff;
  }
  .divider { border: none; border-top: 1px solid #e5e5e5; margin: 0; }
  .cta {
    text-align: center;
    background: #16213E;
    color: #fff;
    padding: 60px 20px;
    margin-top: 40px;
  }
  .cta h2 { font-size: 1.8rem; margin: 0 0 12px; }
  .cta p { color: #c8d2e5; margin-bottom: 24px; }
  .cta a {
    display: inline-block;
    background: #FFD700;
    color: #16213E;
    font-weight: 700;
    padding: 14px 36px;
    border-radius: 30px;
    text-decoration: none;
  }
  footer {
    text-align: center;
    padding: 30px 20px;
    color: #888;
    font-size: 0.85rem;
  }
  footer a { color: #2E5C9A; text-decoration: none; margin: 0 8px; }
  @media (max-width: 640px) {
    .feature, .feature.reverse { flex-direction: column; text-align: center; }
  }
</style>
</head>
<body>

<div class="hero">
  <img class="logo" src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518860/IMG-20260902-WA7144_hnyvnd.jpg" alt="ESAR logo">
  <h1>ESAR</h1>
  <p>One app to chat with the people who matter, book a ride, find work, and buy or sell — all in one place.</p>
  <span class="badge">Free for Android · No sign-in required to view this page</span>
</div>

<div class="container">

  <div class="feature">
    <div class="feature-text">
      <span class="tag">Connect</span>
      <h2>💬 Chat &amp; Stay Close</h2>
      <p>Send messages, photos, and voice notes to friends and family in real time. Your home feed keeps you up to date with the people who matter most.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518230/Screenshot_20260904-111818_fbg9gl.png" alt="ESAR home feed">
    </div>
  </div>

  <hr class="divider">

  <div class="feature reverse">
    <div class="feature-text">
      <span class="tag">Watch</span>
      <h2>🎬 EsarVid</h2>
      <p>Scroll and share short videos right inside ESAR — no need to jump to another app to stay entertained.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518231/Screenshot_20260904-111931_orhdme.png" alt="EsarVid video feed">
    </div>
  </div>

  <hr class="divider">

  <div class="feature">
    <div class="feature-text">
      <span class="tag">Move</span>
      <h2>🚗 Book a Ride</h2>
      <p>Request a nearby ESAR driver and get where you're going. Track your ride live, right from the app.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518229/Screenshot_20260904-111828_wpvuwk.png" alt="ESAR ride booking">
    </div>
  </div>

  <hr class="divider">

  <div class="feature reverse">
    <div class="feature-text">
      <span class="tag">Earn</span>
      <h2>💼 Find Work</h2>
      <p>Browse job listings and apply directly through ESAR. Companies can also post openings and find workers nearby.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518228/Screenshot_20260904-111919_gzqhgv.png" alt="ESAR jobs section">
    </div>
  </div>

  <hr class="divider">

  <div class="feature">
    <div class="feature-text">
      <span class="tag">Shop</span>
      <h2>🛍️ ESAR Marketplace</h2>
      <p>Browse and buy products from sellers across ESAR. Every order gets delivered by an ESAR driver, so you never have to leave the app.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788519363/Screenshot_20260904-115536_f5rzam.png" alt="ESAR marketplace">
    </div>
  </div>

  <hr class="divider">

  <div class="feature reverse">
    <div class="feature-text">
      <span class="tag">Sell</span>
      <h2>🏪 Become a Seller</h2>
      <p>Open your own seller account on ESAR and start listing products in minutes. ESAR drivers handle delivery for you, for a small fee — no need to arrange your own shipping.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788519414/Screenshot_20260904-115530_r157ja.png" alt="ESAR seller registration">
    </div>
  </div>

  <hr class="divider">

  <div class="feature">
    <div class="feature-text">
      <span class="tag">Your Profile</span>
      <h2>👤 Make It Yours</h2>
      <p>Customize your profile, share your bio, and let people know who you are on ESAR.</p>
    </div>
    <div class="feature-image">
      <img src="https://res.cloudinary.com/dtdohzvu/image/upload/v1788518231/Screenshot_20260904-112119_uap8cg.png" alt="ESAR profile page">
    </div>
  </div>

</div>

<div class="cta">
  <h2>Get Started with ESAR</h2>
  <p>Sign up in seconds and start connecting, riding, earning, and shopping.</p>
  <a href="#">Coming soon to app stores</a>
</div>

<footer>
  <p>© 2026 ESAR. All rights reserved.</p>
  <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="mailto:komesammuel@gmail.com">Contact</a>
</footer>

</body>
</html>`);
});
app.get("/privacy", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>ESAR - Privacy Policy</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.6;">
<h1>Privacy Policy</h1>
<p>Last updated: September 2026</p>
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
</body></html>`);
});

app.get("/terms", (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>ESAR - Terms of Service</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.6;">
<h1>Terms of Service</h1>
<p>Last updated: September 2026</p>
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
</body></html>`);
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
