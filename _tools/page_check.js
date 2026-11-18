// Checks for a single page of the built site (multi-page version).
//   node page_check.js nav  <distDir>                    smallest window width at which the desktop nav fits on one line, per font-size mode
//   node page_check.js menu <distDir> <path> <outDir>    open the mobile menu at a few phone sizes: does everything fit / can it be reached?
//   node page_check.js page <distDir> <path> <outDir>    screenshots + console errors + Google Fonts fallback + horizontal overflow
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 4611;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const MODES = ['md', 'lg', 'xl'];
const setMode = (page, mode) => page.evaluateOnNewDocument(m => { try { localStorage.setItem('fontSize', m); } catch (e) {} }, mode);
// Same idea as compare.js: finish entrance animations at once so a capture shows the settled page.
const FREEZE = '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}';

async function navFit(browser, base) {
  for (const mode of MODES) {
    const page = await browser.newPage();
    await setMode(page, mode);
    await page.setViewport({ width: 2200, height: 900, deviceScaleFactor: 1 });
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.addStyleTag({ content: '.nav-links{display:flex!important}.hamburger{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    const measure = () => page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('#navLinks a'));
      const logo = document.querySelector('.nav-logo').getBoundingClientRect();
      const ul = document.getElementById('navLinks').getBoundingClientRect();
      return {
        n: links.length,
        linkH: Math.max(...links.map(a => a.getBoundingClientRect().height)),
        logoTextH: document.querySelector('.nav-logo-text').getBoundingClientRect().height,
        navH: document.getElementById('navbar').getBoundingClientRect().height,
        gap: Math.round(ul.left - logo.right),
        client: document.documentElement.clientWidth,
      };
    });
    const ref = await measure();
    let minFit = null, atMin = null;
    for (let w = 1800; w >= 1000; w -= 10) {
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      const m = await measure();
      const fits = m.linkH <= ref.linkH + 0.5 && m.logoTextH <= ref.logoTextH + 0.5 && m.navH <= ref.navH + 0.5 && m.gap >= 24;
      if (!fits) break;
      minFit = w; atMin = m;
    }
    console.log(`mode ${mode}: ${ref.n} links, fits on one line (logo gap >= 24px) down to window width ${minFit}px (layout width ${atMin && atMin.client}, gap ${atMin && atMin.gap}px)`);
    await page.close();
  }
}

async function menuCheck(browser, base, urlPath, outDir) {
  const sizes = [[390, 844], [360, 640], [375, 553]];
  for (const mode of MODES) {
    for (const [w, h] of sizes) {
      const page = await browser.newPage();
      await setMode(page, mode);
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.goto(base + urlPath, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => toggleMenu());
      await sleep(300);
      const m = await page.evaluate(() => {
        const menu = document.getElementById('mobileMenu');
        const links = Array.from(menu.querySelectorAll('a'));
        const nav = document.getElementById('navbar').getBoundingClientRect();
        menu.scrollTop = 0;
        const firstTop = links[0].getBoundingClientRect().top;
        menu.scrollTop = menu.scrollHeight;
        const lastBottom = links[links.length - 1].getBoundingClientRect().bottom;
        menu.scrollTop = 0;
        return { n: links.length, scrollH: menu.scrollHeight, clientH: menu.clientHeight, navBottom: Math.round(nav.bottom), firstTop: Math.round(firstTop), lastBottom: Math.round(lastBottom), vh: window.innerHeight };
      });
      const reachable = m.firstTop >= m.navBottom - 1 && m.lastBottom <= m.vh + 1;
      console.log(`menu ${urlPath} ${mode} ${w}x${h}: ${m.n} links, content ${m.scrollH}px in ${m.clientH}px, first link top ${m.firstTop} (nav bottom ${m.navBottom}), last link bottom ${m.lastBottom} after scrolling (viewport ${m.vh}) -> ${reachable ? 'all reachable' : 'NOT all reachable'}`);
      if (outDir && mode === 'md' && w === 390) {
        fs.mkdirSync(outDir, { recursive: true });
        await page.screenshot({ path: path.join(outDir, `menu${urlPath.replace(/\//g, '_')}${w}.png`) });
      }
      await page.close();
    }
  }
}

