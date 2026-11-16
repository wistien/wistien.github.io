// Checks the on-demand Google Fonts fallback: add text the subsets do not cover and see what loads.
//   node test_fallback.js <siteDir>
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
  await new Promise(r => server.listen(4604, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const inject of [false, true]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
    await page.setCacheEnabled(false);
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    const fonts = [];
    cdp.on('Network.responseReceived', e => { if (e.type === 'Font') fonts.push(e.response.url); });
    if (inject) {
      await page.evaluateOnNewDocument(() => document.addEventListener('DOMContentLoaded', () => {
        const p = document.createElement('p'); p.id = 'probe'; p.textContent = '測試缺字：龘鑫'; document.querySelector('#hero .hero-desc').after(p);
      }));
    }
    await page.goto('http://127.0.0.1:4604/', { waitUntil: 'load' });
    await new Promise(r => setTimeout(r, 6000));
    const state = await page.evaluate(() => {
      const link = document.querySelector('link[href*="fonts.googleapis.com/css2"]');
      const style = document.querySelector('style');
      return { fallbackLoaded: !!link, linkBeforeStyle: !!link && !!(link.compareDocumentPosition(style) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    console.log(inject ? 'with uncovered text:' : 'normal page:', JSON.stringify(state), '| local fonts', fonts.filter(u => !/gstatic/.test(u)).length, '| google font files', fonts.filter(u => /gstatic/.test(u)).length);
    await page.close();
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
