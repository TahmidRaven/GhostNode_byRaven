import express from 'express';
import { PIXEL, buildDoc, getCollection, closeClient } from './lib/analytics-store.js';

// Always-on Express server for local dev or a VPS. The Vercel deployment uses
// api/ping.js instead; both share lib/analytics-store.js so the doc shape and
// Mongo handling stay identical.

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.MONGO_URI) {
    console.error('[fatal] MONGO_URI is not set. Provide the Atlas connection string.');
    process.exit(1);
}

function sendPixel(res) {
    res.set({
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
    });
    res.status(200).send(PIXEL);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true); // correct client IP behind a proxy / load balancer

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/ping', async (req, res) => {
    // This process stays alive after responding, so it is safe to return the
    // pixel first and write to Mongo afterwards (the beacon never waits on the DB).
    sendPixel(res);

    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const col = await getCollection();
        const doc = buildDoc(req.query, ip, req.headers['user-agent'] || '');
        await col.insertOne(doc);
        console.log(`[ping] ${doc.e} uid=${doc.uid} t=${doc.t}`);
    } catch (err) {
        console.error('[ping] insert failed:', err.message);
    }
});

async function main() {
    // Connect (and build indexes) eagerly so startup fails fast on a bad URI.
    await getCollection();
    console.log('[mongo] connected');
    app.listen(PORT, () => console.log(`[http] listening on :${PORT}  ->  GET /ping`));
}

for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
        console.log(`\n[shutdown] ${sig}`);
        try { await closeClient(); } catch {}
        process.exit(0);
    });
}

main().catch((err) => {
    console.error('[fatal]', err);
    process.exit(1);
});
