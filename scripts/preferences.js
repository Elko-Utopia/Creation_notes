const THEME_KEY = 'theme-preference';
const root = document.documentElement;
// Safer base path detection: prefer build-time BASE_URL (if this script is bundled),
// then <base href> in the HTML. Do NOT infer base from the current page path segment
// because that causes redirects like /contact/search when running on /contact/.
const basePath = (() => {
  try {
    // Prefer runtime-injected global (set by BaseHead) so scripts loaded from
    // /<base>/public/... can discover the correct subpath on GH Pages.
    if (typeof window !== 'undefined' && window.__ASTRO_BASE_URL__) {
      // If an absolute base was injected (including origin), be careful:
      // when running locally (localhost) the injected origin may point to
      // the published GitHub Pages host. In that case prefer a path-only
      // base so redirects resolve against the current origin.
      try {
        const injected = String(window.__ASTRO_BASE_URL__);
        try {
          const u = new URL(injected);
          // If current host differs from injected host (common in local dev),
          // prefer the injected path-only base if available, otherwise use
          // the pathname component of the injected URL.
          if (typeof location !== 'undefined' && location.hostname && u.hostname && location.hostname !== u.hostname) {
            if (typeof window.__ASTRO_BASE_PATH__ === 'string' && window.__ASTRO_BASE_PATH__) {
              const p = String(window.__ASTRO_BASE_PATH__);
              return p.endsWith('/') ? p : `${p}/`;
            }
            const p = u.pathname || '/';
            return p.endsWith('/') ? p : `${p}/`;
          }
        } catch (e) {
          // not a full URL, fall back to using injected as-is
        }
        return injected.endsWith('/') ? injected : `${injected}/`;
      } catch (e) {
        // fall through to other fallbacks
      }
    }

    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '';
    if (envBase) return envBase.endsWith('/') ? envBase : `${envBase}/`;

    // try reading <base href> if available in browser
    if (typeof document !== 'undefined') {
      try {
        const baseEl = document.querySelector('base');
        if (baseEl && baseEl.getAttribute) {
          const href = baseEl.getAttribute('href') || '/';
          return href.endsWith('/') ? href : `${href}/`;
        }
      } catch (e) {
        // ignore
      }
    }

    // default to root when no explicit base is available
    return '/';
  } catch (_) {
    return '/';
  }
})();

// debug output so we can see what runtime base was detected in various environments
try { console.debug('[prefs] basePath:', basePath); } catch (e) {}

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

// Detect if current page is Chinese
const isZhPage = document.documentElement.lang === 'zh' || window.location.pathname.startsWith('/zh/');

// Text content for bilingual support
const i18n = {
  search: {
    title: isZhPage ? '搜索' : 'Search',
    closeLabel: isZhPage ? '关闭搜索' : 'Close search',
    placeholder: isZhPage ? '搜索此网站...' : 'Search this site...',
    hint: isZhPage ? '输入关键词并按回车在本站内搜索。按 Esc 关闭。' : 'Enter a keyword and press Enter to search this site. Press Esc to close.'
    ,
    browseTags: isZhPage ? '浏览标签' : 'Browse tags'
  },
  preferences: {
    title: isZhPage ? '偏好设置' : 'Preferences',
    closeLabel: isZhPage ? '关闭偏好设置' : 'Close preferences',
    theme: {
      title: isZhPage ? '主题' : 'Theme',
      desc: isZhPage ? '在亮色和暗色主题之间切换。您的偏好将保存在本地。' : 'Switch between light and dark themes. Your preference is saved locally.',
      light: isZhPage ? '亮色' : 'Light',
      dark: isZhPage ? '暗色' : 'Dark',
      ariaLabel: isZhPage ? '主题选择器' : 'Theme selector',
      ariaGroupLabel: isZhPage ? '主题' : 'Theme'
    },
    language: {
      title: isZhPage ? '语言' : 'Language',
      desc: isZhPage ? '在英文和中文之间切换网站语言。' : 'Switch site language between English and 中文（Chinese）.',
      ariaLabel: isZhPage ? '语言选择器' : 'Language selector',
      ariaGroupLabel: isZhPage ? '语言' : 'Language'
    }
  },
  subscribe: {
    title: isZhPage ? '订阅' : 'Subscribe',
    closeLabel: isZhPage ? '关闭订阅' : 'Close subscribe',
    desc: isZhPage ? '订阅以获取新文章和作品集更新。绝无垃圾邮件。' : 'Get updates for new posts and portfolio additions. No spam.',
    note: isZhPage ? '订阅将在新标签页打开 Buttondown（我的邮件服务提供商），以便您直接确认请求。如果您不确定是否成功，请发邮件至 <a href="mailto:elkoutopia@gmail.com">elkoutopia@gmail.com</a>，我会帮您检查。' : 'Subscribing opens Buttondown (my email provider) in a new tab so you can confirm the request directly. If you are unsure whether it worked, just drop a note to <a href="mailto:elkoutopia@gmail.com">elkoutopia@gmail.com</a> and I will check it for you.',
    privacy: isZhPage ? '我尊重您的隐私。随时可以取消订阅。' : 'I respect your privacy. Unsubscribe anytime.',
    button: isZhPage ? '订阅' : 'Subscribe',
    manageUnsub: isZhPage ? '管理 / 取消订阅' : 'Manage / Unsubscribe'
  }
};

