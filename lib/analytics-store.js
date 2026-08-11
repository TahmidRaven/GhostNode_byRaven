import { MongoClient } from 'mongodb';

// Shared logic for both the always-on Express server (server.js) and the Vercel
// serverless function (api/ping.js). Single source of truth for the doc shape,
// the pixel, and the Mongo connection.

const DB_NAME    = process.env.DB_NAME    || 'playable_analytics';
const COLLECTION = process.env.COLLECTION || 'events';

const KNOWN_FIELDS  = ['e', 't', 'uid', 'net', 'os', 'model'];
const MAX_VALUE_LEN = 256;   // truncate oversized values (public, unauthenticated endpoint)
const MAX_EXTRA     = 20;    // cap number of unexpected params

// 1x1 transparent GIF returned for every ping (client loads via new Image()).
export const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const clip = (v) => String(Array.isArray(v) ? v[0] : v).slice(0, MAX_VALUE_LEN);

// Cache the Mongo client on globalThis so warm serverless invocations reuse one
// connection instead of opening a new one per request (avoids connection storms).
function getClient() {
    if (!globalThis.__mongoClientPromise) {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI not set');
        // Fail fast: a serverless function has ~10s total, so a blocked connection
        // must give up well before that and let us still return the pixel.
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

export async function getCollection() {
    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    if (!indexesEnsured) {
        indexesEnsured = true;
        try {
            // Query by playable, and reconcile against the primary DB by the
            // natural key (uid + t + event).
            await col.createIndex({ uid: 1, receivedAt: -1 });
            await col.createIndex({ e: 1 });
            await col.createIndex({ uid: 1, t: 1, e: 1 });
        } catch {
            indexesEnsured = false; // let a later call retry
        }
    }
    return col;
}

export async function closeClient() {
    if (globalThis.__mongoClient) {
        await globalThis.__mongoClient.close();
        globalThis.__mongoClient = null;
        globalThis.__mongoClientPromise = null;
    }
}

export function buildDoc(query, ip, ua) {
    const doc = {
        e:     query.e     != null ? clip(query.e)     : 'unknown',
        t:     Number(Array.isArray(query.t) ? query.t[0] : query.t) || 0,
        uid:   query.uid   != null ? clip(query.uid)   : 'unknown',
        net:   query.net   != null ? clip(query.net)   : 'unknown',
        os:    query.os    != null ? clip(query.os)    : 'unknown',
        model: query.model != null ? clip(query.model) : 'unknown',
        // server-side context (never trust the client for these)
        receivedAt: new Date(),
        ip: (ip || '').toString().split(',')[0].trim(),
        ua: clip(ua || ''),
    };

    const extra = {};
    let count = 0;
    for (const [k, val] of Object.entries(query)) {
        if (KNOWN_FIELDS.includes(k)) continue;
        if (count++ >= MAX_EXTRA) break;
        extra[clip(k)] = clip(val);
    }
    if (count > 0) doc.extra = extra;

    return doc;
}
