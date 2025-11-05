const THEME_KEY = 'theme-preference';
const root = document.documentElement;
// Safer base path detection: works whether Vite replaces import.meta.env or not
const basePath = (() => {
  try {
    const raw = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/Creation_notes/';
    return raw.endsWith('/') ? raw : `${raw}/`;
  } catch (_) {
    return '/Creation_notes/';
  }
})();

const runtimeConfig = (() => {
  try {
    if (typeof window !== 'undefined' && window.__SITE_PREFS) {
      return window.__SITE_PREFS;
    }
  } catch (_) {
    // ignore
  }
  return {};
})();

function resolveWithBase(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) {
    const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    if (!base || base === '/') return path;
    return `${base}${path}`;
  }
  return path;
}

const subscribeUnsubscribeUrl = (() => {
  let raw = null;
  try {
    if (typeof document !== 'undefined' && document.documentElement?.dataset?.subscribeUser) {
      raw = document.documentElement.dataset.subscribeUser;
    }
  } catch (_) {
    raw = null;
  }
  if (!raw && runtimeConfig.subscribeUser) {
    raw = runtimeConfig.subscribeUser;
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const user = raw.trim();
    return {
      manage: `https://buttondown.email/${user}`,
      manageWithEmail: (email) => {
        const base = `https://buttondown.email/${user}`;
        if (!email) return `${base}?unsubscribe=1`;
        return `${base}?email=${encodeURIComponent(email)}&unsubscribe=1`;
      },
      list: user,
    };
  }
  return null;
})();
const subscribeUnsubLink = subscribeUnsubscribeUrl ? `<button type="button" class="pref-subscribe-unsub" data-subscribe-unsub>Manage / Unsubscribe</button>` : '';

let searchOverlay = null;
let searchInput = null;
let prevActiveElement = null;
let lightboxInitialized = false; // 防止重复初始化lightbox
let prefsDelegateAttached = false;

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Wait for DOM to be ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePreferences);
  } else {
    // DOM already loaded
    initializePreferences();
  }
}

async function initializePreferences() {
  console.log('[Prefs Debug] initializePreferences called, readyState:', document.readyState);
  console.log('[Prefs Debug] document.body exists:', !!document.body);
  console.log('[Prefs Debug] Current location:', window.location.href);
  
  // Default to light theme (not following system preference unless explicitly set)
  const storedTheme = readStoredTheme();
  const initialTheme = storedTheme !== null ? storedTheme : 'light';
  applyTheme(initialTheme, { persist: storedTheme === null }); // persist if first visit
  syncThemeButtons(initialTheme);

  const prefersDarkMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
  prefersDarkMedia?.addEventListener?.('change', (event) => {
    if (!readStoredTheme()) {
      const next = event.matches ? 'dark' : 'light';
      applyTheme(next, { persist: false });
      syncThemeButtons(next);
    }
  });

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      const current = root.dataset.theme === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      syncThemeButtons(next);
    });
  });

  // language toggle removed for English-only site; UI retains icon only

  document.querySelectorAll('[data-search-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      openSearchOverlay();
    });
  });

  // prefs toggle (header new icon) -> open prefs overlay
  const prefsToggles = document.querySelectorAll('[data-prefs-toggle]');
  console.log('[Prefs Debug] Found prefs toggle buttons:', prefsToggles.length);
  console.log('[Prefs Debug] All elements with class containing "prefs":', document.querySelectorAll('[class*="prefs"]').length);
  console.log('[Prefs Debug] Header exists:', !!document.querySelector('header'));
  
  if (prefsToggles.length === 0) {
    console.warn('[Prefs Debug] WARNING: No prefs toggle buttons found! Checking DOM...');
    console.log('[Prefs Debug] Body HTML (first 500 chars):', document.body?.innerHTML?.substring(0, 500));
  }
  
  prefsToggles.forEach((button, idx) => {
    console.log(`[Prefs Debug] Attaching listener to button ${idx}:`, button);
    button.addEventListener('click', (e) => {
      console.log('[Prefs Debug] Direct click on prefs toggle button');
      e.preventDefault();
      e.stopPropagation();
      openPrefsOverlay();
    });
  });

  // Fallback: attach a delegated click handler so clicks still work if direct listeners fail
  try {
    if (!prefsDelegateAttached) {
      document.addEventListener('click', function (ev) {
        try {
          const btn = ev.target && ev.target.closest && ev.target.closest('[data-prefs-toggle]');
          if (btn) {
            console.log('[Prefs Debug] Delegated click on prefs toggle');
            ev.preventDefault();
            ev.stopPropagation();
            openPrefsOverlay();
          }
        } catch (e) {
          console.error('[Prefs Debug] Error in delegated handler:', e);
        }
      }, false);
      prefsDelegateAttached = true;
      console.log('[Prefs Debug] Delegated handler attached');
    }
  } catch (e) {
    console.error('[Prefs Debug] Error attaching delegated handler:', e);
  }

  // initialize header language badge (EN / ZH) if present
  try {
    syncLangBadge();
  } catch (e) { /* noop */ }

  // subscribe toggle - open a small subscribe dialog (created on demand)
  document.querySelectorAll('[data-subscribe-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      openSubscribeOverlay();
    });
  });

  // 延迟光箱初始化，确保图片已渲染且lightbox.js已加�?
  setTimeout(() => {
    if (!lightboxInitialized && typeof window.initLightboxAuto === 'function') {
      const images = document.querySelectorAll('.md-content.pswp-featured img[data-full]');
      if (images.length > 0) {
        lightboxInitialized = true;
        window.initLightboxAuto();
      }
    }
  }, 200);
}

