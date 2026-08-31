const admin = require("firebase-admin");
const express = require("express");
77
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jeko-b63b0-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
app.use(express.json());
app.use('/', require('./routes/otp'));
app.get("/", (req, res) => res.send("ESAR notify server running"));

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
