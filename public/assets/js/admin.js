import { api, esc, fmtDate, toast } from './ghost.js';

// Admin panel: login, dashboard, and the post editor (with in-browser image
// compression before upload).

const $ = (id) => document.getElementById(id);
const views = { login: $('login-view'), dash: $('dash-view'), editor: $('editor-view') };

function show(name) {
    for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
    $('logout').hidden = name === 'login';
    window.scrollTo(0, 0);
}

// ---- auth ------------------------------------------------------------------

async function boot() {
    try {
        const me = await api('/api/auth/me');
        if (me.loggedIn) { show('dash'); loadDashboard(); }
        else show('login');
    } catch { show('login'); }
}

$('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await api('/api/auth/login', {
            method: 'POST',
            body: { username: $('u').value, password: $('p').value },
        });
        $('p').value = '';
        toast('access granted');
        show('dash');
        loadDashboard();
    } catch (err) {
        toast(err.status === 401 ? 'access denied' : err.message, true);
    }
});

$('logout').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    toast('logged out');
    show('login');
});

// ---- dashboard -------------------------------------------------------------

async function loadDashboard() {
    const list = $('admin-list');
    list.innerHTML = `<div class="empty">loading<span class="loading"></span></div>`;
    try {
        const { posts } = await api('/api/posts?all=1');
        if (!posts.length) {
            list.innerHTML = `<div class="empty">no posts yet. hit <b>+ new post</b>.</div>`;
            return;
        }
        list.innerHTML = '';
        for (const p of posts) {
            const row = document.createElement('div');
            row.className = 'admin-row';
            row.innerHTML = `
              <div>
                <div class="title">${esc(p.title)}
                  ${p.published ? '' : '<span class="badge draft">draft</span>'}</div>
                <div class="sub">${esc(p.category)} &middot; ${esc(fmtDate(p.createdAt))} &middot; /${esc(p.slug)}</div>
              </div>
              <div class="actions">
                <button class="btn ghost" data-edit="${esc(p.slug)}">edit</button>
                <button class="btn danger" data-del="${esc(p.slug)}">del</button>
              </div>`;
            list.appendChild(row);
        }
        list.querySelectorAll('[data-edit]').forEach((b) =>
            b.addEventListener('click', () => openEditor(b.dataset.edit)));
        list.querySelectorAll('[data-del]').forEach((b) =>
            b.addEventListener('click', () => removePost(b.dataset.del)));
    } catch (err) {
        list.innerHTML = `<div class="empty">failed: ${esc(err.message)}</div>`;
    }
}

$('new-post').addEventListener('click', () => openEditor(null));
$('back-dash').addEventListener('click', () => { show('dash'); loadDashboard(); });

async function removePost(slug) {
    if (!confirm(`Delete "${slug}"? This cannot be undone.`)) return;
    try {
        await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        toast('post deleted');
        loadDashboard();
    } catch (err) {
        toast(err.message, true);
    }
}

// ---- editor ----------------------------------------------------------------

function setCover(id, url, bytes) {
    $('cover-id').value = id || '';
    const prev = $('cover-preview');
    if (url) {
        prev.src = url; prev.style.display = 'block';
        $('clear-cover').hidden = false;
        $('cover-info').textContent = bytes ? `${(bytes / 1024).toFixed(0)} KB` : '';
    } else {
        prev.src = ''; prev.style.display = 'none';
        $('clear-cover').hidden = true;
        $('cover-info').textContent = '';
    }
}

async function openEditor(slug) {
    $('post-form').reset();
    setCover(null);
    $('preview').hidden = true;
    $('edit-slug').value = '';

    if (slug) {
        try {
            const { post } = await api(`/api/posts/${encodeURIComponent(slug)}`);
            $('edit-slug').value = post.slug;
            $('title').value = post.title;
            $('category').value = post.category;
            $('tags').value = (post.tags || []).join(', ');
            $('excerpt').value = post.excerpt || '';
            $('content').value = post.content || '';
            $('published').checked = post.published !== false;
            if (post.coverImageId) setCover(post.coverImageId, post.coverUrl);
            $('editor-title').textContent = 'EDIT';
            $('delete-btn').hidden = false;
        } catch (err) {
            toast(err.message, true);
            return;
        }
    } else {
        $('editor-title').textContent = 'COMPOSE';
        $('delete-btn').hidden = true;
    }
    show('editor');
    $('title').focus();
}

