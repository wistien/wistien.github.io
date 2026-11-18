  // Nav scroll
  const navbar = document.getElementById('navbar');
  const toTop = document.getElementById('toTop');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
    toTop.classList.toggle('show', window.scrollY > 600);
  }, { passive: true });

  // Mobile menu
  let menuOpen = false;
  const mobileMenu = document.getElementById('mobileMenu');
  const hamburger = document.getElementById('hamburger');
  function toggleMenu() {
    menuOpen = !menuOpen;
    mobileMenu.classList.toggle('open', menuOpen);
    hamburger.classList.toggle('open', menuOpen);
    hamburger.setAttribute('aria-expanded', menuOpen);
    hamburger.setAttribute('aria-label', menuOpen ? '關閉選單' : '開啟選單');
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    if (menuOpen) mobileMenu.querySelector('a').focus();
  }
  function closeMenu() {
    menuOpen = false;
    mobileMenu.classList.remove('open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', '開啟選單');
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) { closeMenu(); hamburger.focus(); }
  });

  // Font size switcher
  const fsToggle = document.getElementById('fsToggle');
  const fsPanel = document.getElementById('fsPanel');
  const fsOpts = fsPanel.querySelectorAll('.fs-opt');
  function markFontSize(v) {
    fsOpts.forEach(b => b.setAttribute('aria-pressed', b.dataset.fs === v));
  }
  function openFsPanel(open) {
    fsPanel.hidden = !open;
    fsToggle.setAttribute('aria-expanded', open);
  }
  function setFontSize(v) {
    // 記住目前正在看的那一段，切換後捲回同一個位置
    const anchor = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight / 2, 220));
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    if (v === 'md') document.documentElement.removeAttribute('data-fs');
    else document.documentElement.setAttribute('data-fs', v);
    if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - before, behavior: 'instant' });
    try { localStorage.setItem('fontSize', v); } catch (e) {}
    markFontSize(v);
    if (typeof gtag === 'function') gtag('event', 'font_size_change', { size: v });
  }
  markFontSize(document.documentElement.getAttribute('data-fs') || 'md');
  fsToggle.addEventListener('click', () => openFsPanel(fsPanel.hidden));
  fsOpts.forEach(b => b.addEventListener('click', () => setFontSize(b.dataset.fs)));
  document.addEventListener('click', (e) => {
    if (!fsPanel.hidden && !e.target.closest('#fsSwitch')) openFsPanel(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !fsPanel.hidden) { openFsPanel(false); fsToggle.focus(); }
  });

  // Scroll reveal
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Passport stamp pop-in
  const stampObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('stamped'); stampObserver.unobserve(e.target); }
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.stamp').forEach(el => stampObserver.observe(el));

  // Carousel：第一張先載入，其餘在背景依序載入；還沒載好的那一張不會切過去
  // （輪播、跑馬燈、數字跑動只有首頁有；子頁沒有這些元素時，下面各段會自動略過）
  const slides = document.querySelectorAll('#carousel .slide');
  const slideImgs = Array.from(slides, s => s.querySelector('img'));
  const dotsWrap = document.getElementById('carDots');
  let current = 0, timer = null, wanted = 0, paused = false;
  function hydrate(i) {
    const img = slideImgs[i];
    if (!img || img.dataset.on) return;
    img.dataset.on = '1';
    const pic = img.parentNode;
    if (pic && pic.tagName === 'PICTURE') pic.querySelectorAll('source[data-srcset]').forEach(src => { src.srcset = src.dataset.srcset; });
    if (img.dataset.src) img.src = img.dataset.src;
  }
  function whenReady(i, cb) {
    hydrate(i);
    const img = slideImgs[i];
    if (!img || (img.complete && img.naturalWidth > 0)) { cb(); return; }
    const done = () => { img.removeEventListener('load', done); img.removeEventListener('error', done); cb(); };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  }
  slides.forEach((_, i) => {
    const d = document.createElement('button');
    d.className = 'car-dot' + (i === 0 ? ' active' : '');
    d.setAttribute('aria-label', '第 ' + (i + 1) + ' 張');
    d.addEventListener('click', () => { paused = false; goSlide(i); });
    dotsWrap.appendChild(d);
  });
  const dots = dotsWrap ? dotsWrap.querySelectorAll('.car-dot') : [];
  function schedule() { clearTimeout(timer); if (!paused) timer = setTimeout(() => goSlide(current + 1), 4800); }
  function goSlide(n) {
    const target = (n + slides.length) % slides.length;
    wanted = target;
    clearTimeout(timer);
    whenReady(target, () => {
      if (wanted !== target) return;
      if (target !== current) {
        slides[current].classList.remove('active');
        dots[current].classList.remove('active');
        current = target;
        slides[current].classList.add('active');
        dots[current].classList.add('active');
      }
      hydrate((current + 1) % slides.length);
      schedule();
    });
  }
  function moveSlide(dir) { paused = false; goSlide(current + dir); }
  const carousel = document.getElementById('carousel');
  let touchX = null;
  if (carousel && slides.length) {
    schedule();
    window.addEventListener('load', () => hydrate(1));
    carousel.addEventListener('mouseenter', () => { paused = true; clearTimeout(timer); });
    carousel.addEventListener('mouseleave', () => { paused = false; schedule(); });
    // Swipe
    carousel.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; paused = true; clearTimeout(timer); }, { passive: true });
    carousel.addEventListener('touchend', e => {
      paused = false;
      if (touchX === null) { schedule(); return; }
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) goSlide(current + (dx < 0 ? 1 : -1)); else schedule();
    }, { passive: true });
  }

  // 分隔照片與頁尾底圖：首屏之後才載入，並依瀏覽器與螢幕挑合適的檔案
  const bgEls = document.querySelectorAll('[data-bg]');
  function applyBg(el) {
    if (el.dataset.bgOn) return;
    // 用一張已經載入的 <picture> 圖判斷瀏覽器收不收 WebP：首頁看輪播第一張，子頁看導覽列的 logo
    const first = slideImgs[0] || document.querySelector('.nav-logo img');
    if (first && !first.currentSrc) { first.addEventListener('load', () => applyBg(el), { once: true }); return; }
    el.dataset.bgOn = '1';
    const webp = !!first && /\.webp(\?|$)/.test(first.currentSrc);
    const big = window.innerWidth > 900 || window.innerWidth * (window.devicePixelRatio || 1) > 1100;
    const url = webp ? '/images/opt/' + el.dataset.bg + (big ? '-1600' : '-1024') + '.webp' : '/images/' + el.dataset.bg + '.jpg';
    if (el.tagName === 'FOOTER') el.style.setProperty('--footer-photo', "url('" + url + "')");
    else el.style.backgroundImage = "url('" + url + "')";
  }
  const bgObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { applyBg(e.target); bgObserver.unobserve(e.target); } });
  }, { rootMargin: '1200px 0px' });
  bgEls.forEach(el => bgObserver.observe(el));
  window.addEventListener('load', () => setTimeout(() => bgEls.forEach(applyBg), 1500));

  // Count-up stats
  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      statObserver.unobserve(el);
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      const dur = 1400, t0 = performance.now();
      function tick(t) {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('.stat-num').forEach(el => statObserver.observe(el));

  // Scrollspy：只對頁內錨點（# 開頭）的連結作用；子頁的連結是 /#…，不會被改到
  const spyLinks = document.querySelectorAll('#navLinks a:not(.nav-cta)');
  const spyMap = {};
  spyLinks.forEach(a => { const href = a.getAttribute('href'); if (href.charAt(0) === '#') spyMap[href.slice(1)] = a; });
  const spyObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting && spyMap[e.target.id]) {
        spyLinks.forEach(a => a.classList.remove('active'));
        spyMap[e.target.id].classList.add('active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  document.querySelectorAll('section[id]').forEach(s => spyObserver.observe(s));

  // Marquee: duplicate content for seamless loop
  const track = document.getElementById('marqueeTrack');
  if (track) track.innerHTML += track.innerHTML;

  // GA4 event tracking
  if (typeof gtag === 'function') {
    document.querySelectorAll('a[href*="lin.ee"]').forEach(a => {
      a.addEventListener('click', () => gtag('event', 'line_click', { link_location: a.className.split(' ')[0] || 'link' }));
    });
    document.querySelectorAll('a.plat-card').forEach(a => {
      const nameEl = a.querySelector('.plat-name');
      a.addEventListener('click', () => gtag('event', 'platform_click', { platform: nameEl ? nameEl.textContent.trim() : 'unknown' }));
    });
    document.querySelectorAll('a.ins-card').forEach(a => {
      const nameEl = a.querySelector('.ins-name');
      a.addEventListener('click', () => gtag('event', 'agency_click', { agency: nameEl ? nameEl.textContent.trim() : 'unknown' }));
    });
  }

  // Copy Klook promo code
  function copyCode(e) {
    e.preventDefault(); e.stopPropagation();
    const btn = e.currentTarget;
    if (typeof gtag === 'function') gtag('event', 'copy_promo_code', { code: 'DREAM1010' });
    const done = () => { btn.textContent = '已複製 ✓'; setTimeout(() => { btn.textContent = '複製'; }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('DREAM1010').then(done).catch(done);
    } else {
      const ta = document.createElement('textarea');
      ta.value = 'DREAM1010'; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
    }
  }

  // 字體備援：平常只用 fonts/ 裡的子集檔。頁面若出現子集沒有的中文字
  //（改了文字但還沒重跑 _tools/build_fonts），才補載完整的 Google Fonts，字型不會跑掉。
  window.addEventListener('load', () => setTimeout(() => {
    try {
      const cover = {};
      document.fonts.forEach(f => {
        const fam = f.family.replace(/["']/g, '');
        (cover[fam] = cover[fam] || []).push(...f.unicodeRange.split(',').map(r => r.trim().slice(2).split('-').map(h => parseInt(h, 16))));
      });
      const missing = (fam, text) => {
        const ranges = cover[fam];
        if (!ranges) return false;
        for (const ch of text) {
          const cp = ch.codePointAt(0);
          if (cp < 0x2E80 || cp > 0xFFEF || (cp >= 0xFE00 && cp <= 0xFE0F)) continue; // 只檢查中文字與全形標點
          if (!ranges.some(r => cp >= r[0] && cp <= (r.length > 1 ? r[1] : r[0]))) return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node, need = false;
      while (!need && (node = walker.nextNode())) {
        const p = node.parentElement;
        if (!p || !node.nodeValue.trim() || /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
        need = missing(getComputedStyle(p).fontFamily.split(',')[0].trim().replace(/["']/g, ''), node.nodeValue);
      }
      if (need) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400..700&family=Noto+Sans+TC:wght@400..700&display=swap';
        document.head.insertBefore(link, document.querySelector('style')); // 放在站內樣式之前，子集檔仍然優先
      }
    } catch (e) {}
  }, 2000));
