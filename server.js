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
<html><head><title>ESAR</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.6;">
<h1>ESAR</h1>
<p>ESAR is a mobile social and messaging app that lets people connect, chat, share photos and voice messages, and stay in touch with the people who matter to them.</p>
<p>ESAR is developed and operated independently. This page provides public information about the app.</p>
<ul>
<li><a href="/privacy">Privacy Policy</a></li>
<li><a href="/terms">Terms of Service</a></li>
</ul>
</body></html>`);
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

    const message = {
      token,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: {
          channelId: type.indexOf("call") >= 0 ? "esar_calls" : "esar_default",
          sound: "default",
          priority: "high",
          defaultVibrateTimings: true
        }
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
