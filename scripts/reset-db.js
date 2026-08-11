import { MongoClient } from 'mongodb';

// One-off cleanup: drop the old analytics data from when this project was a
// pixel-tracking server, then make sure the new blog collections + indexes exist.
//
// Run once:  npm run reset-db     (uses .env)
// Safe to run again — it only drops the old analytics collection if it's there.

const OLD_DB = 'playable_analytics';
const OLD_COLLECTION = 'events';
const NEW_DB = process.env.DB_NAME || 'ghostnode';

async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI not set — run with `npm run reset-db`.');

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    console.log('[reset] connected');

    // 1. Wipe the old analytics data.
    const oldDb = client.db(OLD_DB);
    const oldCols = await oldDb.listCollections({ name: OLD_COLLECTION }).toArray();
    if (oldCols.length) {
        await oldDb.collection(OLD_COLLECTION).drop();
        console.log(`[reset] dropped old analytics: ${OLD_DB}.${OLD_COLLECTION}`);
    } else {
        console.log('[reset] no old analytics collection found — nothing to drop');
    }

    // 2. Ensure the new blog collections + indexes.
    const db = client.db(NEW_DB);
    const posts = db.collection('posts');
    await posts.createIndex({ slug: 1 }, { unique: true });
    await posts.createIndex({ createdAt: -1 });
    await posts.createIndex({ category: 1, createdAt: -1 });
    await posts.createIndex({ published: 1, createdAt: -1 });
    await db.collection('images').createIndex({ createdAt: -1 });
    console.log(`[reset] indexes ready on ${NEW_DB}.posts + ${NEW_DB}.images`);

    const count = await posts.countDocuments();
    console.log(`[reset] done. ${NEW_DB}.posts currently has ${count} post(s).`);

    await client.close();
}

main().catch((err) => {
    console.error('[reset] failed:', err.message);
    process.exit(1);
});
