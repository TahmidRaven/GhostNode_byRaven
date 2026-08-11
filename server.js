import app from './app.js';
import { getDb, closeClient } from './lib/db.js';

// Local dev / VPS entry point. The Vercel deployment uses api/index.js instead;
// both wrap the same Express app from app.js.

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.MONGO_URI) {
    console.error('[fatal] MONGO_URI is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

async function main() {
    // Connect (and build indexes) eagerly so startup fails fast on a bad URI.
    await getDb();
    console.log('[mongo] connected');
    app.listen(PORT, () => {
        console.log(`[http] GhostNode listening on http://localhost:${PORT}`);
        console.log('[http] admin panel at /admin');
    });
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
