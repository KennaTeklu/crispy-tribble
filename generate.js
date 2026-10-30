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
            if (p.modified && !/^\d{4}-\d{2}-\d{2}$/.test(p.modified)) fail('blog-posts/' + f + ': bad modified "' + p.modified + '" (expected YYYY-MM-DD)');
            if (!/^[a-z0-9-]+$/.test(p.slug)) fail('blog-posts/' + f + ': bad slug "' + p.slug + '" (lowercase letters, digits, dashes)');
        }
        posts.push(...newOnes.map(p => ({ file: f, title: p.title, date: p.date, slug: p.slug, tags: Array.isArray(p.tags) ? p.tags : [], excerpt: p.excerpt, body: p.body, modified: p.modified })));
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
// Head block injected into EVERY page (all 20 URLs AND 404.html): the same
// ranked profile set, machine-readable in three independent formats —
//   1. <link rel="me">   decentralized identity standard (IndieAuth / Mastodon
//      / Bluesky back-link verification: proves "this site owns that profile")
//   2. <meta property="og:see_also">  OpenGraph cross-references read by
//      Facebook / LinkedIn / WhatsApp / Discord-style scrapers
//   3. the Organization JSON-LD sameAs array (Google / Bing / Yandex)
// The order is identical everywhere: largest platform daily reach first, so
// every crawler sees ONE consistent, ranked source of truth.
const SOCIAL_HEAD_HTML =
    '\n    <!-- ===== SOCIAL IDENTITY — source of truth, ranked by platform reach =====\n' +
    '         Machine-readable on EVERY page: rel="me" identity links +\n' +
    '         og:see_also below + the JSON-LD sameAs array. Each profile links\n' +
    '         back to try4ever.com for verification. -->\n' +
    SOCIAL_PROFILES.map(p => '    <link rel="me" href="' + p.u + '">').join('\n') + '\n' +
    SOCIAL_PROFILES.map(p => '    <meta property="og:see_also" content="' + p.u + '">').join('\n');

// ---------------------------------------------------------------------------
// JSON-LD entity graph — EVERY page (including 404.html) ships a complete,
// self-contained knowledge graph: Organization (sameAs ranked by platform
// reach) + WebSite + the page's own WebPage node, all cross-linked with @id
// so search engines merge ONE brand entity instead of disconnected fragments.
// ---------------------------------------------------------------------------
const ORG_JSONLD_NODE = {
    '@type': 'Organization',
    '@id': SITE + '/#org',
    'name': 'try4ever',
    'alternateName': 'try4ever.com',
    'url': SITE + '/',
    'description': 'Independent solo software project based in Arizona, USA, building the Brain study tool.',
    'email': 'support@try4ever.com',
    'logo': {
        '@type': 'ImageObject',
        '@id': SITE + '/#logo',
        'url': SITE + '/og-image.png',
        'contentUrl': SITE + '/og-image.png',
        'width': 1200,
        'height': 630,
        'caption': 'Brain by try4ever – turn PDFs and notes into a 3D knowledge map'
    },
    'image': { '@id': SITE + '/#logo' },
    'sameAs': SOCIAL_SAMEAS,
    'address': { '@type': 'PostalAddress', 'addressRegion': 'Arizona', 'addressCountry': 'US' },
    'contactPoint': { '@type': 'ContactPoint', 'contactType': 'customer support', 'email': 'support@try4ever.com', 'availableLanguage': 'English' }
};

const WEBSITE_JSONLD_NODE = {
    '@type': 'WebSite',
    '@id': SITE + '/#website',
    'url': SITE + '/',
    'name': 'Brain',
    'alternateName': 'Brain study tool',
    'publisher': { '@id': SITE + '/#org' },
    'inLanguage': 'en-US'
};