// Update the small language badge shown on the header prefs icon
function syncLangBadge() {
  try {
    const badge = document.querySelector('.lang-badge');
    if (!badge) return;
    const htmlLang = document.documentElement.lang || '';
    const path = (window.location.pathname || '/');
    const normalized = path.endsWith('/') ? path : path + '/';
    const isZh = htmlLang === 'zh' || /(^|\/)zh(\/|$)/.test(normalized) || /\/zh\/$/.test(normalized) || /^\/zh(\/|$)/.test(normalized);
    const txt = isZh ? 'ZH' : 'EN';
    badge.textContent = txt;
    // Also add a language class to the prefs toggle so CSS variants apply
    try {
      document.querySelectorAll('[data-prefs-toggle]').forEach((btn) => {
        if (!btn.classList) return;
        btn.classList.remove('lang-en', 'lang-zh');
        btn.classList.add(isZh ? 'lang-zh' : 'lang-en');
      });
    } catch (e) {}
  } catch (e) {}
}

function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch (_) {
    // ignore storage errors
  }
  return null;
}

function getSystemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, { persist = true } = {}) {
  root.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      // storage might be unavailable
    }
  }
}

function syncThemeButtons(theme) {
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('data-theme-current', theme);
    const title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('title', title);
  });
}

// language storage and toggle removed; site is English-only by default

function ensureSearchOverlay() {
  if (searchOverlay) return;

  searchOverlay = document.createElement('div');
  searchOverlay.className = 'pref-search-overlay';
  searchOverlay.innerHTML = `
    <div class="pref-search-dialog" role="dialog" aria-modal="true" aria-labelledby="pref-search-title">
      <div class="pref-search-header">
        <h2 class="pref-search-title" id="pref-search-title">Search</h2>
        <button type="button" class="pref-search-close" aria-label="Close search">&times;</button>
      </div>
      <form class="pref-search-form">
        <input type="search" class="pref-search-input" name="q" placeholder="Search this site..." autocomplete="off" />
      </form>
      <p class="pref-search-hint">Enter a keyword and press Enter to search the site via Google. Press Esc to close.</p>
    </div>
  `;

  document.body.appendChild(searchOverlay);

  const closeBtn = searchOverlay.querySelector('.pref-search-close');
  const form = searchOverlay.querySelector('.pref-search-form');
  searchInput = searchOverlay.querySelector('.pref-search-input');

  closeBtn.addEventListener('click', closeSearchOverlay);
  searchOverlay.addEventListener('click', (event) => {
    if (event.target === searchOverlay) {
      closeSearchOverlay();
    }
  });
  form.addEventListener('submit', onSearchSubmit);
  // (Search overlay only handles search input; theme/language moved to a separate prefs overlay)
  document.addEventListener('keydown', onGlobalKeydown);
}

