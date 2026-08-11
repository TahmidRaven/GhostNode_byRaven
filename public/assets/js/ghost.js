/* Shared front-end helpers for GhostNode: API calls, toasts, small effects. */

export const GHOST = [
    '    .-"""""-.',
    '   /  o   o  \\',
    '  |     ^     |',
    '  |   \\___/   |',
    '   \\_________/',
    '    ~ghostnode~',
].join('\n');

// Fetch JSON with cookies. Throws { status, message } on non-2xx.
export async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
        const err = new Error((data && data.error) || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Escape user/markdown text before dropping into innerHTML.
export function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

export function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(+d)) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

let toastTimer;
export function toast(msg, isError = false) {
    let el = document.querySelector('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.toggle('err', isError);
    // force reflow so re-triggering the transition works
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Type text into an element one character at a time, then run `done`.
export function typewriter(el, text, speed = 18, done) {
    el.textContent = '';
    let i = 0;
    (function tick() {
        if (i <= text.length) {
            el.textContent = text.slice(0, i++);
            setTimeout(tick, speed);
        } else if (done) {
            done();
        }
    })();
}
