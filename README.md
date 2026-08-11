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

Posts are written in **Markdown**. Since I'm the only author; and I quite like MD
