// Collect the characters each web font actually has to render on a page.
//   node chars.js <page.html> [more.html ...] > chars.json
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const files = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const buckets = {};
  for (const f of files) {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => (/^(file|data):/.test(r.url()) ? r.continue() : r.abort())); // offline: only local files
    await page.goto('file:///' + path.resolve(f).replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 800));
    const res = await page.evaluate(() => {
      const out = {};
      const fam = cs => (cs.fontFamily.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
      const add = (family, text) => { if (!text) return; (out[family] = out[family] || new Set()); for (const ch of text) out[family].add(ch); };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue;
        add(fam(getComputedStyle(p)), n.nodeValue);
      }
      document.querySelectorAll('body *').forEach(el => {
        for (const pseudo of ['::before', '::after']) {
          const cs = getComputedStyle(el, pseudo);
          const c = cs.content;
          if (!c || c === 'none' || c === 'normal') continue;
          const strings = c.match(/"((?:[^"\\]|\\.)*)"/g);
          if (strings) add(fam(cs), strings.map(s => s.slice(1, -1)).join(''));
        }
        if (el.placeholder) add(fam(getComputedStyle(el)), el.placeholder);
        // an image that has not loaded yet shows its alt text, which makes the browser fetch glyphs for it
        if (el.tagName === 'IMG' && el.alt) add(fam(getComputedStyle(el)), el.alt);
      });
      const plain = {};
      for (const [k, v] of Object.entries(out)) plain[k] = Array.from(v).join('');
      return plain;
    });
    for (const [k, v] of Object.entries(res)) { buckets[k] = buckets[k] || new Set(); for (const ch of v) buckets[k].add(ch); }
    await page.close();
  }
  await browser.close();
  const out = {};
  for (const [k, v] of Object.entries(buckets)) out[k] = Array.from(v).sort().join('');
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