/* Preferences overlay (theme + language) - separate from search */
let prefsOverlay = null;
let prefsKeydownHandler = null;
function ensurePrefsOverlay() {
  if (prefsOverlay) return;
  prefsOverlay = document.createElement('div');
  prefsOverlay.className = 'pref-search-overlay pref-prefs-overlay';
  prefsOverlay.innerHTML = `
    <style>
  .pref-prefs-overlay { position: fixed; inset: 0; display:none; align-items:center; justify-content:center; z-index:2147483647; background: rgba(12, 12, 15, 0.65); backdrop-filter: blur(12px); }
  .pref-prefs-overlay.is-open { display:flex; }
  .pref-prefs-overlay .pref-dialog { width: min(720px, calc(100% - 48px)); background: var(--surface); color: rgb(var(--black)); border-radius: 12px; box-shadow: var(--box-shadow); overflow: hidden; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; }
  html[data-theme="dark"] .pref-prefs-overlay .pref-dialog { background: var(--surface); color: rgb(var(--black)); }
      .pref-prefs-overlay .pref-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-header { border-bottom-color: rgba(255,255,255,0.04); }
  .pref-prefs-overlay .pref-title { margin:0; font-size:1.05rem; font-weight:700; color: rgb(var(--black)); }
      .pref-prefs-overlay .pref-close { background:transparent;border:0;font-size:1.35rem;line-height:1;cursor:pointer;padding:6px;border-radius:6px; color: rgb(var(--black)); }
  .pref-prefs-overlay .pref-close:hover { background: rgba(0,0,0,0.04); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-close { color: rgb(var(--gray-dark)); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-close:hover { background: rgba(255,255,255,0.04); }
      .pref-prefs-overlay .pref-body { padding:18px 20px 22px; }
      .pref-prefs-overlay .pref-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:14px; }
      @media (max-width: 560px) { .pref-prefs-overlay .pref-grid { grid-template-columns: 1fr; } }
  .pref-prefs-overlay .pref-card { background: var(--card-section, rgba(0,0,0,0.02)); padding:14px; border-radius:10px; display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
  html[data-theme="dark"] .pref-prefs-overlay .pref-card { background: rgba(255,255,255,0.02); }
      .pref-prefs-overlay .pref-card .card-top { display:flex; gap:12px; align-items:center; width:100%; }
    .pref-prefs-overlay .pref-card .card-title { font-weight:700; font-size:0.98rem; color: rgb(var(--black)); }
  .pref-prefs-overlay .pref-card .card-desc { font-size:0.86rem; color: rgba(var(--gray-dark), 0.85); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-card .card-desc { color: rgba(var(--gray-dark), 0.85); }
      .pref-prefs-overlay .pref-actions { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .pref-prefs-overlay .pref-btn { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; border:1px solid rgba(0,0,0,0.06); background:transparent; cursor:pointer; font-weight:600; }
  .pref-prefs-overlay .pref-btn:hover { background: rgba(0,0,0,0.04); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-btn:hover { background: rgba(255,255,255,0.03); }
  /* Theme segmented control */
  .pref-prefs-overlay .segmented { position: relative; display:inline-flex; background: var(--surface); border:1px solid rgba(var(--gray),0.08); border-radius:999px; padding:4px; gap:4px; }
  .pref-prefs-overlay .segmented::before { content: ''; position: absolute; top: 4px; left: 4px; width: var(--indicator-width, 0); height: calc(100% - 8px); background: var(--accent); border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); transform: translateX(var(--indicator-offset, 0)); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); will-change: transform, width; z-index: 0; pointer-events: none; }
  .pref-prefs-overlay .segmented .seg-btn { position: relative; z-index: 1; appearance:none; border:0; background:transparent; padding:8px 12px; border-radius:999px; cursor:pointer; font-weight:600; color: rgb(var(--gray-dark)); display:inline-flex; align-items:center; gap:8px; transition: color 0.3s ease; }
  .pref-prefs-overlay .segmented .seg-btn.is-active { background: transparent; color: #fff; box-shadow: none; }
  .pref-prefs-overlay .segmented .seg-btn:focus { outline:2px solid rgba(var(--accent),0.12); outline-offset:2px; }
  /* hide old switch styles (no-op but kept for compatibility) */
  .pref-prefs-overlay .pref-switch { display:none !important; }
  .pref-prefs-overlay .lang-switch .pref-lang-btn { border:1px solid rgba(0,0,0,0.06); }
  html[data-theme="dark"] .pref-prefs-overlay .lang-switch .pref-lang-btn { border:1px solid rgba(255,255,255,0.04); }
      .pref-prefs-overlay .lang-switch { display:flex; gap:8px; }
      .pref-prefs-overlay .lang-switch .pref-lang-btn { padding:8px 12px; border-radius:8px; border:1px solid rgba(0,0,0,0.08); background:transparent; cursor:pointer; }
  html[data-theme="dark"] .pref-prefs-overlay .lang-switch .pref-lang-btn { border-color: rgba(255,255,255,0.04); }
      .pref-prefs-overlay .pref-card small { opacity:0.9; }
    </style>

    <div class="pref-dialog" role="dialog" aria-modal="true" aria-labelledby="pref-prefs-title">
      <div class="pref-header">
        <h2 class="pref-title" id="pref-prefs-title">Preferences</h2>
        <div>
          <button type="button" class="pref-close" aria-label="Close preferences">&times;</button>
        </div>
      </div>
      <div class="pref-body">
        <div class="pref-grid">
          <div class="pref-card" role="group" aria-label="Theme">
            <div class="card-top">
              <div style="flex:1">
                <div class="card-title">Theme</div>
                <div class="card-desc">Switch between light and dark themes. Your preference is saved locally.</div>
              </div>
              <div class="pref-actions">
                <div class="segmented pref-seg-theme" role="tablist" aria-label="Theme selector">
                  <button type="button" class="seg-btn" data-theme-option="light" aria-pressed="false" title="Light">☀︎ <span style="margin-left:6px">Light</span></button>
                  <button type="button" class="seg-btn" data-theme-option="dark" aria-pressed="false" title="Dark">☾ <span style="margin-left:6px">Dark</span></button>
                </div>
              </div>
            </div>
            
          </div>

          <div class="pref-card" role="group" aria-label="Language">
            <div class="card-top">
              <div style="flex:1">
                <div class="card-title">Language</div>
                <div class="card-desc">Switch site language between English and 中文（Chinese）.</div>
              </div>
              <div class="pref-actions">
                <div class="segmented pref-seg-lang" role="tablist" aria-label="Language selector">
                  <button type="button" class="seg-btn" data-lang="en" aria-pressed="false" title="English">EN</button>
                  <button type="button" class="seg-btn" data-lang="zh" aria-pressed="false" title="中文">中文</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(prefsOverlay);
  const closeBtn = prefsOverlay.querySelector('.pref-close');
  closeBtn.addEventListener('click', closePrefsOverlay);
  prefsOverlay.addEventListener('click', (ev) => { if (ev.target === prefsOverlay) closePrefsOverlay(); });
  // close on Escape key while prefs overlay is open
  prefsKeydownHandler = function (ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      if (prefsOverlay && prefsOverlay.classList.contains('is-open')) {
        ev.preventDefault();
        closePrefsOverlay();
      }
    }
  };
  document.addEventListener('keydown', prefsKeydownHandler);
  

  // Helper function to update segmented indicator position
  function updateSegIndicator(segmentedContainer) {
    try {
      const activeBtn = segmentedContainer.querySelector('.seg-btn.is-active');
      if (!activeBtn) return;
      const containerRect = segmentedContainer.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const offset = btnRect.left - containerRect.left - 4; // 4px is the container padding
      const width = btnRect.width;
      segmentedContainer.style.setProperty('--indicator-offset', `${offset}px`);
      segmentedContainer.style.setProperty('--indicator-width', `${width}px`);
    } catch (e) { /* noop */ }
  }

  // segmented controls: theme and language (preserve function names for openPrefsOverlay)
  function setThemeSwitchState() {
    try {
      const seg = prefsOverlay.querySelector('.pref-seg-theme');
      if (!seg) return;
      const cur = root.dataset.theme === 'dark' ? 'dark' : 'light';
      seg.querySelectorAll('[data-theme-option]').forEach((btn) => {
        const v = btn.getAttribute('data-theme-option');
        const active = v === cur;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.toggle('is-active', active);
      });
      // Update indicator position after state change
      requestAnimationFrame(() => updateSegIndicator(seg));
    } catch (e) { /* noop */ }
  }
  const themeSegBtns = prefsOverlay.querySelectorAll('.pref-seg-theme [data-theme-option]');
  themeSegBtns.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const v = ev.currentTarget && ev.currentTarget.getAttribute('data-theme-option');
      if (!v) return;
      applyTheme(v);
      syncThemeButtons(v);
      try { setThemeSwitchState(); } catch (e) {}
    });
  });

  function setLangSwitchState() {
    try {
      const seg = prefsOverlay.querySelector('.pref-seg-lang');
      if (!seg) return;
      const path = (window.location.pathname || '/');
      const normalized = path.endsWith('/') ? path : path + '/';
      const isZh = document.documentElement.lang === 'zh' || /(^|\/)zh(\/|$)/.test(normalized);
      seg.querySelectorAll('[data-lang]').forEach((btn) => {
        const v = btn.getAttribute('data-lang');
        const active = (v === 'zh') ? isZh : !isZh;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.toggle('is-active', active);
      });
      // Update indicator position after state change
      requestAnimationFrame(() => updateSegIndicator(seg));
    } catch (e) { /* noop */ }
  }
  const langSegBtns = prefsOverlay.querySelectorAll('.pref-seg-lang [data-lang]');
  langSegBtns.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const v = ev.currentTarget && ev.currentTarget.getAttribute('data-lang');
      if (!v) return;
      // update header badge immediately if present (non-blocking)
      try {
        const badge = document.querySelector('.lang-badge');
        if (badge) badge.textContent = v === 'zh' ? 'ZH' : 'EN';
      } catch (e) {}

      const curPath = window.location.pathname || '/';
      const pathWithSlash = curPath.endsWith('/') ? curPath : curPath + '/';
      if (v === 'zh') {
        let target = pathWithSlash;
        if (!/^\/zh\//.test(target)) target = ('/zh' + (target.startsWith('/') ? '' : '/') + target).replace(/\/+/g, '/');
        target = target.replace(/\/+/g, '/');
        window.location.href = target;
      } else {
        let target = pathWithSlash;
        if (/^\/zh\//.test(target)) target = target.replace(/^\/zh/, '');
        if (!target || target === '') target = '/';
        target = target.replace(/\/+/g, '/');
        window.location.href = target;
      }
    });
  });

  // ensure segmented reflect current state
  try { setThemeSwitchState(); } catch (e) {}
  try { setLangSwitchState(); } catch (e) {}
  
  // Update indicators on window resize
  let resizeHandler = null;
  resizeHandler = function() {
    try {
      const themeSeg = prefsOverlay.querySelector('.pref-seg-theme');
      const langSeg = prefsOverlay.querySelector('.pref-seg-lang');
      if (themeSeg) updateSegIndicator(themeSeg);
      if (langSeg) updateSegIndicator(langSeg);
    } catch (e) {}
  };
  window.addEventListener('resize', resizeHandler);
  
  // Store handler for cleanup
  if (!prefsOverlay._resizeHandler) {
    prefsOverlay._resizeHandler = resizeHandler;
  }
}

function openPrefsOverlay() {
  console.log('[Prefs Debug] openPrefsOverlay called');
  ensurePrefsOverlay();
  if (prefsOverlay.classList.contains('is-open')) {
    console.log('[Prefs Debug] Overlay already open, skipping');
    return;
  }
  console.log('[Prefs Debug] Opening overlay');
  prevActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  prefsOverlay.classList.add('is-open');
  // ensure the overlay's theme buttons reflect current theme when opened
  try { if (typeof setThemeSwitchState === 'function') setThemeSwitchState(); } catch (e) {}
  try { if (typeof setLangSwitchState === 'function') setLangSwitchState(); } catch (e) {}
  document.body.dataset.prefSearchLock = 'true';
  document.body.style.overflow = 'hidden';
  console.log('[Prefs Debug] Overlay opened successfully');
}

function closePrefsOverlay() {
  console.log('[Prefs Debug] closePrefsOverlay called');
  if (!prefsOverlay) return;
  // Clean up resize handler
  try {
    if (prefsOverlay._resizeHandler) {
      window.removeEventListener('resize', prefsOverlay._resizeHandler);
      delete prefsOverlay._resizeHandler;
    }
  } catch (e) {}
  // hide then fully remove the overlay so its <style> does not leak and hide header icons
  try {
    prefsOverlay.classList.remove('is-open');
  } catch (e) {}
  try { document.body.style.overflow = ''; } catch (e) {}
  try { delete document.body.dataset.prefSearchLock; } catch (e) {}
  try { if (prefsKeydownHandler) document.removeEventListener('keydown', prefsKeydownHandler); } catch(e) {}
  try { if (prefsOverlay.parentNode) prefsOverlay.parentNode.removeChild(prefsOverlay); } catch (e) {}
  prefsOverlay = null;
  if (prevActiveElement) prevActiveElement.focus();
  // Trigger a resize so header logic re-evaluates layout (safeguard)
  try { window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } catch (e) {}
  console.log('[Prefs Debug] Overlay closed');
}

function openSearchOverlay() {
  ensureSearchOverlay();
  if (searchOverlay.classList.contains('is-open')) return;

  prevActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  searchOverlay.classList.add('is-open');
  document.body.dataset.prefSearchLock = 'true';
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    searchInput?.focus();
    searchInput?.select();
  });
}

function closeSearchOverlay() {
  if (!searchOverlay) return;
  searchOverlay.classList.remove('is-open');
  document.body.style.overflow = '';
  delete document.body.dataset.prefSearchLock;

  if (prevActiveElement) {
    prevActiveElement.focus();
  }
}

function onSearchSubmit(event) {
  event.preventDefault();
  if (!searchInput) return;
  const query = searchInput.value.trim();
  if (!query) {
    closeSearchOverlay();
    return;
  }

  const site = location.origin.replace(/\/$/, '');
  const url = `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${query}`)}`;
  window.open(url, '_blank', 'noopener');
  closeSearchOverlay();
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape' && searchOverlay?.classList.contains('is-open')) {
    event.preventDefault();
    closeSearchOverlay();
  }
}

