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
}
