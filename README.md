# Analytics Backup Server

Backup pixel endpoint for the ZyngaPoker playable. Receives the same
`GET /ping?e=...&t=...&uid=...&net=...&os=...&model=...` beacon the primary
endpoint gets, and stores each event in its own MongoDB (Atlas) — an independent
copy for redundancy. It returns a 1x1 GIF, so `new Image().src = url` on the
client works unchanged.

This runs on your **second domain**, separate from the primary analytics stack.

## 1. MongoDB Atlas setup

1. Create a free cluster at https://cloud.mongodb.com (M0 tier is enough).
2. **Database Access** → add a database user (username + password).
3. **Network Access** → add the IP of the box that runs this server
   (or `0.0.0.0/0` while testing — lock it down after).
4. **Database → Connect → Drivers** → copy the connection string
   (`mongodb+srv://...`). That is your `MONGO_URI`.

Atlas keeps its own automated backups/snapshots, so this copy is itself backed up.

## 2. Configure

```bash
cp .env.example .env
# edit .env, paste the Atlas MONGO_URI
```

## 3. Run

```bash
npm install
npm run start:local   # loads .env  (or: npm run dev  for auto-restart)
```

On a deploy host (Render/Railway/VPS) the platform injects the env vars, so there
is no `.env` file — use plain `npm start` there (it does not read `.env`).

Smoke test locally:

```bash
curl "http://localhost:3000/health"
curl "http://localhost:3000/ping?e=Start&t=0&uid=test123&net=mraid&os=android&model=Pixel7"
```

Then confirm the doc landed:

```
Atlas → Collections → playable_analytics.events
```

## 4. Point the playable at it

In the Cocos project `PlayableConfig.json`, set the backup URL and rebuild:

```json
"SecondaryEndpoint": { "Value": "https://your-second-domain.com/ping" }
```

The client fires primary and secondary independently — one down, the other still logs.

## Document shape

```jsonc
{
  "e": "HeartBeat",          // event: Start | HeartBeat | cta_click
  "t": 15,                   // playtime seconds (client)
  "uid": "unknown",          // playable id
  "net": "mraid",            // ad network
  "os": "android",
  "model": "Pixel 7",
  "receivedAt": "2026-08-11T12:00:00.000Z",  // server time
  "ip": "1.2.3.4",           // server-derived
  "ua": "Mozilla/5.0 ...",   // server-derived
  "extra": { }               // any params beyond the known set
}
```

Reconcile against the primary DB on the natural key `uid + t + e`
(there is an index for it).

## Deploy to Vercel (dostoevsky.top)

> GitHub Pages cannot host this — Pages serves static files only and cannot run
> Node or connect to Mongo. Vercel runs the endpoint as a serverless function.

Layout:
- `api/ping.js`, `api/health.js` — the serverless functions.
- `vercel.json` — rewrites `/ping` → `/api/ping`, `/health` → `/api/health`, so the
  public URL is `https://dostoevsky.top/ping` (no `/api` prefix).
- `server.js` — only for local dev / a VPS; Vercel ignores it and uses `api/`.
- Both share `lib/analytics-store.js`.

Steps:

1. Push this folder to a GitHub repo (`.env` stays out — it is gitignored).
2. https://vercel.com → New Project → import that repo → Deploy.
3. Project → **Settings → Environment Variables**, add:
   - `MONGO_URI` = your Atlas connection string
   - `DB_NAME` = `playable_analytics`
   - `COLLECTION` = `events`
   (No `PORT` — serverless has no port.) Redeploy after adding.
4. Project → **Settings → Domains** → add `dostoevsky.top`. Vercel shows the DNS
   record to set at your registrar (an `A` record to `76.76.21.21`, or the CNAME it
   gives you). Wait for it to verify + issue HTTPS.
5. **Atlas → Network Access**: Vercel functions use dynamic IPs, so add `0.0.0.0/0`
   (allow all). Auth (user + password) still protects the DB — but this is why
   rotating a leaked password matters.

Verify live:

```bash
curl "https://dostoevsky.top/health"
curl "https://dostoevsky.top/ping?e=Start&t=0&uid=test&net=curl&os=other&model=cli"
```

Expect `{"ok":true}` and a `200 image/gif`; the doc appears in Atlas `events`.

## Notes

- Serverless caveat handled: `api/ping.js` awaits the Mongo insert **before**
  returning the pixel. A serverless function can be frozen the moment it responds,
  so writing after responding would silently drop pings. (The always-on `server.js`
  responds first, which is safe there.)
- The endpoint is public and unauthenticated (it is a pixel). Values are length-capped;
  add rate limiting if abuse shows up.
# GhostNode
