ESAR HOUSE SITE — DEPLOYMENT TO esar-notify-server
=====================================================

WHAT'S IN THIS ZIP
9 files: index, story, worlds, journal, contact, privacy, terms (all .html),
css/style.css, js/main.js, robots.txt.

Two things added on top of your original upload:
1. index.html — Google site-verification meta tag added (same one already
   verified in Search Console), so OAuth branding verification keeps working.
2. privacy.html and terms.html — built to match, carrying the exact same
   legal text you already had live (required for OAuth verification links).
3. js/main.js — the ad banner now also checks your existing /api/ad endpoint
   (the sponsor-ad system we built earlier) and slots a real paid ad into the
   rotation automatically when one is active — no code changes needed when
   you activate/deactivate an ad via curl, same as before.

LEFT OUT ON PURPOSE
hosts.html and collection.html from your upload contained unrelated leftover
content (a different business, a Saudi phone number) and weren't linked in
your nav — they're not included here. Say the word if you want two new real
ESAR pages built in their place later.

DEPLOYMENT STEPS (Termux)

1. Back up your current server.js first:
   cd ~/esar-notify-server
   cp server.js server.js.backup2

2. Create a public folder and move this site into it:
   mkdir -p public

   Then copy every file from this zip's extracted folder into
   ~/esar-notify-server/public/ — keeping the css/ and js/ subfolders intact.
   (Easiest: extract this zip directly into ~/esar-notify-server/public/)

3. Edit server.js:
   nano server.js

   Find this line near the top (search with Ctrl+W):
     app.use(express.json());

   Right after it, add:
     app.use(express.static('public'));

   Then find and DELETE these three route blocks entirely (search each with
   Ctrl+W, then select and remove from app.get(...) down to its closing });):
     - app.get("/", ...)          <- the whole homepage route
     - app.get("/privacy", ...)   <- the whole privacy route
     - app.get("/terms", ...)     <- the whole terms route

   These are no longer needed — express.static now serves index.html,
   privacy.html, and terms.html directly from the public folder instead.

   IMPORTANT: leave everything else untouched — /send-otp, /verify-otp,
   /esarpay/*, /api/ad, /api/latest-posts, and the FCM notification listener
   all stay exactly as they are.

4. Verify, commit, push:
   node -c server.js
   git add server.js public
   git commit -m "replace homepage with new house-style site"
   git push

5. Once Render redeploys, test:
   curl -s https://esar-notify-server.onrender.com/ | head -5
   curl -s https://esar-notify-server.onrender.com/privacy | head -5
   curl -s https://esar-notify-server.onrender.com/robots.txt

WHY express.static INSTEAD OF MORE app.get(...) ROUTES
Your old homepage was built as one big JavaScript template string inside
server.js — fine for a single page, painful for seven. Static files let each
page be a real, separate, editable .html file, and Express serves them all
automatically by matching the URL to the filename (e.g. /worlds.html serves
worlds.html). This is also why future edits get much easier: to change the
Story page, you just edit story.html directly — no more nano-searching
through a giant server.js template string.

STILL TRUE FROM BEFORE
Your ad system (curl commands to turn a sponsor ad on/off) works exactly the
same as always — no changes needed there. The new banner just also displays
whatever's live automatically.
