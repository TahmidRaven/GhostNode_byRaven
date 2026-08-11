// Post shaping + validation helpers, kept out of the route handlers so the rules
// live in one place.

// Categories are NOT predefined — the admin types whatever they want (life,
// philosophy, games, "book reviews", ...). The home page builds its filter tabs
// from the categories that actually exist in the posts.
const MAX_CATEGORY = 40;
const MAX_TITLE = 200;
const MAX_EXCERPT = 400;
const MAX_CONTENT = 100_000; // ~100 KB of markdown per post
const MAX_TAGS = 12;

// Turn a title into a url-safe slug: "My First Post!" -> "my-first-post".
export function slugify(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')  // strip accents
        .replace(/[^a-z0-9]+/g, '-')      // non-alphanumerics -> dash
        .replace(/^-+|-+$/g, '')          // trim dashes
        .slice(0, 80) || 'post';
}

// Normalize a free-form category: trim, lowercase, collapse inner whitespace.
// Keeps it consistent so "Games", "games " and "games" all group together.
export function normalizeCategory(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .slice(0, MAX_CATEGORY);
}

function cleanTags(tags) {
    if (!Array.isArray(tags)) {
        tags = typeof tags === 'string' ? tags.split(',') : [];
    }
    return [...new Set(
        tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean),
    )].slice(0, MAX_TAGS);
}

// Validate + normalize an incoming post body. Returns { post } or { error }.
// `partial` allows update payloads to omit fields.
export function normalizePost(input = {}, { partial = false } = {}) {
    const out = {};

    if (input.title !== undefined || !partial) {
        const title = String(input.title || '').trim();
        if (!title) return { error: 'title is required' };
        if (title.length > MAX_TITLE) return { error: 'title too long' };
        out.title = title;
    }

    if (input.category !== undefined || !partial) {
        const category = normalizeCategory(input.category);
        if (!category) return { error: 'category is required' };
        out.category = category;
    }

    if (input.content !== undefined || !partial) {
        const content = String(input.content || '');
        if (content.length > MAX_CONTENT) return { error: 'content too long' };
        out.content = content;
    }

    if (input.excerpt !== undefined) {
        out.excerpt = String(input.excerpt || '').trim().slice(0, MAX_EXCERPT);
    }

    if (input.tags !== undefined) {
        out.tags = cleanTags(input.tags);
    }

    if (input.published !== undefined) {
        out.published = Boolean(input.published);
    }

    if (input.coverImageId !== undefined) {
        // Stored as a string id or null; validated against Mongo when it matters.
        out.coverImageId = input.coverImageId ? String(input.coverImageId) : null;
    }

    return { post: out };
}

// Auto-build an excerpt from the markdown body when the author didn't write one.
export function autoExcerpt(content) {
    return String(content || '')
        .replace(/[#>*_`~\-!\[\]()]/g, ' ')  // drop common markdown punctuation
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}
