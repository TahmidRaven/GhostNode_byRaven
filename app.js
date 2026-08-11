import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { marked } from 'marked';

import { getPosts, getImages } from './lib/db.js';
import { CATEGORIES, slugify, normalizePost, autoExcerpt } from './lib/posts.js';
import {
    checkLogin, signSession, setSessionCookie, clearSessionCookie,
    readSession, requireAuth,
} from './lib/auth.js';

// Single Express app used both by the local dev server (server.js) and the
// Vercel serverless entry (api/index.js). It serves the API and the static
// front-end from /public.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
// Images arrive as base64 JSON (already compressed in the browser), so allow a
// generous body — still comfortably under Vercel's ~4.5 MB serverless cap.
app.use(express.json({ limit: '6mb' }));

marked.setOptions({ gfm: true, breaks: true });

// ---- helpers ---------------------------------------------------------------

const oid = (id) => { try { return new ObjectId(id); } catch { return null; } };

// Public shape of a post. `full` includes rendered HTML for the single view.
function publicPost(doc, { full = false } = {}) {
    if (!doc) return null;
    const out = {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        excerpt: doc.excerpt || '',
        tags: doc.tags || [],
        published: doc.published !== false,
        coverImageId: doc.coverImageId || null,
        coverUrl: doc.coverImageId ? `/api/images/${doc.coverImageId}` : null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
    if (full) {
        out.content = doc.content || '';
        out.html = marked.parse(doc.content || '');
    }
    return out;
}

// ---- auth ------------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!checkLogin(username, password)) {
        return res.status(401).json({ error: 'invalid credentials' });
    }
    setSessionCookie(res, signSession(String(username)));
    res.json({ ok: true, user: String(username) });
});

app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
    const session = readSession(req);
    res.json({ loggedIn: Boolean(session), user: session?.u || null });
});

// ---- posts -----------------------------------------------------------------

// List. Public sees published only; an authed admin can pass ?all=1 for drafts.
app.get('/api/posts', async (req, res) => {
    try {
        const authed = Boolean(readSession(req));
        const wantAll = authed && req.query.all === '1';
        const filter = {};
        if (!wantAll) filter.published = { $ne: false };
        if (req.query.category && CATEGORIES.includes(req.query.category)) {
            filter.category = req.query.category;
        }

        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const skip = Math.max(Number(req.query.skip) || 0, 0);

        const col = await getPosts();
        const [items, total] = await Promise.all([
            col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
            col.countDocuments(filter),
        ]);
        res.json({ posts: items.map((d) => publicPost(d)), total, categories: CATEGORIES });
    } catch (err) {
        console.error('[posts:list]', err.message);
        res.status(500).json({ error: 'failed to load posts' });
    }
});

// Single post. Drafts require auth.
app.get('/api/posts/:slug', async (req, res) => {
    try {
        const col = await getPosts();
        const doc = await col.findOne({ slug: req.params.slug });
        if (!doc) return res.status(404).json({ error: 'not found' });
        if (doc.published === false && !readSession(req)) {
            return res.status(404).json({ error: 'not found' });
        }
        res.json({ post: publicPost(doc, { full: true }) });
    } catch (err) {
        console.error('[posts:get]', err.message);
        res.status(500).json({ error: 'failed to load post' });
    }
});

// Create.
app.post('/api/posts', requireAuth, async (req, res) => {
    const { post, error } = normalizePost(req.body || {});
    if (error) return res.status(400).json({ error });
    try {
        const col = await getPosts();
        const now = new Date();
        const base = slugify(post.title);
        // Ensure the slug is unique (append -2, -3, ... on collision).
        let slug = base;
        for (let n = 2; await col.findOne({ slug }); n++) slug = `${base}-${n}`;

        const doc = {
            slug,
            title: post.title,
            category: post.category,
            content: post.content,
            excerpt: post.excerpt || autoExcerpt(post.content),
            tags: post.tags || [],
            published: post.published !== undefined ? post.published : true,
            coverImageId: post.coverImageId || null,
            createdAt: now,
            updatedAt: now,
        };
        await col.insertOne(doc);
        res.status(201).json({ post: publicPost(doc, { full: true }) });
    } catch (err) {
        console.error('[posts:create]', err.message);
        res.status(500).json({ error: 'failed to create post' });
    }
});