let subscribeOverlay = null;
let toastContainer = null;
function ensureSubscribeOverlay() {
  if (subscribeOverlay) return;

  subscribeOverlay = document.createElement('div');
  subscribeOverlay.className = 'pref-subscribe-overlay';
  subscribeOverlay.innerHTML = `
    <div class="pref-subscribe-dialog" role="dialog" aria-modal="true" aria-labelledby="pref-subscribe-title">
      <div class="pref-subscribe-header">
        <h2 class="pref-subscribe-title" id="pref-subscribe-title">Subscribe</h2>
        <button type="button" class="pref-subscribe-close" aria-label="Close subscribe">&times;</button>
      </div>
      <div class="pref-subscribe-body">
        <p class="pref-subscribe-desc">Get updates for new posts and portfolio additions. No spam.</p>
        <p class="pref-subscribe-desc pref-subscribe-desc-note">
          Subscribing opens Buttondown (my email provider) in a new tab so you can confirm the request directly. If you are unsure whether it worked, just drop a note to <a href="mailto:elkoutopia@gmail.com">elkoutopia@gmail.com</a> and I will check it for you.
        </p>
        <div class="subscribe-form pref-subscribe-form">
          <div class="pref-subscribe-note">I respect your privacy. Unsubscribe anytime.</div>
          <div class="sf-message" aria-live="polite" style="display:none"></div>
        </div>
        <div class="pref-subscribe-actions">
          <button type="button" class="pref-subscribe-cta" data-subscribe-open>Subscribe</button>
          ${subscribeUnsubLink ? subscribeUnsubLink : ''}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(subscribeOverlay);

  const closeBtn = subscribeOverlay.querySelector('.pref-subscribe-close');
  closeBtn.addEventListener('click', closeSubscribeOverlay);

  subscribeOverlay.addEventListener('click', (event) => {
    if (event.target === subscribeOverlay) {
      closeSubscribeOverlay();
    }
  });

  // Ensure dialog is not covered by header on small screens: add a small top margin equal to header height
  try {
    const headerEl = document.querySelector && document.querySelector('header');
    const dialog = subscribeOverlay.querySelector('.pref-subscribe-dialog');
    if (headerEl && dialog && window.innerWidth <= 820) {
      const hdrRect = headerEl.getBoundingClientRect();
      // add a bit of breathing room
      dialog.style.marginTop = Math.max(8, Math.round(hdrRect.height)) + 'px';
    }
  } catch (e) {
    // noop
  }

  if (typeof window.attachSubscribeForms === 'function') {
    window.attachSubscribeForms(subscribeOverlay);
  }
}

function ensureToastContainer() {
  if (toastContainer) return toastContainer;
  if (typeof document === 'undefined') return null;
  toastContainer = document.createElement('div');
  toastContainer.className = 'pref-toast-container';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

function showSubscribeToast(message, type = 'success') {
  const container = ensureToastContainer();
  if (!container) return () => {};

  const toast = document.createElement('div');
  toast.className = `pref-toast pref-toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });
  const lifetime = 8000;

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    toast.classList.remove('is-visible');
    setTimeout(() => {
      try {
        container.removeChild(toast);
      } catch (_) {}
    }, 280);
  };

  const timer = setTimeout(remove, lifetime);

  return () => {
    clearTimeout(timer);
    remove();
  };
}

