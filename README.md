# Brain — try4ever.com

Static marketing site for Brain, deployed on **GitHub Pages** from this repo's `main` branch (custom domain via `CNAME`).

## Architecture (why it's built this way)

Every route is a **real, pre-rendered HTML file**, so GitHub Pages serves it with **HTTP 200** and search engines can fully crawl and index it:

| URL | File |
|---|---|
| `/` | `index.html` |
| `/how/`, `/features/`, `/about/`, `/faq/` | `<page>/index.html` |
| `/terms/`, `/privacy/`, `/refund/` | `<page>/index.html` |
| `/blog/` | `blog/index.html` |
| `/blog/<slug>/` | `blog/<slug>/index.html` |
| anything else | `404.html` — served **with HTTP status 404** by GitHub Pages |

Supporting files: `sitemap.xml` (all 20 URLs), `robots.txt`, `.nojekyll` (skips Jekyll), `og-image.png` (social preview card).

Each generated page is fully self-contained (inline CSS/JS, no external requests) and carries its own `<title>`, meta description, canonical URL, Open Graph/Twitter tags, and JSON-LD structured data (`WebSite` + `Organization` + `SoftwareApplication` on home, `FAQPage` on `/faq/`, `Blog` on `/blog/`, `BlogPosting` on every post).

**Blog content has a single source of truth:** the `blog-posts/postN.js` data files. The generator renders one static page per post — no client-side routing, no 404-page hack, no duplicated aggregators.

## Editing the site

- **Edit a page**: change `site/pages/<page>.html` (or `site/layout.html` for the shared shell), then rebuild.
- **Add a blog post**: create `blog-posts/post12.js` (copy the shape of `post11.js`; lowercase-dash slug, `YYYY-MM-DD` date), then rebuild.
- **Rebuild** (Node.js, zero dependencies):

  ```bash
  node generate.js
  ```

- Commit everything (source + generated output) and push to `main`. GitHub Pages redeploys automatically — no Actions, no secrets, no extra PAT scopes needed.

The generator validates slugs, dates, required fields and duplicate posts, and fails loudly instead of producing a broken site.

## Legacy compatibility

Old links of the form `/?tg=<path>` (from the previous SPA-in-404.html routing hack) are redirected to the real page by a tiny snippet on every page. Old non-slash URLs like `/blog/spatial-memory-power` are 301-redirected by GitHub Pages to their trailing-slash versions.