let searchOverlay = null;
let searchInput = null;
let searchIndex = null; // cached JSON index
let prevActiveElement = null;
let lightboxInitialized = false; // 防止重复初始化lightbox
let prefsDelegateAttached = false;
let scrollbarCompensated = false; // 防止重复设置滚动条补偿
let originalBodyPadding = ''; // 保存body原始padding

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
      <h5 class="pref-search-title" id="pref-search-title">${i18n.search.title}</h5>
          <button type="button" class="pref-search-close" aria-label="${i18n.search.closeLabel}">&times;</button>
        </div>
      <form class="pref-search-form">
        <input type="search" class="pref-search-input" name="q" placeholder="${i18n.search.placeholder}" autocomplete="off" />
      </form>
      <p class="pref-search-hint">${i18n.search.hint}</p>
      <div style="margin:0.6rem 0 0.8rem; text-align:center">
  <button type="button" class="pref-btn pref-browse-tags" aria-label="${i18n.search.browseTags}" style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.45rem 0.9rem;border-radius:8px;border:1px solid rgba(var(--gray),0.08);background:transparent;cursor:pointer;font-weight:600;color:inherit">
          <span class="sr-only">${i18n.search.browseTags}</span>
          <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 11l-8-8H3v10l8 8 10-10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span style="font-weight:600">${i18n.search.browseTags}</span>
        </button>
      </div>
      <div class="pref-search-results" aria-live="polite"></div>
    </div>
  `;

  document.body.appendChild(searchOverlay);

  const closeBtn = searchOverlay.querySelector('.pref-search-close');
  const form = searchOverlay.querySelector('.pref-search-form');
  searchInput = searchOverlay.querySelector('.pref-search-input');

  // 创建一个自定义的清除按钮，确保在所有浏览器中外观与主题一致（尤其是 Firefox）
  try {
    if (form && searchInput) {
      // 调整输入框右内边距，为按钮留出空间
      const origPaddingRight = window.getComputedStyle(searchInput).paddingRight || '0px';
      searchInput.style.paddingRight = '44px';

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'pref-search-input-clear';
      clearBtn.setAttribute('aria-label', isZhPage ? '清除搜索' : 'Clear search');
      // 使用可继承颜色的 × 符号（简单且可缩放），也可以替换为内联 SVG
      clearBtn.innerHTML = '&times;';
      clearBtn.style.display = 'none';

      // 点击清空并聚焦输入框
      clearBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
          clearBtn.style.display = 'none';
          // 触发 input 事件以便其他逻辑响应
          try { searchInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      });

      // 根据输入内容切换按钮可见性
      searchInput.addEventListener('input', function () {
        if (!searchInput) return;
        clearBtn.style.display = (searchInput.value && searchInput.value.length) ? 'inline-flex' : 'none';
      });

      // 初始可见性
      if (searchInput.value && searchInput.value.length) clearBtn.style.display = 'inline-flex';

      form.appendChild(clearBtn);
    }
  } catch (e) {
    // 不要让清除按钮影响主流程
    console.warn('failed to create custom clear button', e);
  }

  closeBtn.addEventListener('click', closeSearchOverlay);
  searchOverlay.addEventListener('click', (event) => {
    if (event.target === searchOverlay) {
      closeSearchOverlay();
    }
  });
  form.addEventListener('submit', onSearchSubmit);
  // Browse tags button: open the full /search page (respecting zh prefix)
  try {
    const browseBtn = searchOverlay.querySelector('.pref-browse-tags');
    if (browseBtn) {
      browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // build target using basePath (already normalized) and a relative path
        const rel = isZhPage ? 'zh/search' : 'search';
        let target = (basePath.endsWith('/') ? basePath : basePath + '/') + rel;
        // collapse multiple slashes but preserve protocol (if any)
        try { target = target.replace(/([^:]\/)?\/+/g, '$1/'); } catch (e) {}
        window.location.href = target;
      });
    }
  } catch (e) {
    // noop
  }
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
  .pref-prefs-overlay { position: fixed; inset: 0; display:none; align-items:center; justify-content:center; z-index:2147483647; background: rgba(12, 12, 15, 0); backdrop-filter: blur(0px); transition: background-color 0.3s ease, backdrop-filter 0.3s ease; will-change: opacity, backdrop-filter; }
  .pref-prefs-overlay.is-open { display:flex; background: rgba(12, 12, 15, 0.65); backdrop-filter: blur(12px); }
  .pref-prefs-overlay.is-closing { background: rgba(12, 12, 15, 0); backdrop-filter: blur(0px); }
  .pref-prefs-overlay .pref-dialog { width: min(720px, calc(100% - 48px)); background: var(--surface); color: rgb(var(--black)); border-radius: 12px; box-shadow: var(--box-shadow); overflow: hidden; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; opacity: 0; transform: translateY(30px) scale(0.95); transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); will-change: transform, opacity; }
  .pref-prefs-overlay.is-open .pref-dialog { animation: dialogSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .pref-prefs-overlay.is-closing .pref-dialog { animation: dialogSlideDown 0.25s ease forwards; }
  @keyframes dialogSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes dialogSlideDown { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.98); } }
  html[data-theme="dark"] .pref-prefs-overlay .pref-dialog { background: var(--surface); color: rgb(var(--black)); }
      .pref-prefs-overlay .pref-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-header { border-bottom-color: rgba(255,255,255,0.04); }
  /* Only target h2 pref titles here so h4 will fall back to global h4 styles */
  .pref-prefs-overlay h2.pref-title { margin:0; font-size:1.05rem; font-weight:700; color: rgb(var(--black)); }
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
      @media (max-width: 680px) { .pref-prefs-overlay .pref-card .card-top { flex-direction:column; align-items:flex-start; } }
    .pref-prefs-overlay .pref-card .card-title { font-weight:700; font-size:0.98rem; color: rgb(var(--black)); }
  .pref-prefs-overlay .pref-card .card-desc { font-size:0.86rem; color: rgba(var(--gray-dark), 0.85); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-card .card-desc { color: rgba(var(--gray-dark), 0.85); }
      .pref-prefs-overlay .pref-actions { margin-left:auto; display:flex; gap:8px; align-items:center; }
      @media (max-width: 680px) { .pref-prefs-overlay .pref-actions { margin-left:0; } }
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
        <h5 class="pref-title" id="pref-prefs-title">${i18n.preferences.title}</h5>
        <div>
          <button type="button" class="pref-close" aria-label="${i18n.preferences.closeLabel}">&times;</button>
        </div>
      </div>
      <div class="pref-body">
        <div class="pref-grid">
          <div class="pref-card" role="group" aria-label="${i18n.preferences.theme.ariaGroupLabel}">
            <div class="card-top">
              <div style="flex:1">
                <div class="card-title">${i18n.preferences.theme.title}</div>
                <div class="card-desc">${i18n.preferences.theme.desc}</div>
              </div>
              <div class="pref-actions">
                <div class="segmented pref-seg-theme" role="tablist" aria-label="${i18n.preferences.theme.ariaLabel}">
                  <button type="button" class="seg-btn" data-theme-option="light" aria-pressed="false" title="${i18n.preferences.theme.light}">☀︎ <span style="margin-left:6px">${i18n.preferences.theme.light}</span></button>
                  <button type="button" class="seg-btn" data-theme-option="dark" aria-pressed="false" title="${i18n.preferences.theme.dark}">☾ <span style="margin-left:6px">${i18n.preferences.theme.dark}</span></button>
                </div>
              </div>
            </div>
            
          </div>

          <div class="pref-card" role="group" aria-label="${i18n.preferences.language.ariaGroupLabel}">
            <div class="card-top">
              <div style="flex:1">
                <div class="card-title">${i18n.preferences.language.title}</div>
                <div class="card-desc">${i18n.preferences.language.desc}</div>
              </div>
              <div class="pref-actions">
                <div class="segmented pref-seg-lang" role="tablist" aria-label="${i18n.preferences.language.ariaLabel}">
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
      
      // Detect base path
      let basePath = '/';
      if (normalized.startsWith('/Creation_notes/')) {
        basePath = '/Creation_notes/';
      }
      
      // Check if path after base starts with zh/
      const pathAfterBase = normalized.substring(basePath.length);
      const isZh = document.documentElement.lang === 'zh' || pathAfterBase.startsWith('zh/');
      
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
      
      // Detect base path by checking if path starts with /Creation_notes/
      // This handles both local (/) and GitHub Pages (/Creation_notes/) deployments
      let basePath = '/';
      if (pathWithSlash.startsWith('/Creation_notes/')) {
        basePath = '/Creation_notes/';
      }
      
      if (v === 'zh') {
        // Switch to Chinese: add /zh/ after base path
        let target = pathWithSlash;
        // Get path after base
        const pathAfterBase = target.substring(basePath.length);
        // Check if already in /zh/ path
        if (!pathAfterBase.startsWith('zh/')) {
          // Insert /zh/ after base path
          target = basePath + 'zh/' + pathAfterBase;
        }
        target = target.replace(/\/+/g, '/');
        window.location.href = target;
      } else {
        // Switch to English: remove /zh/ from path (after base)
        let target = pathWithSlash;
        const pathAfterBase = target.substring(basePath.length);
        if (pathAfterBase.startsWith('zh/')) {
          // Remove /zh/ prefix
          const pathWithoutZh = pathAfterBase.substring(3); // Remove 'zh/'
          target = basePath + pathWithoutZh;
        }
        if (!target || target === basePath.slice(0, -1)) target = basePath;
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
  
  // 计算滚动条宽度并补偿body，避免内容跳动（只在第一次打开时设置）
  if (!scrollbarCompensated) {
    // 保存原始padding值
    originalBodyPadding = document.body.style.paddingRight || '';
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      // 只设置body的padding补偿
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    scrollbarCompensated = true;
  }
  
  // 移除可能残留的关闭类
  prefsOverlay.classList.remove('is-closing');
  prefsOverlay.classList.add('is-open');
  
  // ensure the overlay's theme buttons reflect current theme when opened
  // 使用 requestAnimationFrame 和 setTimeout 确保DOM完全渲染后再更新indicator位置
  setTimeout(() => {
    requestAnimationFrame(() => {
      try {
        // 直接调用updateSegIndicator更新所有segmented controls
        const themeSeg = prefsOverlay.querySelector('.pref-seg-theme');
        const langSeg = prefsOverlay.querySelector('.pref-seg-lang');
        
        // 更新theme按钮状态
        if (themeSeg) {
          const cur = root.dataset.theme === 'dark' ? 'dark' : 'light';
          themeSeg.querySelectorAll('[data-theme-option]').forEach((btn) => {
            const v = btn.getAttribute('data-theme-option');
            const active = v === cur;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-active', active);
          });
          
          // 更新indicator位置
          const activeBtn = themeSeg.querySelector('.seg-btn.is-active');
          if (activeBtn) {
            const containerRect = themeSeg.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const offset = btnRect.left - containerRect.left - 4;
            const width = btnRect.width;
            themeSeg.style.setProperty('--indicator-offset', `${offset}px`);
            themeSeg.style.setProperty('--indicator-width', `${width}px`);
          }
        }
        
        // 更新language按钮状态
        if (langSeg) {
          const path = (window.location.pathname || '/');
          const normalized = path.endsWith('/') ? path : path + '/';
          let basePath = '/';
          if (normalized.startsWith('/Creation_notes/')) {
            basePath = '/Creation_notes/';
          }
          const pathAfterBase = normalized.substring(basePath.length);
          const isZh = document.documentElement.lang === 'zh' || pathAfterBase.startsWith('zh/');
          
          langSeg.querySelectorAll('[data-lang]').forEach((btn) => {
            const v = btn.getAttribute('data-lang');
            const active = (v === 'zh') ? isZh : !isZh;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-active', active);
          });
          
          // 更新indicator位置
          const activeBtn = langSeg.querySelector('.seg-btn.is-active');
          if (activeBtn) {
            const containerRect = langSeg.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const offset = btnRect.left - containerRect.left - 4;
            const width = btnRect.width;
            langSeg.style.setProperty('--indicator-offset', `${offset}px`);
            langSeg.style.setProperty('--indicator-width', `${width}px`);
          }
        }
      } catch (e) { 
        console.error('[Prefs Debug] Error updating indicators:', e);
      }
    });
  }, 50); // 增加延迟确保动画开始后DOM稳定
  
  document.body.dataset.prefSearchLock = 'true';
  document.body.style.overflow = 'hidden';
  console.log('[Prefs Debug] Overlay opened successfully');
}

function closePrefsOverlay() {
  console.log('[Prefs Debug] closePrefsOverlay called');
  if (!prefsOverlay) return;
  
  // 添加关闭动画
  prefsOverlay.classList.add('is-closing');
  
  // 等待动画完成后清理
  setTimeout(() => {
    // Clean up resize handler
    try {
      if (prefsOverlay._resizeHandler) {
        window.removeEventListener('resize', prefsOverlay._resizeHandler);
        delete prefsOverlay._resizeHandler;
      }
    } catch (e) {}
    // hide then fully remove the overlay so its <style> does not leak and hide header icons
    try {
      prefsOverlay.classList.remove('is-open', 'is-closing');
    } catch (e) {}
    try { document.body.style.overflow = ''; } catch (e) {}
    try { document.body.style.paddingRight = originalBodyPadding; } catch (e) {}
    try { delete document.body.dataset.prefSearchLock; } catch (e) {}
    scrollbarCompensated = false; // 重置标志，允许下次打开时重新计算
    originalBodyPadding = '';
    try { if (prefsKeydownHandler) document.removeEventListener('keydown', prefsKeydownHandler); } catch(e) {}
    try { if (prefsOverlay.parentNode) prefsOverlay.parentNode.removeChild(prefsOverlay); } catch (e) {}
    prefsOverlay = null;
    if (prevActiveElement) prevActiveElement.focus();
    // Trigger a resize so header logic re-evaluates layout (safeguard)
    try { window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } catch (e) {}
    console.log('[Prefs Debug] Overlay closed');
  }, 300); // 与CSS动画时长匹配
}

function openSearchOverlay() {
  ensureSearchOverlay();
  if (searchOverlay.classList.contains('is-open')) return;

  prevActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  
  // 计算滚动条宽度并补偿body，避免内容跳动（只在第一次打开时设置）
  if (!scrollbarCompensated) {
    // 保存原始padding值
    originalBodyPadding = document.body.style.paddingRight || '';
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    scrollbarCompensated = true;
  }
  
  // 移除可能残留的关闭类
  searchOverlay.classList.remove('is-closing');
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
  
  // 添加关闭动画
  searchOverlay.classList.add('is-closing');
  
  // 等待动画完成后移除类和样式
  setTimeout(() => {
    searchOverlay.classList.remove('is-open', 'is-closing');
    document.body.style.overflow = '';
    document.body.style.paddingRight = originalBodyPadding;
    delete document.body.dataset.prefSearchLock;
    scrollbarCompensated = false; // 重置标志，允许下次打开时重新计算
    originalBodyPadding = '';

    if (prevActiveElement) {
      prevActiveElement.focus();
    }
  }, 300); // 与CSS动画时长匹配
}

async function onSearchSubmit(event) {
  event.preventDefault();
  if (!searchInput) return;
  const query = searchInput.value.trim();
  if (!query) {
    closeSearchOverlay();
    return;
  }

  // 跳转到对应语言的 /search 页面并携带查询参数，让该页面负责展示结果
  try {
    // 使用更保守的 runtime base 决策：如果注入的 __ASTRO_BASE_URL__ 带有与当前页面不同的 origin（例如指向 GitHub Pages），
    // 则优先使用注入的 path-only base (__ASTRO_BASE_PATH__) 或注入 URL 的 pathname 部分；否则使用注入的绝对 base。
    let runtimeBase = '/';
    try {
      if (typeof window !== 'undefined' && window.__ASTRO_BASE_URL__) {
        const injected = String(window.__ASTRO_BASE_URL__);
        try {
          const u = new URL(injected);
          if (typeof location !== 'undefined' && location.hostname && u.hostname && location.hostname !== u.hostname) {
            // running on localhost or a different host: prefer path-only base to keep current origin
            if (typeof window.__ASTRO_BASE_PATH__ === 'string' && window.__ASTRO_BASE_PATH__) {
              runtimeBase = String(window.__ASTRO_BASE_PATH__);
            } else {
              runtimeBase = u.pathname || '/';
            }
          } else {
            // same host (or no reliable location), keep absolute injected base
            runtimeBase = injected;
          }
        } catch (e) {
          // not a full URL, treat it as base string
          runtimeBase = injected;
        }
      } else if (typeof window !== 'undefined' && window.__ASTRO_BASE_PATH__) {
        runtimeBase = (typeof location !== 'undefined' && location.origin) ? (location.origin.replace(/\/$/, '') + String(window.__ASTRO_BASE_PATH__)) : String(window.__ASTRO_BASE_PATH__);
      } else if (typeof basePath !== 'undefined' && basePath) runtimeBase = basePath;
    } catch (e) { runtimeBase = (typeof basePath !== 'undefined' && basePath) ? basePath : '/'; }
    const base = runtimeBase.endsWith('/') ? runtimeBase : runtimeBase + '/';
    const curPath = (location.pathname || '/');
    const curLang = (document.documentElement.lang || (curPath.indexOf('/zh/') !== -1 ? 'zh' : 'en')).toLowerCase();
    const rel = curLang === 'zh' ? 'zh/search' : 'search';
    // Build the target using the runtime base so it works on GH Pages subpaths and local dev.
    let target;
    try {
      target = new URL(rel, base).toString();
    } catch (e) {
      // fallback to simple concatenation
      target = (base.endsWith('/') ? base : base + '/') + rel;
      try { target = target.replace(/([^:]\/)\/+/g, '$1/'); } catch (err) {}
    }
    // 添加 q 查询参数
    target += `?q=${encodeURIComponent(query)}`;
    // 规范化重复斜杠
    try { target = target.replace(/([^:]\/)\/+/g, '$1/'); } catch (e) {}
    // 调试日志，便于排查为何没有跳转
    console.debug('[prefs] search redirect target:', target, 'current:', location.href);

    // 如果当前已经在搜索页面（/search 或 /zh/search），直接更新查询参数并重新加载
    const normalizedPath = location.pathname.replace(/\/$/, '');
    const normalizedTargetPath = new URL(target, location.origin).pathname.replace(/\/$/, '');
    if (normalizedPath === normalizedTargetPath) {
      // 使用 assign 会在大多数环境触发页面重新加载，从而让 site-search.js 读取 q 并展示结果
      window.location.assign(target);
      return;
    }

    // 否则正常跳转到目标页面
    window.location.assign(target);
  } catch (e) {
    // 若跳转失败则回退到内联搜索（保留体验）
    console.error('Redirect to search page failed, falling back to inline search', e);
    try {
      const resultsContainer = searchOverlay.querySelector('.pref-search-results');
      resultsContainer.innerHTML = '<div class="pref-search-loading">Searching…</div>';
      // 尝试按原有方式做本地索引搜索
      if (!searchIndex) {
        // 在回退路径中也使用 resolveWithBase() 以确保在 GH Pages 等子路径托管下能正确访问索引
        const res = await fetch(resolveWithBase('/search-index.json'));
        if (!res.ok) throw new Error('Failed to load index');
        searchIndex = await res.json();
      }
      const q = query.toLowerCase();
      const matched = searchIndex
        .filter(item => (item.lang || 'en').toLowerCase() === curLang)
        .filter(item => {
          return (item.title && String(item.title).toLowerCase().includes(q)) ||
                 (item.description && String(item.description).toLowerCase().includes(q)) ||
                 (item.excerpt && String(item.excerpt).toLowerCase().includes(q));
        }).slice(0, 20);
      if (!matched.length) {
        resultsContainer.innerHTML = `<div class="pref-search-noresults">No results found for "${escapeHtml(query)}".</div>`;
      } else {
        resultsContainer.innerHTML = matched.map(it => {
          const title = escapeHtml(it.title || 'Untitled');
          const desc = escapeHtml(it.description || it.excerpt || '');
          const url = it.url || '#';
          return `\n          <a class="pref-search-item" href="${url}">\n            <div class=\"pref-search-item-title\">${title}</div>\n            <div class=\"pref-search-item-desc\">${desc}</div>\n          </a>`;
        }).join('\n');
      }
    } catch (err) {
      console.error('Fallback inline search also failed', err);
      closeSearchOverlay();
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[ch]);
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
        <h5 class="pref-subscribe-title" id="pref-subscribe-title">${i18n.subscribe.title}</h5>
        <button type="button" class="pref-subscribe-close" aria-label="${i18n.subscribe.closeLabel}">&times;</button>
      </div>
      <div class="pref-subscribe-body">
        <p class="pref-subscribe-desc">${i18n.subscribe.desc}</p>
        <p class="pref-subscribe-desc pref-subscribe-desc-note">
          ${i18n.subscribe.note}
        </p>
        <div class="subscribe-form pref-subscribe-form">
          <div class="pref-subscribe-note">${i18n.subscribe.privacy}</div>
          <div class="sf-message" aria-live="polite" style="display:none"></div>
        </div>
        <div class="pref-subscribe-actions">
          <button type="button" class="pref-subscribe-cta" data-subscribe-open>${i18n.subscribe.button}</button>
          ${subscribeUnsubscribeUrl ? `<button type="button" class="pref-subscribe-unsub" data-subscribe-unsub>${i18n.subscribe.manageUnsub}</button>` : ''}
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
  
  // 计算滚动条宽度并补偿body，避免内容跳动（只在第一次打开时设置）
  if (!scrollbarCompensated) {
    // 保存原始padding值
    originalBodyPadding = document.body.style.paddingRight || '';
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    scrollbarCompensated = true;
  }
  
  // 移除可能残留的关闭类
  subscribeOverlay.classList.remove('is-closing');
  subscribeOverlay.classList.add('is-open');
  document.body.dataset.prefSubscribeLock = 'true';
  document.body.style.overflow = 'hidden';
}

function closeSubscribeOverlay() {
  if (!subscribeOverlay) return;
  
  // 添加关闭动画
  subscribeOverlay.classList.add('is-closing');
  
  // 等待动画完成后移除类和样式
  setTimeout(() => {
    subscribeOverlay.classList.remove('is-open', 'is-closing');
    document.body.style.overflow = '';
    document.body.style.paddingRight = originalBodyPadding;
    delete document.body.dataset.prefSubscribeLock;
    scrollbarCompensated = false; // 重置标志，允许下次打开时重新计算
    originalBodyPadding = '';
    if (prevActiveElement) prevActiveElement.focus();
  }, 300); // 与CSS动画时长匹配
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


