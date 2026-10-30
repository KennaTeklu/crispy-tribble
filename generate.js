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
// Footer icon bar: self-hosted brand glyphs (all 20, learned from the
// custom-404-page about-row set) — zero CDN/external requests. Same DAU order
// as the JSON-LD sameAs array.
const ICON_PATHS = JSON.parse(read('site/icon-paths.json'));
function socialIconSvg(name) {
    const p = ICON_PATHS[name];
    if (!p) fail('no icon path for social platform "' + name + '"');
    return '<svg viewBox="0 0 24 24" role="img" aria-hidden="true" focusable="false"><path d="' + p + '"/></svg>';
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

    // RSS feed — Bing and other crawlers consume it for fresh-content discovery
    const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const feed = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0"><channel>\n' +
        '    <title>' + escXml('Brain Blog – try4ever.com') + '</title>\n' +
        '    <link>' + SITE + '/blog/</link>\n' +
        '    <description>' + escXml('Notes on studying, memory and building Brain – a 3D knowledge map tool for students.') + '</description>\n' +
        '    <language>en</language>\n' +
        posts.map(p =>
            '    <item><title>' + escXml(p.title) + '</title><link>' + SITE + '/blog/' + p.slug + '/</link>' +
            '<guid isPermaLink="true">' + SITE + '/blog/' + p.slug + '/</guid>' +
            '<pubDate>' + new Date(p.date + 'T12:00:00Z').toUTCString() + '</pubDate>' +
            '<description>' + escXml(p.excerpt) + '</description></item>').join('\n') +
        '\n</channel></rss>\n';
    write('feed.xml', feed);

    // IndexNow key file (Bing instant-indexing protocol). The key is written
    // to <key>.txt at the site root so Bing can verify pings made with it.
    if (!fs.existsSync(path.join(ROOT, 'indexnow-key.txt'))) {
        const crypto = require('crypto');
        write('indexnow-key.txt', crypto.randomBytes(16).toString('hex'));
    }
    const INDEXNOW_KEY = fs.readFileSync(path.join(ROOT, 'indexnow-key.txt'), 'utf8').trim();

    write('.nojekyll', '');
    console.log('  ✓', 'sitemap.xml (' + urls.length + ' URLs), robots.txt, .nojekyll, favicon.ico, .well-known/security.txt, llms.txt, feed.xml, indexnow-key.txt (' + INDEXNOW_KEY.slice(0, 6) + '…)');
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
