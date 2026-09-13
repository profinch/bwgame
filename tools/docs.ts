/**
 * The documents as pages: the whitepaper and the roadmap, rendered from their
 * markdown at build time and served under the same roof as the world, so the
 * menu's "info" can open them in place as it opens the map. Nothing is copied
 * by hand and nothing goes stale: docs/*.md is the one source.
 *
 * A page follows the site's tone (black or white, from `bw-theme`), and with
 * `?embedded` leaves its own header out, as the map does inside the world.
 */
import { readFileSync } from 'node:fs';
import { marked } from 'marked';
// vitest's own vite, so the plugin's type is the one vite.config.ts is checked against
import type { Plugin } from 'vitest/config';

export const PAGES: Record<string, { file: string; title: string }> = {
  whitepaper: { file: 'docs/whitepaper.md', title: 'whitepaper' },
  roadmap: { file: 'docs/roadmap.md', title: 'roadmap' },
};

/** Where a link out of a document goes: a sister page here, or the file on GitHub. */
export function hrefOf(href: string): string {
  const match = /^(?:\.\/)?([a-z0-9-]+)\.md(#.*)?$/i.exec(href);
  if (!match) return href;
  const [, name, hash = ''] = match;
  if (name! in PAGES) return `${name}.html${hash}`;
  return `https://github.com/profinch/bwgame/blob/main/docs/${name}.md${hash}`;
}

export function renderDoc(markdown: string, title: string): string {
  const body = marked.parse(markdown, {
    gfm: true,
    walkTokens: (token) => {
      if (token.type === 'link') token.href = hrefOf(token.href);
    },
  }) as string;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ground State — ${title}</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <script>try{var _t=localStorage.getItem('bw-theme');if(_t)document.documentElement.dataset.t=_t;}catch(e){}
    if(new URLSearchParams(location.search).has('embedded'))document.documentElement.classList.add('embedded');</script>
    <style>
      :root { --bg: #f1efe9; --fg: #0a0a0a; --mut: #6b6a66; --line: #0a0a0a; color-scheme: light; }
      html[data-t="dark"] { --bg: #0a0a0a; --fg: #f1efe9; --mut: #8a8985; --line: #f1efe9; color-scheme: dark; }
      html, body { margin: 0; background: var(--bg); color: var(--fg); }
      body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
      .bar { position: sticky; top: 0; display: flex; gap: 16px; align-items: baseline; padding: 20px 24px 12px; background: color-mix(in srgb, var(--bg) 84%, transparent); backdrop-filter: blur(13px); font-size: 11.5px; letter-spacing: 0.15em; text-transform: lowercase; }
      .bar a { color: var(--fg); text-decoration: none; opacity: 0.55; }
      .bar a:hover { opacity: 1; }
      .bar .here { opacity: 1; }
      html.embedded .bar { display: none; }
      main { max-width: 72ch; margin: 0 auto; padding: 24px 24px 96px; }
      html.embedded main { padding-top: 88px; }
      h1, h2, h3 { font-weight: 600; letter-spacing: 0.01em; line-height: 1.25; }
      h1 { font-size: 26px; margin: 24px 0 12px; }
      h2 { font-size: 18px; margin: 40px 0 10px; }
      h3 { font-size: 15px; margin: 28px 0 8px; }
      p, li { color: var(--fg); }
      a { color: var(--fg); text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--fg) 35%, transparent); text-underline-offset: 3px; }
      code, pre { font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.9em; }
      code { padding: 1px 4px; border-radius: 4px; background: color-mix(in srgb, var(--fg) 7%, transparent); }
      pre { padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--fg) 6%, transparent); overflow-x: auto; }
      pre code { padding: 0; background: none; }
      hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--line) 15%, transparent); margin: 40px 0; }
      blockquote { margin: 0; padding-left: 14px; border-left: 2px solid color-mix(in srgb, var(--line) 25%, transparent); color: var(--mut); }
      table { border-collapse: collapse; width: 100%; font-size: 14px; }
      th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, var(--line) 12%, transparent); vertical-align: top; }
      em { color: var(--mut); }
      sup { font-size: 0.7em; }
    </style>
  </head>
  <body>
    <nav class="bar" aria-label="ground state">
      <a href="/">ground state</a>
      ${Object.entries(PAGES)
        .map(([name, page]) => `<a href="/${name}.html"${page.title === title ? ' class="here"' : ''}>${page.title}</a>`)
        .join('\n      ')}
    </nav>
    <main>
${body}
    </main>
  </body>
</html>
`;
}

/** The pages, served in development and written out by the build. */
export function docPages(): Plugin {
  const pageFor = (url: string) => {
    const match = /^\/([a-z]+)\.html(?:\?.*)?$/.exec(url);
    return match && PAGES[match[1]!] ? { name: match[1]!, ...PAGES[match[1]!]! } : null;
  };
  return {
    name: 'ground-state-doc-pages',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const page = pageFor(request.url ?? '');
        if (!page) return next();
        response.setHeader('content-type', 'text/html; charset=utf-8');
        response.end(renderDoc(readFileSync(page.file, 'utf8'), page.title));
      });
    },
    generateBundle() {
      for (const [name, page] of Object.entries(PAGES)) {
        this.emitFile({ type: 'asset', fileName: `${name}.html`, source: renderDoc(readFileSync(page.file, 'utf8'), page.title) });
      }
    },
  };
}
