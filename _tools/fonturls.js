// List every font file a page downloads (URL + bytes).  node fonturls.js <siteDir>
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

(async () => {
  const dir = path.resolve(process.argv[2]);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(4603, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
  await page.setCacheEnabled(false);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const reqs = new Map();
  cdp.on('Network.responseReceived', e => { if (e.type === 'Font') reqs.set(e.requestId, { url: e.response.url, bytes: 0 }); });
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  await page.goto('http://127.0.0.1:4603/', { waitUntil: 'load' });
  // walk the whole page so every lazily needed glyph is requested
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 700) { await page.evaluate(yy => window.scrollTo(0, yy), y); await new Promise(r => setTimeout(r, 120)); }
  await new Promise(r => setTimeout(r, 4000));
  console.log(JSON.stringify(Array.from(reqs.values())));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
