// Before/after comparison harness.
//   node compare.js bytes  <beforeDir> <afterDir>
//   node compare.js timing <beforeDir> <afterDir>
//   node compare.js shots  <beforeDir> <afterDir> <outDir>
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.json': 'application/json' };

function serve(dir, port) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let f = path.join(dir, p);
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
    const ext = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600' };
    if (['.html', '.js', '.css', '.xml', '.txt', '.svg', '.json'].includes(ext)) { body = zlib.gzipSync(body); head['Content-Encoding'] = 'gzip'; }
    res.writeHead(200, head); res.end(body);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

const DEVICES = {
  'phone-3x (390x844)': { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'phone-1.75x (412x823)': { width: 412, height: 823, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  'desktop (1440x900)': { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function kind(type, url) {
  if (/fonts\.googleapis\.com/.test(url)) return 'font-css';
  if (type === 'Font') return 'font-files';
  if (type === 'Image') return 'images';
  if (type === 'Document') return 'html';
  if (/googletagmanager|google-analytics/.test(url)) return 'analytics';
  return 'other';
}

async function measureBytes(browser, url, vp) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.setCacheEnabled(false);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  const reqs = new Map();
  let loadAt = null;
  cdp.on('Network.responseReceived', e => reqs.set(e.requestId, { type: e.type, url: e.response.url, bytes: 0, done: null }));
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = Date.now(); } });
  page.on('load', () => { loadAt = Date.now(); });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await sleep(9000); // lets deferred work (2nd slide, background photos) finish too
  const out = { atLoad: {}, total: {}, reqAtLoad: 0, reqTotal: 0 };
  for (const r of reqs.values()) {
    if (r.done === null) continue;
    const k = kind(r.type, r.url);
    out.total[k] = (out.total[k] || 0) + r.bytes; out.reqTotal++;
    if (r.done <= loadAt + 50) { out.atLoad[k] = (out.atLoad[k] || 0) + r.bytes; out.reqAtLoad++; }
  }
  await page.close();
  return out;
}

async function measureTiming(browser, url, vp) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.setCacheEnabled(false);
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  // Lighthouse "slow 4G" style throttling
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => {
    window.__lcp = 0; window.__fcp = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  const loadMs = Date.now() - t0;
  await sleep(6000);
  const m = await page.evaluate(() => ({ fcp: Math.round(window.__fcp), lcp: Math.round(window.__lcp) }));
  await page.close();
  return { ...m, load: loadMs };
}

const FREEZE = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}.to-top{opacity:1!important;visibility:visible!important;transform:none!important}';

async function shots(browser, url, vp, outDir, tag) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(() => document.fonts.ready);
  await sleep(4500); // count-up numbers settle, deferred backgrounds arrive
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  const files = [];
  let i = 0;
  for (let y = 0; y < H; y += vp.height) {
    await page.evaluate(yy => window.scrollTo(0, yy), y);
    await sleep(350);
    const f = path.join(outDir, `${tag}-scroll${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    files.push(f); i++;
  }
  // each carousel slide
  await page.evaluate(() => window.scrollTo(0, 0));
  // stop auto-advance in both versions so the same slide is on screen when we capture
  await page.evaluate(() => { try { clearInterval(timer); clearTimeout(timer); } catch (e) {} try { paused = true; } catch (e) {} });
  const n = await page.evaluate(() => document.querySelectorAll('#carousel .slide').length);
  for (let k = 1; k < n; k++) {
    await page.evaluate(kk => { goSlide(kk); }, k);
    await page.waitForFunction(kk => { const s = document.querySelectorAll('#carousel .slide')[kk]; const im = s.querySelector('img'); return s.classList.contains('active') && im.complete && im.naturalWidth > 0; }, { timeout: 30000 }, k);
    await sleep(500);
    const f = path.join(outDir, `${tag}-slide${String(k).padStart(2, '0')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  await page.close();
  return { H, files: files.length };
}

(async () => {
  const [cmd, beforeDir, afterDir, outDir] = process.argv.slice(2);
  const s1 = await serve(path.resolve(beforeDir), 4601);
  const s2 = await serve(path.resolve(afterDir), 4602);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const sites = { before: 'http://127.0.0.1:4601/', after: 'http://127.0.0.1:4602/' };
  try {
    if (cmd === 'bytes') {
      const result = {};
      for (const [dn, vp] of Object.entries(DEVICES)) {
        result[dn] = {};
        for (const [sn, url] of Object.entries(sites)) result[dn][sn] = await measureBytes(browser, url, vp);
      }
      console.log(JSON.stringify(result, null, 1));
    } else if (cmd === 'timing') {
      const vp = DEVICES['phone-1.75x (412x823)'];
      for (const [sn, url] of Object.entries(sites)) {
        const runs = [];
        for (let i = 0; i < 3; i++) runs.push(await measureTiming(browser, url, vp));
        console.log(sn, JSON.stringify(runs));
      }
    } else if (cmd === 'shots') {
      fs.mkdirSync(outDir, { recursive: true });
      for (const [dn, vp] of Object.entries(DEVICES)) {
        const short = dn.split(' ')[0];
        for (const [sn, url] of Object.entries(sites)) {
          const r = await shots(browser, url, vp, outDir, `${short}-${sn}`);
          console.log(dn, sn, JSON.stringify(r));
        }
      }
    }
  } finally {
    await browser.close(); s1.close(); s2.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