function openSubscribeOverlay() {
  ensureSubscribeOverlay();
  if (subscribeOverlay.classList.contains('is-open')) return;
  prevActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  subscribeOverlay.classList.add('is-open');
  document.body.dataset.prefSubscribeLock = 'true';
  document.body.style.overflow = 'hidden';
}

function closeSubscribeOverlay() {
  if (!subscribeOverlay) return;
  subscribeOverlay.classList.remove('is-open');
  document.body.style.overflow = '';
  delete document.body.dataset.prefSubscribeLock;
  if (prevActiveElement) prevActiveElement.focus();
}

document.addEventListener('subscribe:success', (event) => {
  closeSubscribeOverlay();
  const email = event && event.detail && event.detail.email;
  const msg = email ? `Subscribed as ${email}. Please check your inbox.` : 'Subscribed successfully. Please check your inbox.';
  showSubscribeToast(msg, 'success');
});

document.addEventListener('subscribe:error', (event) => {
  const detail = (event && event.detail) || {};
  const message = detail.error || 'Subscription failed. Please try again later.';
  showSubscribeToast(message, 'error');
});

document.addEventListener('subscribe:external', (event) => {
  const detail = (event && event.detail) || {};
  const url = detail.url;
  const msg = url
    ? 'Please finish subscribing on Buttondown. If nothing opened, allow popups and try again.'
    : 'Please finish subscribing on Buttondown in the newly opened tab.';
  showSubscribeToast(msg, 'info');
});

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches('[data-subscribe-unsub]')) return;
  event.preventDefault();
  if (!subscribeUnsubscribeUrl) {
    showSubscribeToast('Unable to locate unsubscribe endpoint. Please use the unsubscribe link at the bottom of any newsletter email.', 'error');
    return;
  }

  closeSubscribeOverlay();
  const targetUrl = subscribeUnsubscribeUrl.manageWithEmail
    ? subscribeUnsubscribeUrl.manageWithEmail('')
    : subscribeUnsubscribeUrl.manage;
  window.open(targetUrl, '_blank', 'noopener');
  showSubscribeToast('Opened the Buttondown unsubscribe page in a new tab. If your browser blocks it, allow popups for this site.', 'info');
});


