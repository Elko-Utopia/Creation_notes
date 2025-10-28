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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initializePreferences();
}

async function initializePreferences() {
  const initialTheme = readStoredTheme() ?? getSystemTheme();
  applyTheme(initialTheme, { persist: false });
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
  document.addEventListener('keydown', onGlobalKeydown);
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
  // close subscribe overlay on Escape
  if (event.key === 'Escape' && subscribeOverlay?.classList.contains('is-open')) {
    event.preventDefault();
    closeSubscribeOverlay();
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


