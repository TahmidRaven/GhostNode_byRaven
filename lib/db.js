import { MongoClient } from 'mongodb';

// Single source of truth for the Mongo connection, shared by the Express app
// (local dev) and the Vercel serverless entry. Both import from here so the
// database name and connection handling stay identical.

const DB_NAME = process.env.DB_NAME || 'raven_data';

// Cache the client on globalThis so warm serverless invocations reuse one
// connection instead of opening a new one per request (avoids connection storms).
function getClient() {
    if (!globalThis.__mongoClientPromise) {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI not set');
        // Fail fast: a serverless function has ~10s total, so a blocked connection
        // must give up well before that.
        const client = new MongoClient(uri, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        globalThis.__mongoClient = client;
        globalThis.__mongoClientPromise = client.connect().catch((err) => {
            // Never cache a failed connection — clear it so the next request retries.
            globalThis.__mongoClient = null;
            globalThis.__mongoClientPromise = null;
            throw err;
        });
    }
    return globalThis.__mongoClientPromise;
}

let indexesEnsured = false;

async function ensureIndexes(db) {
    if (indexesEnsured) return;
    indexesEnsured = true;
    try {
        const posts = db.collection('posts');
        await posts.createIndex({ slug: 1 }, { unique: true });
        await posts.createIndex({ createdAt: -1 });
        await posts.createIndex({ category: 1, createdAt: -1 });
        await posts.createIndex({ published: 1, createdAt: -1 });
        await db.collection('images').createIndex({ createdAt: -1 });
    } catch {
        indexesEnsured = false; // let a later call retry
    }
}

export async function getDb() {
    const client = await getClient();
    const db = client.db(DB_NAME);
    await ensureIndexes(db);
    return db;
}

export async function getPosts() {
    return (await getDb()).collection('posts');
}

export async function getImages() {
    return (await getDb()).collection('images');
}

export async function closeClient() {
    if (globalThis.__mongoClient) {
        await globalThis.__mongoClient.close();
        globalThis.__mongoClient = null;
        globalThis.__mongoClientPromise = null;
    }
}
