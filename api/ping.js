import { PIXEL, buildDoc, getCollection } from '../lib/analytics-store.js';

// Vercel serverless function. Reached at https://<domain>/ping via the rewrite
// in vercel.json.
//
// IMPORTANT: unlike the always-on Express server, a serverless function can be
// frozen the moment the response is sent. So the Mongo write is awaited BEFORE
// replying — otherwise pings would be silently dropped. The pixel is still
// returned even if the write fails, so the client never sees a broken image.
export default async function handler(req, res) {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
        const col = await getCollection();
        await col.insertOne(buildDoc(req.query || {}, ip, req.headers['user-agent'] || ''));
    } catch (err) {
        console.error('[ping] insert failed:', err.message);
    }

    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(PIXEL);
}
