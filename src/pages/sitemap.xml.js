// 自動產生 /sitemap.xml：列出 src/pages 底下每一個頁面，新增頁面不用再手動維護這份清單。
// 頁面可以在開頭寫 `export const lastmod = 'YYYY-MM-DD';`（內容有實質修改時更新日期）；沒寫就不輸出 lastmod。
// 目前只處理固定網址的頁面；之後若有 [slug].astro 這類動態頁，要在這裡另外補上。
const pages = import.meta.glob('./**/*.astro', { eager: true });

export function GET({ site }) {
  const urls = Object.entries(pages)
    .map(([file, mod]) => ({
      // './index.astro' → '/'，'./agencies.astro' → '/agencies/'，'./guides/index.astro' → '/guides/'
      route: file.slice(1).replace(/\.astro$/, '').replace(/\/index$/, '') + '/',
      lastmod: mod.lastmod,
    }))
    .filter((u) => !u.route.includes('[') && !/\/(404|500)\/$/.test(u.route))
    .sort((a, b) => a.route.localeCompare(b.route));

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((u) =>
      [
        '  <url>',
        `    <loc>${new URL(u.route, site).href}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : null,
        '  </url>',
      ].filter(Boolean).join('\n')
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
