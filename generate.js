#!/usr/bin/env node
/**
 * Brain (try4ever.com) static site generator — zero dependencies, Node >= 16.
 *
 * Architecture: every route on https://try4ever.com is a REAL static file, so
 * GitHub Pages serves it with HTTP 200 and crawlers can index it. The only
 * file ever served with an error status is 404.html, which GitHub Pages
 * returns (with the custom design) for genuinely unknown URLs.
 *
 * Inputs:
 *   site/layout.html        shared page shell (head, nav, footer, styles, JS)
 *   site/pages/*.html       main-content fragment per static page
 *   blog-posts/post*.js     blog data files (window.blogPosts.push({...}))
 *
 * Outputs (repo root — deploy directory for GitHub Pages, branch: main):
 *   index.html, how/, features/, about/, faq/, terms/, privacy/, refund/,
 *   blog/, blog/<slug>/, 404.html, sitemap.xml, robots.txt, .nojekyll
 *
 * Usage:  node generate.js
 * After editing any file in site/ or blog-posts/, re-run and commit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const SITE = 'https://try4ever.com';
const TODAY = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function write(p, content) {
    const abs = path.join(ROOT, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
}
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function fail(msg) { console.error('BUILD ERROR: ' + msg); process.exit(1); }

// ---------------------------------------------------------------------------
// Load blog posts from blog-posts/post*.js  (single source of truth)
// ---------------------------------------------------------------------------
function loadPosts() {
    const dir = path.join(ROOT, 'blog-posts');
    const files = fs.readdirSync(dir)
        .filter(f => /^post\d+\.js$/i.test(f))
        .sort((a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0));
    const posts = [];
    for (const f of files) {
        const sandbox = { window: {} };
        try {
            vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
        } catch (e) { fail('blog-posts/' + f + ' threw: ' + e.message); }
        const arr = sandbox.window.blogPosts || [];
        const newOnes = arr;
        if (newOnes.length === 0) fail('blog-posts/' + f + ' pushed no new post(s)');
        for (const p of newOnes) {
            for (const k of ['title', 'date', 'slug', 'excerpt', 'body']) {
                if (!p || !p[k]) fail('blog-posts/' + f + ': post missing field "' + k + '"');
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) fail('blog-posts/' + f + ': bad date "' + p.date + '" (expected YYYY-MM-DD)');
            if (!/^[a-z0-9-]+$/.test(p.slug)) fail('blog-posts/' + f + ': bad slug "' + p.slug + '" (lowercase letters, digits, dashes)');
        }
        posts.push(...newOnes.map(p => ({ file: f, title: p.title, date: p.date, slug: p.slug, tags: Array.isArray(p.tags) ? p.tags : [], excerpt: p.excerpt, body: p.body })));
    }
    const seen = new Set();
    for (const p of posts) {
        if (seen.has(p.slug)) fail('duplicate slug "' + p.slug + '"');
        seen.add(p.slug);
    }
    // Newest first; stable (same-date posts keep reverse-file order, i.e. newest additions first)
    return posts.slice().reverse().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Per-page metadata (title / description / structured data)
// ---------------------------------------------------------------------------
// Official brand profiles — Google uses sameAs to link these entities to the
// try4ever brand in search. Every profile links back to try4ever.com in its bio.
// Ordered by approximate daily active users (largest reach first); this order
// is also used for the visible footer links so crawlers weight them the same way.
const SOCIAL_PROFILES = [
    { u: 'https://www.facebook.com/profile.php?id=61595619313031', n: 'Facebook' },    // ~3.07B DAU
    { u: 'https://www.youtube.com/@try4ever_com',                  n: 'YouTube' },    // ~2.5B logged-in daily reach
    { u: 'https://www.instagram.com/try4ever_com/',                n: 'Instagram' },  // ~2.0B DAU
    { u: 'https://x.com/try4everCom',                              n: 'X (Twitter)' },// ~250M DAU
    { u: 'https://www.reddit.com/user/try4ever_com',               n: 'Reddit' },     // ~120M DAU
    { u: 'https://www.linkedin.com/company/143919630/',            n: 'LinkedIn' },   // ~110M DAU
    { u: 'https://t.me/try4ever_com',                              n: 'Telegram' },   // ~100M+ DAU
    { u: 'https://www.threads.com/@try4ever_com',                  n: 'Threads' },    // ~100M DAU
    { u: 'https://www.pinterest.com/try4evercom/',                 n: 'Pinterest' },  // ~90M DAU
    { u: 'https://vk.ru/id1101212552',                             n: 'VK' },         // ~50M DAU
    { u: 'https://vkvideo.ru/@club242546823',                      n: 'VK Video' },   // VK ecosystem
    { u: 'https://ok.ru/profile/910712328823',                     n: 'OK.ru' },      // ~40M DAU
    { u: 'https://www.twitch.tv/try4ever_com',                     n: 'Twitch' },     // ~35M DAU
    { u: 'https://www.dailymotion.com/user/try4ever',              n: 'Dailymotion' },// ~25M DAU
    { u: 'https://www.tumblr.com/try4ever-com',                    n: 'Tumblr' },     // ~12M DAU
    { u: 'https://rumble.com/user/try4ever_com',                   n: 'Rumble' },     // ~8M
    { u: 'https://bsky.app/profile/try4ever.bsky.social',          n: 'Bluesky' },    // ~8M
    { u: 'https://vimeo.com/try4ever',                             n: 'Vimeo' },      // ~5M
    { u: 'https://kick.com/tryever',                               n: 'Kick' },       // ~4M
    { u: 'https://odysee.com/@try4ever',                           n: 'Odysee' },     // ~1.5M
];
const SOCIAL_SAMEAS = SOCIAL_PROFILES.map(p => p.u);

// Footer icon bar: inline SVG (no external requests — keeps the privacy claim
// intact). Recognizable brand glyphs where well-known, clean monograms for the
// rest, all in the same DAU order as the JSON-LD sameAs array.
const BRAND_PATHS = {
    'Facebook': 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
    'YouTube': 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    'Instagram': 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
    'X (Twitter)': 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    'Reddit': 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
    'LinkedIn': 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z',
    'Telegram': 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
    'Threads': 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z',
    'Pinterest': 'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z',
    'Twitch': 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z',
    'Tumblr': 'M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.195 1.936-.4l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.003z',
    'Bluesky': 'M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z',
    'Vimeo': 'M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.48 4.797z',
};
// Monogram fallback for platforms without a confident brand path
const MONOGRAM = { 'VK': 'VK', 'VK Video': '▶', 'OK.ru': 'OK', 'Dailymotion': 'd', 'Rumble': 'R', 'Kick': 'K', 'Odysee': 'O' };
function socialIconSvg(name) {
    if (BRAND_PATHS[name]) return '<svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false"><path d="' + BRAND_PATHS[name] + '"/></svg>';
    const ch = MONOGRAM[name] || name.charAt(0);
    return '<svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false" class="mono"><text x="12" y="16.5" text-anchor="middle">' + esc(ch) + '</text></svg>';
}
// Visible footer icon bar (crawlable, plain HTML): real outbound links to each
// profile with accessible names, strongest platform first.
const SOCIAL_LINKS_HTML = '<div class="social-links" aria-label="Official try4ever profiles">' +
    '<span class="social-label">Find us:</span>' +
    SOCIAL_PROFILES.map(p =>
        '<a class="soc" href="' + p.u + '" target="_blank" rel="noopener" aria-label="try4ever on ' + esc(p.n) + '" title="try4ever on ' + esc(p.n) + '">' + socialIconSvg(p.n) + '</a>'
    ).join('') +
    '</div>';

const FAQ_JSONLD = `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "Is Brain made for a specific exam?",
          "acceptedAnswer": { "@type": "Answer", "text": "No. Brain works for anything you study: USMLE, MCAT, history, programming, law, languages – any material you can put in a PDF, DOCX, TXT or EPUB file." } },
        { "@type": "Question", "name": "Is my data safe?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. Your files are processed on your device and everything you create is stored in your own browser (IndexedDB). There is no cloud copy, no account database and no tracking. Clearing your browser storage deletes your data – it belongs to you." } },
        { "@type": "Question", "name": "Is Brain free?",
          "acceptedAnswer": { "@type": "Answer", "text": "There is a $0/month plan. It requires a short application – email support@try4ever.com with what you're studying – and approval. The paid plan is $19/month and activates instantly. Every new account also gets a 7-day free trial of the full product: no card required and it does not auto-convert." } },
        { "@type": "Question", "name": "Can I get a refund?",
          "acceptedAnswer": { "@type": "Answer", "text": "Paid periods are all sales final – the 7-day no-card trial exists so you can try everything before paying. If you were charged twice or charged in error, contact support@try4ever.com and we will fix billing mistakes. You can cancel in one click at any time and keep access until the end of the period you already paid for." } },
        { "@type": "Question", "name": "Who builds Brain?",
          "acceptedAnswer": { "@type": "Answer", "text": "Brain is built and operated by try4ever, an independent solo software project based in Arizona, USA. Questions or issues: support@try4ever.com – we answer within 5 business days." } },
        { "@type": "Question", "name": "How are payments handled?",
          "acceptedAnswer": { "@type": "Answer", "text": "Payments are processed by Stripe in USD. We never see or store your card details – Stripe handles the transaction on their certified infrastructure." } },
        { "@type": "Question", "name": "What file types does Brain work with?",
          "acceptedAnswer": { "@type": "Answer", "text": "PDF, DOCX, TXT and EPUB. Scanned PDFs are OCR-processed on your device (first 10 pages), and images, slides, spreadsheets and other documents are extracted locally as well." } }
      ]
    }
    </script>`;

const HOME_JSONLD = `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Brain",
      "alternateName": "Brain study tool",
      "url": "https://try4ever.com/",
      "publisher": { "@id": "https://try4ever.com/#org" }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://try4ever.com/#org",
      "name": "try4ever",
      "description": "Independent solo software project based in Arizona, USA, building the Brain study tool.",
      "url": "https://try4ever.com/",
      "email": "support@try4ever.com",
      "logo": "https://try4ever.com/og-image.png",
      "sameAs": [
${SOCIAL_SAMEAS.map(u => '        "' + u + '"').join(',\n')}
      ],
      "address": { "@type": "PostalAddress", "addressRegion": "Arizona", "addressCountry": "US" }
    }
    </script>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Brain",
      "applicationCategory": "EducationalApplication",
      "operatingSystem": "Web browser",
      "url": "https://try4ever.com/",
      "description": "Brain turns PDFs, DOCX, TXT and EPUB files into a 3D knowledge map. Study, quiz yourself, and track mastery with color-coded topics. Files are processed on your device and never uploaded.",
      "featureList": "3D knowledge map, color-coded mastery tracking, quiz and fill-in-the-blank generation, works offline, on-device file processing, PDF/DOCX/TXT/EPUB support",
      "offers": [
        { "@type": "Offer", "name": "Free plan", "price": "0", "priceCurrency": "USD", "description": "Application-based free access. Apply via email at support@try4ever.com." },
        { "@type": "Offer", "name": "Instant monthly plan", "price": "19", "priceCurrency": "USD", "description": "Instant activation. 7-day free trial with no card required; trial does not auto-convert." }
      ],
      "publisher": { "@id": "https://try4ever.com/#org" }
    }
    </script>`;

const PAGES = [
    { route: 'home',     path: '/',        title: 'Brain – Turn PDFs & Notes Into a 3D Study Map', desc: 'Turn PDFs & notes into a 3D knowledge map you can study from. 7-day trial, no card. Free plan by application; $19/mo instant. Files never leave your device.', jsonld: HOME_JSONLD, nav: null },
    { route: 'how',      path: '/how/',    title: 'How Brain Works – From Upload to 3D Knowledge Map', desc: 'Upload a PDF, DOCX, TXT or EPUB, watch it become a 3D graph of topics, quiz yourself, and track mastery from red to green. On-device processing, step by step.', jsonld: '', nav: 'how' },
    { route: 'features', path: '/features/', title: 'Features – 3D Map, Mastery Tracking, Quizzes, Offline', desc: 'A 3D knowledge map, color-coded mastery, quiz generation, offline mode and on-device file processing. Everything runs in your browser – no cloud, no tracking.', jsonld: '', nav: 'features' },
    { route: 'about',    path: '/about/',  title: 'About Brain – Built by try4ever, Arizona USA', desc: 'Brain is a solo-built study tool by try4ever, an independent project in Arizona, USA. Private by design: files are processed on your device. Contact support@try4ever.com.', jsonld: '', nav: 'about' },
    { route: 'faq',      path: '/faq/',    title: 'FAQ – Brain Study Tool', desc: 'Answers about pricing (free plan by application, $19/mo, 7-day no-card trial), refunds, data privacy, file types, and who builds Brain.', jsonld: FAQ_JSONLD, nav: 'faq' },
    { route: 'terms',    path: '/terms/',  title: 'Terms of Service – Brain', desc: 'The agreement between you and try4ever for using Brain: plans and billing, cancellation, refunds, acceptable use, governing law (Arizona, USA). Effective September 20, 2026.', jsonld: '', nav: null },
    { route: 'privacy',  path: '/privacy/', title: 'Privacy Policy – Brain', desc: 'Your study material never leaves your device. No analytics, no trackers, no account database. What can leave your device, only by your action.', jsonld: '', nav: null },
    { route: 'refund',   path: '/refund/', title: 'Refund & Cancellation Policy – Brain', desc: 'Cancel in one click anytime and keep access until your paid period ends. 7-day free trial with no card. All sales final except our own billing errors.', jsonld: '', nav: null },
];

// ---------------------------------------------------------------------------
// Render one page through the layout
// ---------------------------------------------------------------------------
const LAYOUT = read('site/layout.html');

function render({ content, title, desc, url, robots, ogType, ogExtra, jsonld, nav }) {
    const tokens = { A_HOW: '', A_FEATURES: '', A_ABOUT: '', A_FAQ: '', A_BLOG: '' };
    if (nav && tokens['A_' + nav.toUpperCase()] !== undefined) tokens['A_' + nav.toUpperCase()] = ' class="active" aria-current="page"';
    let html = LAYOUT;
    const sub = (token, value) => { html = html.replaceAll(token, () => value); };
    sub('{{CONTENT}}', content);
    sub('{{TITLE}}', esc(title));
    sub('{{DESC}}', esc(desc));
    sub('{{ROBOTS}}', robots);
    sub('{{EXTRA_HEAD}}', (url ? '    <link rel="canonical" href="' + esc(url) + '">\n' : '') + (jsonld ? jsonld + '\n' : ''));
    sub('{{OG_TYPE}}', ogType);
    sub('{{URL}}', esc(url || SITE + '/'));
    sub('{{OG_EXTRA}}', ogExtra || '');
    sub('{{A_HOW}}', tokens.A_HOW);
    sub('{{A_FEATURES}}', tokens.A_FEATURES);
    sub('{{A_ABOUT}}', tokens.A_ABOUT);
    sub('{{A_FAQ}}', tokens.A_FAQ);
    sub('{{A_BLOG}}', tokens.A_BLOG);
    sub('{{SOCIAL_LINKS}}', SOCIAL_LINKS_HTML);
    if (/\{\{[A-Z_]+\}\}/.test(html)) fail('unreplaced placeholder in output for ' + url);
    return html;
}

// ---------------------------------------------------------------------------
// Build static pages
// ---------------------------------------------------------------------------
function buildStaticPages() {
    for (const p of PAGES) {
        const fragPath = 'site/pages/' + p.route + '.html';
        if (!fs.existsSync(path.join(ROOT, fragPath))) fail('missing fragment: ' + fragPath);
        const html = render({
            content: read(fragPath),
            title: p.title, desc: p.desc, url: SITE + p.path,
            robots: 'index, follow, max-image-preview:large',
            ogType: 'website', jsonld: p.jsonld, nav: p.nav,
        });
        const outPath = p.route === 'home' ? 'index.html' : p.path.replace(/^\//, '').replace(/\/$/, '') + '/index.html';
        write(outPath, html);
        console.log('  ✓', p.path.padEnd(12), '->', outPath);
    }
}

// ---------------------------------------------------------------------------
// Build blog index + post pages
// ---------------------------------------------------------------------------
function buildBlog(posts) {
    // Blog index
    const items = posts.map(p =>
        '            <li>\n' +
        '                <a href="/blog/' + p.slug + '/">' + esc(p.title) + '</a>\n' +
        '                <div class="post-meta">' + esc(p.date) + ' · ' + esc(p.tags.join(', ')) + '</div>\n' +
        '                <div class="post-excerpt">' + esc(p.excerpt) + '</div>\n' +
        '            </li>').join('\n');

    const blogJsonld = `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "Brain Blog",
      "url": "https://try4ever.com/blog/",
      "description": "Notes on studying, memory and building Brain – a 3D knowledge map tool for students.",
      "publisher": { "@id": "https://try4ever.com/#org" },
      "blogPost": [
${posts.map(p => '        { "@type": "BlogPosting", "headline": ' + JSON.stringify(p.title) + ', "url": "' + SITE + '/blog/' + p.slug + '/", "datePublished": "' + p.date + '" }').join(',\n')}
      ]
    }
    </script>`;

    write('blog/index.html', render({
        content: '<div class="section">\n    <h1 class="page-title">Blog</h1>\n    <p>Notes on studying, memory and building Brain – a 3D knowledge map tool for students.</p>\n    <ul class="post-list">\n' + items + '\n    </ul>\n</div>',
        title: 'Blog – Brain Study Tool',
        desc: 'Notes on studying, memory and building Brain – a 3D knowledge map tool for students.',
        url: SITE + '/blog/',
        robots: 'index, follow, max-image-preview:large',
        ogType: 'website', jsonld: blogJsonld, nav: 'blog',
    }));
    console.log('  ✓', '/blog/'.padEnd(12), '-> blog/index.html (' + posts.length + ' posts)');

    // Post pages
    for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const newer = i > 0 ? posts[i - 1] : null;   // published more recently
        const older = i < posts.length - 1 ? posts[i + 1] : null;

        const tagsHtml = p.tags.map(t => '<span class="tag-chip">' + esc(t) + '</span>').join('');
        const navBits = [];
        if (older) navBits.push('<a href="/blog/' + older.slug + '/" rel="prev">← Older: ' + esc(older.title) + '</a>');
        if (newer) navBits.push('<span class="spacer"></span>');
        if (newer) navBits.push('<a href="/blog/' + newer.slug + '/" rel="next">Newer: ' + esc(newer.title) + ' →</a>');

        const content =
            '<div class="section">\n' +
            '    <a class="back-link" href="/blog/">← Back to blog</a>\n' +
            '    <article>\n' +
            '        <h1 class="post-title">' + esc(p.title) + '</h1>\n' +
            '        <div class="post-meta-line">' + esc(p.date) + ' · <em>by try4ever</em></div>\n' +
            '        <div class="post-meta-line">' + tagsHtml + '</div>\n' +
            '        <div class="post-content">\n' + p.body + '\n        </div>\n' +
            '    </article>\n' +
            (navBits.length ? '    <nav class="post-nav" aria-label="Post navigation">' + navBits.join('') + '</nav>\n' : '') +
            '</div>';

        const jsonld = `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": ${JSON.stringify(p.title)},
      "description": ${JSON.stringify(p.excerpt)},
      "image": "https://try4ever.com/og-image.png",
      "datePublished": "${p.date}",
      "dateModified": "${p.date}",
      "keywords": ${JSON.stringify(p.tags.join(', '))},
      "author": { "@type": "Organization", "name": "try4ever", "url": "https://try4ever.com/" },
      "publisher": { "@type": "Organization", "name": "try4ever", "url": "https://try4ever.com/" },
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${SITE}/blog/${p.slug}/" }
    }
    </script>`;

        write('blog/' + p.slug + '/index.html', render({
            content,
            title: p.title + ' – Brain Blog',
            desc: p.excerpt,
            url: SITE + '/blog/' + p.slug + '/',
            robots: 'index, follow, max-image-preview:large',
            ogType: 'article',
            ogExtra: '    <meta property="article:published_time" content="' + p.date + '">',
            jsonld, nav: 'blog',
        }));
        console.log('  ✓', ('/blog/' + p.slug + '/').padEnd(12), '-> blog/' + p.slug + '/index.html');
    }
}

// ---------------------------------------------------------------------------
// Build 404 page (GitHub Pages serves this — with HTTP 404 — for unknown URLs)
// Enhanced with a smart recovery engine: the full site index is embedded at
// build time so visitors get exact-match redirects and fuzzy "did you mean"
// suggestions, while crawlers still see a truthful 404 status.
// ---------------------------------------------------------------------------
function build404(posts) {
    const siteIndex = [];
    for (const p of PAGES) siteIndex.push({ u: p.path, t: p.title });
    siteIndex.push({ u: '/blog/', t: 'Blog – Brain Study Tool' });
    for (const p of posts) siteIndex.push({ u: '/blog/' + p.slug + '/', t: p.title });

    const recoverySrc = read('site/404-recovery.js');
    const recent = posts.slice(0, 3).map(p =>
        '<a href="/blog/' + p.slug + '/">' + esc(p.title) + '</a>').join(' · ');

    const content =
        '<div class="section">\n' +
        '    <div class="error-code" aria-hidden="true">404</div>\n' +
        '    <h1 class="page-title">Page not found</h1>\n' +
        '    <p>This page drifted out of orbit — the link may be outdated, mistyped, or the page may have moved.</p>\n' +
        '    <div id="recovery" class="recovery-box" hidden></div>\n' +
        '    <p id="countdownLine" class="countdown-line" hidden><span id="countdownText"></span><button id="cancelBtn" type="button">Cancel</button></p>\n' +
        '    <p><a class="btn" href="/">Go home</a> <a class="btn-ghost" href="/blog/">Read the blog</a></p>\n' +
        '    <p>Popular pages: <a href="/how/">How it works</a> · <a href="/features/">Features</a> · <a href="/faq/">FAQ</a> · <a href="/about/">About</a></p>\n' +
        '    <p>Recent posts: ' + recent + '</p>\n' +
        '    <p>Looking for the study tool? <a href="https://brain.try4ever.com" target="_blank" rel="noopener">Open the app</a> · Questions: <a href="mailto:support@try4ever.com">support@try4ever.com</a></p>\n' +
        '    <script>window.__SITE_INDEX__ = ' + JSON.stringify(siteIndex) + ';</script>\n' +
        '    <script>\n' + recoverySrc + '\n    </script>\n' +
        '</div>';
    write('404.html', render({
        content,
        title: 'Page not found (404) – Brain',
        desc: 'That page does not exist on try4ever.com. Head back home, read the blog, or open the Brain study app.',
        url: '', // no canonical: this is an error page, not a content page
        robots: 'noindex, follow',
        ogType: 'website', jsonld: '', nav: null,
    }));
    console.log('  ✓', '/<unknown> '.padEnd(12), '-> 404.html (smart recovery, served with HTTP 404, site index: ' + siteIndex.length + ' entries)');
}

// ---------------------------------------------------------------------------
// sitemap.xml + robots.txt + .nojekyll
// ---------------------------------------------------------------------------
function buildMeta(posts) {
    const urls = [];
    for (const p of PAGES) urls.push({ loc: SITE + p.path, lastmod: TODAY });
    urls.push({ loc: SITE + '/blog/', lastmod: TODAY });
    for (const p of posts) urls.push({ loc: SITE + '/blog/' + p.slug + '/', lastmod: p.date });

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        urls.map(u => '    <url><loc>' + u.loc + '</loc><lastmod>' + u.lastmod + '</lastmod></url>').join('\n') +
        '\n</urlset>\n';
    write('sitemap.xml', xml);

    write('robots.txt',
        'User-agent: *\n' +
        'Allow: /\n\n' +
        'Sitemap: ' + SITE + '/sitemap.xml\n');

    // favicon.ico — many scanners and crawlers still request /favicon.ico by
    // name. Reuse the 32x32 PNG data-URI already declared in the layout so the
    // icon exists in exactly one place.
    const m = LAYOUT.match(/rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,([^"]+)"/);
    if (!m) fail('layout: 32x32 PNG favicon data-URI not found');
    fs.writeFileSync(path.join(ROOT, 'favicon.ico'), Buffer.from(m[1], 'base64'));

    // .well-known/security.txt (RFC 9116) — trust/security graders and
    // researchers look for this to confirm an accountable operator exists.
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    write('.well-known/security.txt',
        'Contact: mailto:support@try4ever.com\n' +
        'Expires: ' + expiry + '\n' +
        'Preferred-Languages: en\n' +
        'Canonical: ' + SITE + '/.well-known/security.txt\n');

    // llms.txt — emerging standard AI agents fetch to discover a site's
    // authoritative pages in one request.
    const lines = [
        '# Brain (try4ever.com)',
        '',
        'Brain is a study tool by try4ever that turns PDFs, DOCX, TXT and EPUB files into an interactive 3D knowledge map in the browser. Files are processed entirely on the user\'s device — no upload, no account database, no tracking. Free plan by application ($0/mo), paid plan $19/mo, 7-day no-card trial. App lives at https://brain.try4ever.com.',
        '',
        '## Pages',
        '',
    ];
    for (const p of PAGES) lines.push('- [' + p.title + '](' + SITE + p.path + '): ' + p.desc);
    lines.push('- [Blog – Brain Study Tool](' + SITE + '/blog/): Notes on studying, memory and building Brain.');
    for (const p of posts) lines.push('- [' + p.title + '](' + SITE + '/blog/' + p.slug + '/): ' + p.excerpt.replace(/\s+/g, ' ').trim());
    lines.push('', '## Official profiles', '',
        'try4ever maintains official profiles on these platforms (same accounts listed in the Organization sameAs markup):',
        '');
    for (const p of SOCIAL_PROFILES) lines.push('- ' + p.n + ': ' + p.u);
    lines.push('', '## Contact', '', '- Support: support@try4ever.com (answers within 5 business days)', '- Operator: try4ever, Arizona, USA', '');
    write('llms.txt', lines.join('\n'));

    write('.nojekyll', '');
    console.log('  ✓', 'sitemap.xml (' + urls.length + ' URLs), robots.txt, .nojekyll, favicon.ico, .well-known/security.txt, llms.txt');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('Brain static site generator');
const posts = loadPosts();
console.log('Loaded ' + posts.length + ' blog posts (newest: ' + posts[0].slug + ' ' + posts[0].date + ')');
console.log('Building pages:');
buildStaticPages();
buildBlog(posts);
build404(posts);
buildMeta(posts);
console.log('Done. Commit the repo root — GitHub Pages redeploys automatically on push to main.');