// Update.
app.put('/api/posts/:slug', requireAuth, async (req, res) => {
    const { post, error } = normalizePost(req.body || {}, { partial: true });
    if (error) return res.status(400).json({ error });
    try {
        const col = await getPosts();
        const existing = await col.findOne({ slug: req.params.slug });
        if (!existing) return res.status(404).json({ error: 'not found' });

        const update = { ...post, updatedAt: new Date() };
        // Auto-refresh the excerpt only when content changed and no excerpt given.
        if (post.content !== undefined && post.excerpt === undefined && !existing.excerpt) {
            update.excerpt = autoExcerpt(post.content);
        }
        await col.updateOne({ _id: existing._id }, { $set: update });
        const doc = await col.findOne({ _id: existing._id });
        res.json({ post: publicPost(doc, { full: true }) });
    } catch (err) {
        console.error('[posts:update]', err.message);
        res.status(500).json({ error: 'failed to update post' });
    }
});

// Delete (also removes the cover image blob so storage doesn't leak).
app.delete('/api/posts/:slug', requireAuth, async (req, res) => {
    try {
        const col = await getPosts();
        const doc = await col.findOne({ slug: req.params.slug });
        if (!doc) return res.status(404).json({ error: 'not found' });
        await col.deleteOne({ _id: doc._id });
        if (doc.coverImageId) {
            const id = oid(doc.coverImageId);
            if (id) await (await getImages()).deleteOne({ _id: id });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('[posts:delete]', err.message);
        res.status(500).json({ error: 'failed to delete post' });
    }
});

// ---- images ----------------------------------------------------------------

// Store an already-compressed image. The browser downscales + re-encodes to WebP
// before upload (see public/assets/js/admin.js), so the server just persists it.
app.post('/api/images', requireAuth, async (req, res) => {
    try {
        let { dataUrl, width, height } = req.body || {};
        if (typeof dataUrl !== 'string') return res.status(400).json({ error: 'dataUrl required' });

        const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!m) return res.status(400).json({ error: 'expected a base64 image data URL' });
        const contentType = m[1];
        const data = m[2];
        const bytes = Math.floor((data.length * 3) / 4); // approx decoded size

        // Hard cap so a mis-compressed upload can't blow past Vercel's body limit
        // or eat the free Mongo tier. 3 MB of a *compressed* image is already huge.
        if (bytes > 3 * 1024 * 1024) {
            return res.status(413).json({ error: 'image too large after compression' });
        }

        const col = await getImages();
        const doc = {
            data,
            contentType,
            width: Number(width) || null,
            height: Number(height) || null,
            bytes,
            createdAt: new Date(),
        };
        const { insertedId } = await col.insertOne(doc);
        res.status(201).json({ id: String(insertedId), url: `/api/images/${insertedId}`, bytes });
    } catch (err) {
        console.error('[images:upload]', err.message);
        res.status(500).json({ error: 'failed to store image' });
    }
});

// Serve an image. Public + long-cached (the id changes when the image changes).
app.get('/api/images/:id', async (req, res) => {
    try {
        const id = oid(req.params.id);
        if (!id) return res.status(400).end();
        const doc = await (await getImages()).findOne({ _id: id });
        if (!doc) return res.status(404).end();
        res.setHeader('Content-Type', doc.contentType || 'image/webp');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.status(200).end(Buffer.from(doc.data, 'base64'));
    } catch (err) {
        console.error('[images:get]', err.message);
        res.status(500).end();
    }
});

// ---- misc + static ---------------------------------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Clean URL for a single post: /post/<slug> serves the post page shell.
app.get('/post/:slug', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Anything else that isn't an API call falls back to the home page.
app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;