$('post-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const slug = $('edit-slug').value;
    const body = {
        title: $('title').value,
        category: $('category').value,
        tags: $('tags').value,
        excerpt: $('excerpt').value,
        content: $('content').value,
        published: $('published').checked,
        coverImageId: $('cover-id').value || null,
    };
    const btn = $('save-btn');
    btn.disabled = true;
    try {
        if (slug) {
            await api(`/api/posts/${encodeURIComponent(slug)}`, { method: 'PUT', body });
            toast('post updated');
        } else {
            await api('/api/posts', { method: 'POST', body });
            toast('post published');
        }
        show('dash');
        loadDashboard();
    } catch (err) {
        toast(err.message, true);
    } finally {
        btn.disabled = false;
    }
});

$('delete-btn').addEventListener('click', () => {
    const slug = $('edit-slug').value;
    if (slug) removePost(slug);
});

// ---- image squoosh (in-browser compression) --------------------------------

function loadImage(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error('could not read image'));
        img.src = src;
    });
}

// Downscale to <= maxDim on the long edge and re-encode to WebP. This is the
// "squoosh" — a 4 MB phone photo comes out ~40-150 KB with no visible loss.
async function squoosh(file, maxDim = 1600, quality = 0.72) {
    const url = URL.createObjectURL(file);
    try {
        const img = await loadImage(url);
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL('image/webp', quality);
        // Safari <16 ignores webp and hands back a PNG — fall back to JPEG so the
        // upload still shrinks.
        if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        return { dataUrl, width: w, height: h };
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function uploadImage(file) {
    const { dataUrl, width, height } = await squoosh(file);
    const { url, id, bytes } = await api('/api/images', {
        method: 'POST', body: { dataUrl, width, height },
    });
    return { id, url, bytes };
}

// The hidden file input is shared; `fileMode` says who asked for it.
let fileMode = 'cover';
const fileInput = $('file-input');

$('pick-cover').addEventListener('click', () => { fileMode = 'cover'; fileInput.click(); });
$('insert-image').addEventListener('click', () => { fileMode = 'inline'; fileInput.click(); });
$('clear-cover').addEventListener('click', () => setCover(null));

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    toast('compressing…');
    try {
        const { id, url, bytes } = await uploadImage(file);
        if (fileMode === 'cover') {
            setCover(id, url, bytes);
            toast(`cover set · ${(bytes / 1024).toFixed(0)} KB`);
        } else {
            const ta = $('content');
            const s = ta.selectionStart ?? ta.value.length;
            const md = `\n![](${url})\n`;
            ta.value = ta.value.slice(0, s) + md + ta.value.slice(ta.selectionEnd ?? s);
            ta.focus();
            toast(`image inserted · ${(bytes / 1024).toFixed(0)} KB`);
        }
    } catch (err) {
        toast(err.message, true);
    }
});

// ---- tiny markdown preview (approximate; the server render is authoritative)-

function mdPreview(src) {
    let h = esc(src);
    h = h.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
         .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
         .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
         .replace(/^### (.*)$/gm, '<h3>$1</h3>')
         .replace(/^## (.*)$/gm, '<h2>$1</h2>')
         .replace(/^# (.*)$/gm, '<h1>$1</h1>');
    h = h.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" />');
    h = h.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    h = h.replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    h = h.split(/\n{2,}/).map((block) =>
        /^\s*<(h\d|ul|blockquote|img|pre)/.test(block.trim())
            ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('\n');
    return h;
}

$('toggle-preview').addEventListener('click', () => {
    const pv = $('preview');
    pv.hidden = !pv.hidden;
    if (!pv.hidden) pv.innerHTML = mdPreview($('content').value);
});

boot();
