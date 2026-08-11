import crypto from 'node:crypto';

// Tiny stateless auth: a login cookie carrying an HMAC-signed token. No database
// sessions, no auth library — fine for a single-admin blog. The admin username
// and password live in the environment (.env locally, Vercel dashboard in prod).

const COOKIE_NAME = 'gn_session';
const MAX_AGE_SEC = 7 * 24 * 60 * 60; // 7 days

function secret() {
    return process.env.SESSION_SECRET || 'dev-insecure-secret-change-me';
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Constant-time string compare that never throws on length mismatch.
function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

// True when the submitted username + password match the env credentials.
export function checkLogin(username, password) {
    const u = process.env.ADMIN_USER || '';
    const p = process.env.ADMIN_PASS || '';
    // Compare both fields even if the username is wrong (avoid early-exit timing).
    const okUser = safeEqual(username, u);
    const okPass = safeEqual(password, p);
    return okUser && okPass;
}

// token = base64url(payloadJSON).base64url(hmac)
export function signSession(user) {
    const payload = { u: user, exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC };
    const body = b64url(JSON.stringify(payload));
    const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
    return `${body}.${sig}`;
}

export function verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
    if (!safeEqual(sig, expected)) return null;
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
}

// Minimal cookie-header parser (avoids a cookie-parser dependency).
function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

export function readSession(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    return verifySession(token);
}

export function setSessionCookie(res, token) {
    const prod = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const attrs = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${MAX_AGE_SEC}`,
    ];
    if (prod) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Express middleware: 401 unless a valid session cookie is present.
export function requireAuth(req, res, next) {
    const session = readSession(req);
    if (!session) return res.status(401).json({ error: 'unauthorized' });
    req.session = session;
    next();
}
