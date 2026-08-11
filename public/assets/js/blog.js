import { api, esc, fmtDate, GHOST, HERO_ART, typewriter } from './ghost.js';

// Home page: boot animation, category tabs, and the post feed.

// Categories are discovered from the posts, not hardcoded.
let cats = ['all'];
let active = 'all';

function bootSequence() {
    const ghostEl = document.getElementById('ghost');
    if (ghostEl) ghostEl.textContent = HERO_ART;
    const boot = document.getElementById('boot');
    if (boot) {
        boot.classList.remove('loading');
        typewriter(boot, 'booting feed', 26);
    }
}

function renderCats() {
    const el = document.getElementById('cats');
    el.innerHTML = '';
    for (const c of cats) {
        const tab = document.createElement('button');
        tab.className = 'cat' + (c === active ? ' active' : '');
        tab.textContent = c;
        tab.onclick = () => { active = c; renderCats(); loadFeed(); };
        el.appendChild(tab);
    }
}

function cardHTML(p) {
    const cover = p.coverUrl
        ? `<img class="card-cover" src="${esc(p.coverUrl)}" alt="" loading="lazy" />` : '';
    const draft = p.published ? '' : '<span class="badge draft">draft</span>';
    const tags = (p.tags || []).slice(0, 5)
        .map((t) => `<span class="tag">${esc(t)}</span>`).join('');
    return `
      <a class="card" href="/post/${esc(p.slug)}">
        ${cover}
        <div class="card-body">
          <div class="card-meta">
            <span class="badge">${esc(p.category)}</span>
            ${draft}
            <span>${esc(fmtDate(p.createdAt))}</span>
          </div>
          <h2>${esc(p.title)}</h2>
          <p>${esc(p.excerpt || '')}</p>
          ${tags ? `<div class="tags">${tags}</div>` : ''}
        </div>
      </a>`;
}

async function loadFeed() {
    const feed = document.getElementById('feed');
    feed.innerHTML = `<div class="empty">loading<span class="loading"></span></div>`;
    try {
        const q = active === 'all' ? '' : `?category=${encodeURIComponent(active)}`;
        const { posts, categories } = await api(`/api/posts${q}`);
        // Refresh the tabs from whatever categories exist now.
        const next = ['all', ...(categories || [])];
        if (next.join('|') !== cats.join('|')) { cats = next; renderCats(); }
        if (!posts.length) {
            feed.innerHTML = `
              <div class="empty">
                <pre class="ghost-ascii">${esc(GHOST)}</pre>
                <p>no transmissions here yet.</p>
              </div>`;
            return;
        }
        feed.innerHTML = posts.map(cardHTML).join('');
    } catch (err) {
        feed.innerHTML = `<div class="empty">signal lost: ${esc(err.message)}</div>`;
    }
}

bootSequence();
renderCats();
loadFeed();
