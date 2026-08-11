<p align="center">
  <img src="public/assets/images/icon.webp" alt="GhostNode" width="120" />
</p>

<h1 align="center">GhostNode by Raven</h1>

<p align="center">
  <a href="https://ghostnode.dostoevsky.top"><img src=".github/assets/blog-button.svg" alt="Check out the blog" height="52" /></a>
</p>

---

My personal blog. I write here about life, philosophy, books I read, movies I
watch, games I play, and things I make.

It's a small **Express + MongoDB** app with a built-in admin panel, so I can
write, edit, and delete posts straight from the website — no rebuilds, no static
files to regenerate. The look is a neon "terminal ghost" CRT theme.

It runs on free tiers: **Vercel** (hosting) + **MongoDB Atlas** (database).

---

## What it does

- **Public blog** at `/` — a feed of posts with category filters.
- **Single post** at `/post/<slug>`.
- **Admin panel** at `/admin` — log in, then create / edit / delete posts.
- **Images** — I upload a normal photo and the browser *squooshes* it
  (shrinks + converts to WebP) **before** it's sent, so a 4 MB phone photo lands
  as ~50–150 KB. That keeps the free database tiny.

Categories: `life · philosophy · books · movies · games · creations`.

---

## Run it on my machine

```bash
cp .env.example .env      # then fill in the values (see below)
npm install
npm run reset-db          # one-time: clears old data, sets up the database
npm run dev               # http://localhost:3000
```

Open `http://localhost:3000`, go to `/admin`, log in, and write a post.

---

## Settings (`.env`)

| Key | What it is |
|-----|------------|
| `MONGO_URI` | MongoDB Atlas connection string. |
| `DB_NAME` | Database name (`ghostnode`). |
| `ADMIN_USER` / `ADMIN_PASS` | My admin login. |
| `SESSION_SECRET` | Long random string that signs the login cookie. |
| `PORT` | Local port (default `3000`). |

Generate a fresh `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **Security note:** `.env` is git-ignored — never commit it. The password
> currently in the connection string was shared in plaintext once, so it's worth
> rotating in the Atlas dashboard.

---

## Deploy (Vercel)

1. Push to GitHub, import the repo in Vercel.
2. In **Vercel → Project → Settings → Environment Variables**, add the same keys
   from `.env` (`MONGO_URI`, `DB_NAME`, `ADMIN_USER`, `ADMIN_PASS`,
   `SESSION_SECRET`).
3. In **Atlas → Network Access**, allow Vercel to connect (`0.0.0.0/0` is the
   simple option for a personal project).
4. Deploy. `vercel.json` sends every request to the Express app, which serves
   both the site and the API.

---

## How it's put together

```
app.js              the whole Express app (API + serves the site)
server.js           runs it locally
api/index.js        runs it on Vercel
lib/db.js           MongoDB connection + indexes
lib/auth.js         login cookie (signed, no database sessions)
lib/posts.js        post validation + slugs
scripts/reset-db.js one-time cleanup / setup
public/             the front-end (HTML, the terminal-ghost CSS, the JS)
```

**Data:** two collections — `posts` (title, slug, category, markdown body, tags,
cover image, draft/published, dates) and `images` (the compressed WebP blobs).

Posts are written in **Markdown**. Since I'm the only author, the markdown is
rendered and shown as-is; don't paste in HTML you wouldn't trust yourself.
