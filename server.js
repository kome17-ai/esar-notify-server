const admin = require("firebase-admin");
const express = require("express");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jeko-b63b0-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();

app.get("/", (req, res) => res.send("ESAR notify server running"));

db.ref("/notifications").on("child_added", (parentSnap) => {
  const uid = parentSnap.key;
  parentSnap.ref.on("child_added", async (snap) => {
    const n = snap.val();
    if (!n) return;

    const tokenSnap = await db.ref("/users/" + uid + "/fcmToken").get();
    const token = tokenSnap.val();
    if (!token) return;

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
      await admin.messaging().send(message);
      console.log("Notification sent to", uid);
    } catch (err) {
      console.error("FCM error:", err);
      if (err.code === "messaging/registration-token-not-registered") {
        await db.ref("/users/" + uid + "/fcmToken").remove();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on port " + PORT));
