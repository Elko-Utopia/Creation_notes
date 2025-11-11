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

  // 延迟光箱初始化，确保图片已渲染且lightbox.js已加载
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
    const isZh = htmlLang === 'zh' || /(^|\/)zh(\/|$)/.test(normalized) || \/zh\/$.test(normalized) || /^\/zh(\/|$)/.test(normalized);
    const txt = isZh ? 'ZH' : 'EN';
    badge.textContent = txt;

