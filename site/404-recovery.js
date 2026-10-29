/* Smart 404 recovery engine for try4ever.com.
 *
 * Inlined into 404.html by generate.js. GitHub Pages serves this page — with
 * HTTP status 404 — at the originally requested URL, so window.location still
 * holds what the visitor asked for. Humans get instant recovery (exact-match
 * redirect, fuzzy "did you mean" suggestions, auto-redirect countdown);
 * crawlers keep seeing the truthful 404 status, so bad URLs stay out of the
 * index. Works in Node too (unit tests): DOM init is guarded.
 */
(function () {
    'use strict';

    function normPath(p) {
        p = String(p || '');
        p = p.split('#')[0].split('?')[0];
        p = p.replace(/\/+$/, '');
        p = p.toLowerCase();
        if (p === '' || p === '/index.html') p = '/';
        return p;
    }

    // Classic Levenshtein distance, O(n*m), fine for ~20 candidates.
    function levenshtein(a, b) {
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur[0] = i;
            for (j = 1; j <= b.length; j++) {
                var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            }
            for (j = 0; j <= b.length; j++) prev[j] = cur[j];
        }
        return prev[b.length];
    }

    // Similarity 0..1 (1 = identical)
    function sim(a, b) {
        if (a === b) return 1;
        var m = Math.max(a.length, b.length);
        if (m === 0) return 0;
        return 1 - levenshtein(a, b) / m;
    }

    function stripQuery(t) { return String(t || '').split('#')[0].split('?')[0]; }

    /**
     * Resolve a requested URL against the site index.
     * @returns {action: 'redirect'|'suggest'|'none', url?, candidates: [{u, t, score}]}
     */
    function resolve404(pathname, search, hash, index) {
        var requested = null;
        var rawTarget = null;

        // Legacy handoff: /?tg=<original path> (old 404-router era)
        try {
            if (search) {
                var tg = new URLSearchParams(search).get('tg');
                if (tg && tg.charAt(0) === '/' && tg.charAt(1) !== '/') { rawTarget = tg; requested = normPath(tg); }
            }
        } catch (e) { /* older browsers – ignore */ }

        // Legacy hash routes: /#/blog/<slug> (first-generation router era)
        if (requested === null && hash && String(hash).indexOf('#/') === 0) {
            rawTarget = String(hash).slice(1);
            requested = normPath(rawTarget);
        }

        if (requested === null) requested = normPath(pathname);
        if (requested === '/' || requested === '') return { action: 'redirect', url: '/', candidates: [] };

        var candidates = [];
        for (var i = 0; i < index.length; i++) {
            var entry = index[i];
            var cand = normPath(entry.u);
            var score = sim(requested, cand);
            // Also compare the last path segment (slug) — catches typos in
            // /blog/<slug>/ style URLs even when directories differ.
            var qSeg = requested.split('/').pop();
            var cSeg = cand.split('/').pop();
            if (qSeg.length >= 4 && cSeg.length >= 4) {
                score = Math.max(score, sim(qSeg, cSeg));
            }
            candidates.push({ u: entry.u, t: entry.t, score: score });
        }
        candidates.sort(function (a, b) { return b.score - a.score; });

        // Exact (normalized) match -> instant client redirect to the real page
        var top = candidates[0];
        if (top && top.score === 1) {
            return { action: 'redirect', url: rawTarget || top.u, candidates: candidates };
        }

        // Fuzzy suggestions; strong matches get an auto-redirect countdown
        var suggestions = candidates.filter(function (c) { return c.score >= 0.45; }).slice(0, 5);
        if (top && top.score >= 0.78 && suggestions.length) {
            return { action: 'suggest', url: suggestions[0].u, candidates: suggestions, auto: true };
        }
        if (suggestions.length) return { action: 'suggest', url: null, candidates: suggestions, auto: false };
        return { action: 'none', candidates: [] };
    }

    // ---- Browser wiring (skipped under Node) --------------------------------
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.__SITE_INDEX__) {
        try {
            var res = resolve404(window.location.pathname, window.location.search, window.location.hash, window.__SITE_INDEX__);
            var box = document.getElementById('recovery');
            if (res.action === 'redirect') {
                window.location.replace(res.url);
                return;
            }
            if (res.action === 'suggest' && box) {
                var html = '<div class="rb-title">Were you looking for:</div>';
                html += res.candidates.map(function (c) {
                    return '<a href="' + c.u + '">' + c.t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</a>' +
                           '<span class="sg-path">' + c.u + '</span>';
                }).join('');
                box.innerHTML = html;
                box.hidden = false;
                if (res.auto && res.url) {
                    var line = document.getElementById('countdownLine');
                    var text = document.getElementById('countdownText');
                    var btn = document.getElementById('cancelBtn');
                    var left = 8;
                    if (line && text && btn) {
                        var render = function () { text.textContent = 'Redirecting you there in ' + left + 's…'; };
                        render();
                        line.hidden = false;
                        var timer = setInterval(function () {
                            left -= 1;
                            if (left <= 0) { clearInterval(timer); window.location.replace(res.url); return; }
                            render();
                        }, 1000);
                        btn.addEventListener('click', function () {
                            clearInterval(timer);
                            line.hidden = true;
                        });
                    }
                }
            }
        } catch (e) { /* recovery is best-effort – the static content still shows */ }
    }

    // Node export for unit tests
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { resolve404: resolve404, levenshtein: levenshtein, normPath: normPath, sim: sim };
    }
})();