async function pageCheck(browser, base, urlPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const devices = {
    phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    small: { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  };
  const name = urlPath.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'home';
  let problems = 0;
  for (const [dn, vp] of Object.entries(devices)) {
    for (const mode of MODES) {
      const page = await browser.newPage();
      await setMode(page, mode);
      await page.setViewport(vp);
      await page.setCacheEnabled(false);
      const log = [], reqs = [];
      page.on('console', m => { if (['error', 'warning'].includes(m.type())) log.push(`console.${m.type()}: ${m.text()}`); });
      page.on('pageerror', e => log.push('pageerror: ' + e.message));
      page.on('requestfailed', r => log.push(`requestfailed: ${r.url()} (${r.failure() && r.failure().errorText})`));
      page.on('response', r => { if (r.status() >= 400) log.push(`http ${r.status()}: ${r.url()}`); });
      page.on('request', r => reqs.push(r.url()));
      await page.goto(base + urlPath, { waitUntil: 'load', timeout: 120000 });
      await page.evaluate(() => document.fonts.ready);
      await sleep(3200); // the font fallback check runs 2 s after load
      await page.addStyleTag({ content: FREEZE });
      const H = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < H; y += Math.round(vp.height * 0.8)) { await page.evaluate(yy => window.scrollTo(0, yy), y); await sleep(120); }
      await sleep(1800); // footer photo arrives
      const info = await page.evaluate(() => {
        const de = document.documentElement;
        const vw = de.clientWidth;
        const out = [];
        document.querySelectorAll('body *').forEach(el => {
          if (el.closest('.hero-deco, .mobile-menu, .fs-panel, .marquee-strip')) return; // the marquee runs past the edge on purpose and is clipped by its strip
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} [${Math.round(r.left)}..${Math.round(r.right)}] of ${vw}`);
        });
        const fonts = Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '') + (f.style === 'italic' ? ' italic' : ''));
        const footerPhoto = getComputedStyle(document.querySelector('footer')).getPropertyValue('--footer-photo');
        return { overflowX: de.scrollWidth - de.clientWidth, outside: out.slice(0, 8), fonts: Array.from(new Set(fonts)), footerPhoto, navActive: Array.from(document.querySelectorAll('#navLinks a.active')).map(a => a.textContent), title: document.title, h1: (document.querySelector('h1') || {}).textContent };
      });
      const google = reqs.filter(u => /fonts\.(googleapis|gstatic)\.com/.test(u));
      const bad = log.length || google.length || info.overflowX > 0 || info.outside.length;
      if (bad) problems++;
      console.log(`${name} ${dn} ${mode}: height ${H}px, overflowX ${info.overflowX}, outside viewport ${info.outside.length}, Google Fonts requests ${google.length}, console/network problems ${log.length}${bad ? '  <-- CHECK' : ''}`);
      if (mode === 'md') console.log(`   requests ${reqs.length}; fonts loaded: ${info.fonts.join(', ')}; footer photo: ${info.footerPhoto.trim()}; nav active: ${JSON.stringify(info.navActive)}`);
      info.outside.forEach(o => console.log('   outside: ' + o));
      log.forEach(l => console.log('   ' + l));
      google.slice(0, 3).forEach(u => console.log('   google: ' + u));
      if (dn !== 'small' || mode !== 'md') {
        // per-screen captures (readable one by one)
        if ((dn === 'phone') || (dn === 'desktop' && mode === 'md') || (dn === 'small' && mode === 'xl')) {
          let i = 0;
          for (let y = 0; y < H; y += vp.height) {
            await page.evaluate(yy => window.scrollTo(0, yy), y);
            await sleep(250);
            await page.screenshot({ path: path.join(outDir, `${name}-${dn}-${mode}-s${String(i).padStart(2, '0')}.png`) });
            i++;
          }
        }
      }
      if (mode === 'md' && dn !== 'small') {
        // whole page in one image; the floating buttons are hidden because a stitched image would show them stuck in the middle of the page
        await page.addStyleTag({ content: '.fs-switch,.line-fab,.to-top{display:none!important}' });
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);
        await page.screenshot({ path: path.join(outDir, `${name}-${dn}-full.png`), fullPage: true });
      }
      await page.close();
    }
  }
  console.log(problems ? `${problems} combination(s) need a look` : 'no problems found');
}

(async () => {
  const [cmd, distDir, urlPath, outDir] = process.argv.slice(2);
  const server = await serve(path.resolve(distDir), PORT);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const base = `http://127.0.0.1:${PORT}`;
  try {
    if (cmd === 'nav') await navFit(browser, base);
    else if (cmd === 'menu') await menuCheck(browser, base, urlPath, outDir);
    else if (cmd === 'page') await pageCheck(browser, base, urlPath, outDir);
    else console.log('unknown command');
  } finally {
    await browser.close(); server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