const APP_JSONLD_NODE = {
    '@type': 'SoftwareApplication',
    '@id': SITE + '/#app',
    'name': 'Brain',
    'applicationCategory': 'EducationalApplication',
    'operatingSystem': 'Web browser',
    'url': SITE + '/',
    'description': 'Brain turns PDFs, DOCX, TXT and EPUB files into a 3D knowledge map. Study, quiz yourself, and track mastery with color-coded topics. Files are processed on your device and never uploaded.',
    'featureList': '3D knowledge map, color-coded mastery tracking, quiz and fill-in-the-blank generation, works offline, on-device file processing, PDF/DOCX/TXT/EPUB support',
    'offers': [
        { '@type': 'Offer', 'name': 'Free plan', 'price': '0', 'priceCurrency': 'USD', 'description': 'Apply in minutes and study immediately: 21 nodes to start, more as your application is approved. No card required.' },
        { '@type': 'Offer', 'name': 'Instant monthly plan', 'price': '19', 'priceCurrency': 'USD', 'description': 'Full product, instant activation. Cancel in one click anytime.' }
    ],
    'publisher': { '@id': SITE + '/#org' }
};

const FAQ_JSONLD_NODE = {
    '@type': 'FAQPage',
    '@id': SITE + '/faq/#faq',
    'mainEntity': [
        { '@type': 'Question', 'name': 'Is Brain made for a specific exam?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'No. Brain works for anything you study: USMLE, MCAT, history, programming, law, languages – any material you can put in a PDF, DOCX, TXT or EPUB file.' } },
        { '@type': 'Question', 'name': 'Is my data safe?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes. Your files are processed on your device and everything you create is stored in your own browser (IndexedDB). There is no cloud copy, no account database and no tracking. Clearing your browser storage deletes your data – it belongs to you.' } },
        { '@type': 'Question', 'name': 'Is Brain free?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes – there is a $0/month plan. Email support@try4ever.com with what you\'re studying; the application is short. You study immediately: your map starts with 21 nodes and grows as your application is approved. No card, no countdown. When you want the full product, the paid plan is $19/month and activates instantly.' } },
        { '@type': 'Question', 'name': 'Can I get a refund?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Paid periods are all sales final – that is why the free plan lets you use the real product before paying anything. Billing mistakes are the exception: if you were charged twice or in error, contact support@try4ever.com and we will fix it. You can cancel in one click at any time and keep access until the end of the period you already paid for.' } },
        { '@type': 'Question', 'name': 'Who builds Brain?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Brain is built and operated by try4ever, an independent solo software project based in Arizona, USA. Questions or issues: support@try4ever.com – we answer within 5 business days.' } },
        { '@type': 'Question', 'name': 'How are payments handled?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Payments are processed by Stripe in USD. We never see or store your card details – Stripe handles the transaction on their certified infrastructure.' } },
        { '@type': 'Question', 'name': 'What file types does Brain work with?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'PDF, DOCX, TXT and EPUB. Scanned PDFs are OCR-processed on your device (first 10 pages), and images, slides, spreadsheets and other documents are extracted locally as well.' } },
        { '@type': 'Question', 'name': 'I am drowning in lecture slides. How fast can this help?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Immediately. Upload the PDF and Brain builds the map on your device in minutes – you see the whole course at a glance and start quizzing the same hour. Most people find their first weak topic before their coffee gets cold.' } },
        { '@type': 'Question', 'name': 'Studying for USMLE, MCAT or NCLEX – does it work for me?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes. Those exams reward exactly what Brain is built for: seeing connections, retrieving instead of rereading, and knowing what is still red before test day. Upload your class notes, review sheets or study guides and study the map.' } },
        { '@type': 'Question', 'name': 'I am not a med student – law, business, engineering, languages?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Brain works on any material you can put in a PDF, DOCX, TXT or EPUB. Case law, tax code, thermodynamics, Japanese grammar – if you can study it, you can map it.' } },
        { '@type': 'Question', 'name': 'I am a teacher. Is this another tool trying to replace me?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'No – and we mean it. AI should sharpen a teacher, never replace one. You prepare the material; Brain turns it into maps, quizzes and color-coded mastery your whole class can see. It takes the busywork, you keep the craft.' } },
        { '@type': 'Question', 'name': 'I am a parent. Can I actually see my child\'s progress?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes. The mastery colors – red to green – are easy to read at a glance, so you can support without hovering. Brain gives you a shared, honest picture instead of “I already studied, mom.”' } },
        { '@type': 'Question', 'name': 'Do I need a credit card?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'No. The free plan needs no card at all, and the application is a short email. Card details only enter the picture – through Stripe – if you choose the $19/month plan.' } },
        { '@type': 'Question', 'name': 'What happens after I apply?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'You start studying immediately. There is no waiting room: your application is reviewed while you already use your map – 21 nodes to start, more unlocked as it is approved.' } },
        { '@type': 'Question', 'name': 'Can I use it offline and on any device?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'It runs in your browser – laptop, desktop, tablet. Once loaded, it works offline: study on the bus, in the library basement, on a plane. Your data lives in your browser, not in a cloud.' } },
        { '@type': 'Question', 'name': 'Why a 3D map instead of flashcards?',
          'acceptedAnswer': { '@type': 'Answer', 'text': 'Flashcards drill isolated facts; a map shows how they connect – and exams mostly test connections. Brain does both: it generates the quizzes from your material, so you get retrieval practice inside the structure.' } }
    ]
};

// Serializes a node into one JSON-LD <script>. "<" is escaped as \u003c so
// embedded text can never terminate the script element early.
function jsonldScript(node) {
    return '<script type="application/ld+json">\n' +
        JSON.stringify(node, null, 2).replace(/</g, '\\u003c') +
        '\n    </script>';
}

// Full per-page graph: Organization + WebSite + WebPage (+ optional extras).
// `mainEntity` ties the page to its primary content node (e.g. its BlogPosting).
function pageJsonld(url, name, desc, opts) {
    opts = opts || {};
    const webPage = {
        '@type': 'WebPage',
        '@id': url + '#webpage',
        'url': url,
        'name': name,
        'description': desc,
        'isPartOf': { '@id': SITE + '/#website' },
        'about': { '@id': SITE + '/#org' },
        'inLanguage': 'en-US',
        'primaryImageOfPage': { '@id': SITE + '/#logo' }
    };
    if (opts.mainEntity) webPage['mainEntity'] = opts.mainEntity;
    return jsonldScript({
        '@context': 'https://schema.org',
        '@graph': [ORG_JSONLD_NODE, WEBSITE_JSONLD_NODE, webPage].concat(opts.extra || [])
    });
}

const PAGES = [
    { route: 'home',     path: '/',        title: 'Brain – Turn PDFs & Notes Into a 3D Study Map', desc: 'Turn PDFs and notes into a 3D map you can actually study from. Apply once, start immediately – no card, no countdown. Free plan by application; $19/mo for it all.', extraNodes: [APP_JSONLD_NODE], nav: null },
    { route: 'how',      path: '/how/',    title: 'How Brain Works – From Upload to 3D Knowledge Map', desc: 'Upload a PDF, DOCX, TXT or EPUB, watch it become a 3D graph of topics, quiz yourself, and track mastery from red to green. On-device processing, step by step.', nav: 'how' },
    { route: 'features', path: '/features/', title: 'Features – 3D Map, Mastery Tracking, Quizzes, Offline', desc: 'A 3D knowledge map, color-coded mastery, quiz generation, offline mode and on-device file processing. Everything runs in your browser – no cloud, no tracking.', nav: 'features' },
    { route: 'about',    path: '/about/',  title: 'About Brain – Built by try4ever, Arizona USA', desc: 'Brain is a solo-built study tool by try4ever, an independent project in Arizona, USA. Private by design: files are processed on your device. Contact support@try4ever.com.', nav: 'about' },
    { route: 'faq',      path: '/faq/',    title: 'FAQ – Brain Study Tool', desc: 'Quick answers on pricing (free plan by application – start immediately, no card), refunds, privacy – and who Brain is for: students, teachers, parents.', extraNodes: [FAQ_JSONLD_NODE], nav: 'faq' },
    { route: 'terms',    path: '/terms/',  title: 'Terms of Service – Brain', desc: 'The agreement between you and try4ever for using Brain: plans and billing, cancellation, refunds, acceptable use, governing law (Arizona, USA). Effective September 20, 2026.', nav: null },
    { route: 'privacy',  path: '/privacy/', title: 'Privacy Policy – Brain', desc: 'Your study material never leaves your device. No analytics, no trackers, no account database. What can leave your device, only by your action.', nav: null },
    { route: 'refund',   path: '/refund/', title: 'Refund & Cancellation Policy – Brain', desc: 'Cancel in one click anytime and keep access until your paid period ends. Try the real product on the free plan first – no card. Sales final except billing errors.', nav: null },
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
    sub('{{SOCIAL_HEAD}}', SOCIAL_HEAD_HTML);
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
            ogType: 'website',
            jsonld: pageJsonld(SITE + p.path, p.title, p.desc, { extra: p.extraNodes }), nav: p.nav,
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

    const blogJsonld = pageJsonld(SITE + '/blog/', 'Blog – Brain Study Tool',
        'Study science, exam playbooks and honest notes on how we learn – from the maker of Brain, the 3D knowledge map for students, teachers and parents.',
        { extra: [{
            '@type': 'Blog',
            '@id': SITE + '/blog/#blog',
            'name': 'Brain Blog',
            'url': SITE + '/blog/',
            'description': 'Study science, exam playbooks and honest notes on how we learn – from the maker of Brain, the 3D knowledge map for students, teachers and parents.',
            'publisher': { '@id': SITE + '/#org' },
            'blogPost': posts.map(p => ({
                '@type': 'BlogPosting',
                '@id': SITE + '/blog/' + p.slug + '/#blogpost',
                'headline': p.title,
                'url': SITE + '/blog/' + p.slug + '/',
                'datePublished': p.date
            }))
        }] });

    write('blog/index.html', render({
        content: '<div class="section">\n    <h1 class="page-title">Blog</h1>\n    <p>Study science, exam playbooks and honest notes on how we learn – written for students of every field, for teachers and for parents.</p>\n    <p>New here? Start with <a href="/how/">how it works</a>, or <a href="https://brain.try4ever.com" target="_blank" rel="noopener">apply free</a> and study your own material tonight.</p>\n    <ul class="post-list">\n' + items + '\n    </ul>\n</div>',
        title: 'Blog – Brain Study Tool',
        desc: 'Study science, exam playbooks and honest notes on how we learn – from the maker of Brain, the 3D knowledge map for students, teachers and parents.',
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

        const postJsonld = pageJsonld(
            SITE + '/blog/' + p.slug + '/', p.title + ' – Brain', p.excerpt,
            {
                mainEntity: { '@id': SITE + '/blog/' + p.slug + '/#blogpost' },
                extra: [{
                    '@type': 'BlogPosting',
                    '@id': SITE + '/blog/' + p.slug + '/#blogpost',
                    'headline': p.title,
                    'description': p.excerpt,
                    'image': SITE + '/og-image.png',
                    'datePublished': p.date,
                    'dateModified': p.modified || p.date,
                    'keywords': p.tags.join(', '),
                    'author': { '@id': SITE + '/#org' },
                    'publisher': { '@id': SITE + '/#org' },
                    'isPartOf': { '@id': SITE + '/blog/#blog', 'name': 'Brain Blog' },
                    'mainEntityOfPage': { '@id': SITE + '/blog/' + p.slug + '/#webpage' }
                }]
            });

        write('blog/' + p.slug + '/index.html', render({
            content,
            title: p.title + ' – Brain',
            desc: p.excerpt,
            url: SITE + '/blog/' + p.slug + '/',
            robots: 'index, follow, max-image-preview:large',
            ogType: 'article',
            ogExtra: '    <meta property="article:published_time" content="' + p.date + '">',
            jsonld: postJsonld, nav: 'blog',
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
        ogType: 'website',
        // Even the error page carries the full social entity graph (noindex is
        // kept, so this is identity data for scrapers, never an indexable page).
        jsonld: pageJsonld(SITE + '/404.html', 'Page not found (404) – Brain',
            'That page does not exist on try4ever.com. Head back home, read the blog, or open the Brain study app.'), nav: null,
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
    for (const p of posts) urls.push({ loc: SITE + '/blog/' + p.slug + '/', lastmod: p.modified || p.date });

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
        'Brain is a study tool by try4ever that turns PDFs, DOCX, TXT and EPUB files into an interactive 3D knowledge map in the browser. Files are processed entirely on the user\'s device — no upload, no account database, no tracking. Free plan by application (apply once, study immediately with 21 nodes, more after review — no card), paid plan $19/mo. App lives at https://brain.try4ever.com.',
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
