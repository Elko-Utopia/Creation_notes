/*
  preferences.js — 脚本说明（中文）

  本文件负责头部相关的小型交互逻辑，包括偏好面板（Preferences）、搜索弹窗、订阅表单等
  的 DOM 构建与事件绑定。脚本采用惰性（lazy）创建方式：只有用户打开对应弹窗时才插入必要的节点，
  以减少首次加载开销。它还处理一些轻量的视觉辅助功能，例如分段控件（Light/Dark、语言选择）
  指示条的位置计算，并包含对不同部署路径（base path）的兼容检测。

  维护提示：尽量把视觉调整放在样式表（`src/styles/header.css`）中完成；仅在需要动态测量或
  绑定行为时修改本脚本。避免在此处添加和后端交互无关的大量逻辑。
*/

const THEME_KEY = 'theme-preference';
const root = document.documentElement;
// 更稳健的 base path 检测：优先使用构建时的 BASE_URL（如果脚本已被打包），
// 其次使用 HTML 中的 <base href>。不要仅从当前页面路径推断 base，因为这会在 /contact/ 下导致跳转到 /contact/search 之类的问题。
const basePath = (() => {
  try {
  // 优先使用 BaseHead 注入的运行时全局，这样从 /<base>/public/... 加载的脚本能发现 GH Pages 上的子路径
    if (typeof window !== 'undefined' && window.__ASTRO_BASE_URL__) {
  // 如果注入的是带有 origin 的绝对 base，请小心：在本地运行时（localhost）注入的 origin 可能指向已发布的 GitHub Pages 主机。
  // 此时应优先使用仅路径的 base，以便跳转使用当前的 origin
      try {
        const injected = String(window.__ASTRO_BASE_URL__);
        try {
          const u = new URL(injected);
          // 当当前主机与注入主机不同（本地开发常见）时，优先使用注入的 path-only base（若存在），否则使用注入 URL 的 pathname
          if (typeof location !== 'undefined' && location.hostname && u.hostname && location.hostname !== u.hostname) {
            if (typeof window.__ASTRO_BASE_PATH__ === 'string' && window.__ASTRO_BASE_PATH__) {
              const p = String(window.__ASTRO_BASE_PATH__);
              return p.endsWith('/') ? p : `${p}/`;
            }
            const p = u.pathname || '/';
            return p.endsWith('/') ? p : `${p}/`;
          }
        } catch (e) {
    // 不是完整 URL，则原样使用注入值
        }
        return injected.endsWith('/') ? injected : `${injected}/`;
      } catch (e) {
  // 回退到其它备选方案
      }
    }

    const envBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '';
    if (envBase) return envBase.endsWith('/') ? envBase : `${envBase}/`;

  // 在浏览器中尝试读取 <base href>
    if (typeof document !== 'undefined') {
      try {
        const baseEl = document.querySelector('base');
        if (baseEl && baseEl.getAttribute) {
          const href = baseEl.getAttribute('href') || '/';
          return href.endsWith('/') ? href : `${href}/`;
        }
      } catch (e) {
  // 忽略错误
      }
    }

  // 若没有显式 base，默认使用根目录
    return '/';
  } catch (_) {
    return '/';
  }
})();

// debug output removed

const runtimeConfig = (() => {
  try {
    if (typeof window !== 'undefined' && window.__SITE_PREFS) {
      return window.__SITE_PREFS;
    }
  } catch (_) {
    // 忽略（容错）
  }
  return {};
})();

function resolveWithBase(path) {
  if (!path || typeof path !== 'string') return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) {
    const rawBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    // 如果 base 是绝对 URL（带 origin），优先返回带 origin 的目标，避免把绝对 base 当作路径重复拼接
    try {
      const parsedBase = new URL(rawBase);
      const origin = parsedBase.origin;
      const basePathname = parsedBase.pathname.replace(/\/$/, '') || '';
      // 如果传入的 path 已经包含 base 的 pathname 前缀，则直接返回带 origin 的绝对 URL，避免重复
      if (basePathname && (path === basePathname || path.startsWith(basePathname + '/'))) {
        return origin + path;
      }
      // 如果没有 pathname（即 base 指向根），直接使用 origin + path
      if (!basePathname || basePathname === '') return origin + path;
      // 否则组合 origin + pathname + path
      return origin + basePathname + path;
    } catch (e) {
      // base 不是绝对 URL，按原先逻辑处理
      const base = rawBase;
      try {
        if (base && base !== '/' && (path === base || path.startsWith(base + '/'))) {
          return path;
        }
      } catch (err) {
        // 容错
      }
      if (!base || base === '/') return path;
      return `${base}${path}`;
    }
  }
  return path;
}

// 将生成的 target 进行规范化：
// - 移除多余的 base 名称片段（例如多次出现的 'Creation_notes'）
// - 保证当 site base 存在时目标路径中只出现一次 base
function normalizeTarget(target, globalBase) {
  try {
    const normGlobal = (globalBase && globalBase !== '/') ? (globalBase.endsWith('/') ? globalBase : (globalBase + '/')) : '/';
    // 计算 base 的路径片段（仅取 pathname 部分），保证当 globalBase 是绝对 URL 时也能正确提取
    let basePathname = '/';
    try {
      const parsed = new URL(normGlobal, window.location.origin);
      basePathname = parsed.pathname || '/';
    } catch (e) {
      // 回退：normGlobal 可能已经是路径
      basePathname = normGlobal;
    }
    const baseParts = basePathname.split('/').filter(Boolean); // e.g. ['Creation_notes']

    // 处理绝对 URL 与相对路径两种情况
    let urlObj = null;
    try { urlObj = new URL(target, window.location.origin); } catch (e) { urlObj = null; }

    function removeBaseSequence(parts, seq) {
      if (!seq || seq.length === 0) return parts.slice();
      const res = [];
      for (let i = 0; i < parts.length;) {
        let match = true;
        for (let j = 0; j < seq.length; j++) {
          if (parts[i + j] !== seq[j]) { match = false; break; }
        }
        if (match) {
          i += seq.length; // skip the sequence
        } else {
          res.push(parts[i]);
          i++;
        }
      }
      return res;
    }

    function buildPath(parts, prefixSeq) {
      const finalParts = prefixSeq && prefixSeq.length ? prefixSeq.concat(parts) : parts;
      return '/' + finalParts.join('/');
    }

    if (urlObj) {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      const cleanedParts = removeBaseSequence(parts, baseParts);
      const finalPath = buildPath(cleanedParts, baseParts);
      urlObj.pathname = finalPath;
      return urlObj.toString();
    } else {
      if (typeof target === 'string' && target.startsWith('/')) {
        const parts = target.split('/').filter(Boolean);
        const cleanedParts = removeBaseSequence(parts, baseParts);
        return buildPath(cleanedParts, baseParts);
      }
    }
  } catch (e) {
    // 容错：若规范化失败则返回原始 target
  }
  return target;
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

// 检测当前页面是否为中文
// 在 GitHub Pages 等使用 base path 的部署下，直接检查 pathname 是否以 "/zh/" 开头会失败
// （例如部署在 `/Creation_notes/zh/...` 时）。为了兼容，先从 location.pathname 中剥离 basePath
//（如果 basePath 不为根），再判断剩余路径是否以 zh 开头；同时保留对 <html lang> 的检查。
let isZhPage = false;
try {
  const htmlLangIsZh = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang === 'zh');
  let pathname = '/';
  if (typeof location !== 'undefined' && location.pathname) pathname = location.pathname;
  // basePath 在上方已被规范为以 '/' 结尾的字符串（例如 '/' 或 '/Creation_notes/'）
  let normalized = pathname;
  if (basePath && basePath !== '/' && pathname.startsWith(basePath)) {
    normalized = pathname.slice(basePath.length - 0); // 去掉 base 前缀，保留以 'zh/...' 或 '/' 开头的子路径
  }
  // 如果剥离 base 后以 /zh/ 或 zh/ 开头，则为中文页面（也兼容根路径为 /zh/ 的情况）
  const pathLooksZh = /^\/?zh(\/|$)/.test(normalized);
  isZhPage = htmlLangIsZh || pathLooksZh;
} catch (e) {
  // 容错：若出错，回退到仅基于 html lang 的判断
  try { isZhPage = (typeof document !== 'undefined' && document.documentElement && document.documentElement.lang === 'zh'); } catch (e2) { isZhPage = false; }
}

// 双语支持的文本内容
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
let searchIndex = null; // 缓存的 JSON 索引
let prevActiveElement = null;
let lightboxInitialized = false; // 防止重复初始化lightbox
let prefsDelegateAttached = false;
let scrollbarCompensated = false; // 防止重复设置滚动条补偿
let originalBodyPadding = ''; // 保存body原始padding

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // 等待 DOM 就绪后再初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePreferences);
  } else {
  // DOM 已经加载
    initializePreferences();
  }
}

async function initializePreferences() {
  console.log('[Prefs Debug] initializePreferences called, readyState:', document.readyState);
  console.log('[Prefs Debug] document.body exists:', !!document.body);
  console.log('[Prefs Debug] Current location:', window.location.href);
  
  // 默认使用浅色主题（除非显式设置，才遵循系统偏好）
  const storedTheme = readStoredTheme();
  const initialTheme = storedTheme !== null ? storedTheme : 'light';
  applyTheme(initialTheme, { persist: storedTheme === null }); // 若首次访问则持久化
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

  // 语言切换已移除（仅保留图标）

  document.querySelectorAll('[data-search-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      openSearchOverlay();
    });
  });

  // 偏好切换（头部新图标）→ 打开偏好弹窗
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

  // 回退方案：添加委托点击处理器，以防直接监听器失效时点击仍能生效
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

  // 初始化头部语言角标（EN / ZH），如存在则显示
  try {
    syncLangBadge();
  } catch (e) { /* 空操作 */ }

  // 订阅切换：打开按需创建的小订阅对话框
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

// 更新显示在头部偏好图标上的小语言角标
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
  // 还为偏好切换添加语言类，以便应用相应的 CSS 变体
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
  // 忽略存储错误
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
  // 存储可能不可用
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

// 语言存储与切换已移除；站点默认使用英文

function ensureSearchOverlay() {
  // 若页面中已有匹配的 overlay（可能由早期脚本或服务器端渲染残留），优先复用，避免重复创建
  if (searchOverlay) return;
  const existingSearch = typeof document !== 'undefined' ? document.querySelector('.pref-search-overlay:not(.pref-prefs-overlay)') : null;
  if (existingSearch) {
    searchOverlay = existingSearch;
    return;
  }

  searchOverlay = document.createElement('div');
  searchOverlay.className = 'pref-search-overlay';
  searchOverlay.innerHTML = `
    <style>
  /* 确保搜索对话框具有统一的面板外观与偏好对话框相同的动画 */
      .pref-search-overlay .pref-search-dialog {
        width: min(720px, calc(100% - 48px));
        background: var(--pref-dialog-bg);
        color: rgb(var(--black));
        border-radius: 12px;
        box-shadow: var(--pref-dialog-shadow);
        overflow: hidden;
        opacity: 0;
        transform: translateY(30px) scale(0.95);
        transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        will-change: transform, opacity;
      }
      .pref-search-overlay.is-open .pref-search-dialog {
        animation: dialogSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  /* 即使动画未运行也确保最终可见状态 */
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .pref-search-overlay.is-closing .pref-search-dialog {
        animation: dialogSlideDown 0.25s ease forwards;
      }
      @keyframes dialogSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes dialogSlideDown { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.98); } }
    </style>
    <div class="pref-search-dialog" role="dialog" aria-modal="true" aria-labelledby="pref-search-title">
    <div class="pref-search-header">
      <h5 class="pref-search-title" id="pref-search-title">${i18n.search.title}</h5>
          <button type="button" class="pref-search-close" aria-label="${i18n.search.closeLabel}">&times;</button>
        </div>
      <hr class="pref-divider" />
      <form class="pref-search-form">
        <input type="search" class="pref-search-input" name="q" placeholder="${i18n.search.placeholder}" autocomplete="off" />
      </form>
      <p class="pref-search-hint">${i18n.search.hint}</p>
      <div style="margin:0.6rem 0 0.8rem; text-align:center">
        <button type="button" class="pref-browse-tags" aria-label="${i18n.search.browseTags}">
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
  // 浏览标签按钮：打开完整的 /search 页面（尊重 zh 前缀）
  try {
    const browseBtn = searchOverlay.querySelector('.pref-browse-tags');
    if (browseBtn) {
      browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // 使用统一的 resolveWithBase 构造目标路径，避免手动拼接导致的遗漏
        const rel = isZhPage ? 'zh/search' : 'search';
        let target;
        try {
          // resolveWithBase 期望以 / 开头的路径
          target = resolveWithBase('/' + rel) || ('/' + rel);
        } catch (err) {
          target = '/' + rel;
        }
  // debug output removed
        window.location.assign(target);
      });
    }
  } catch (e) {
  // 无操作（占位）
  }
  // （搜索覆盖层仅处理搜索输入；主题/语言已移到单独的偏好弹窗）
  document.addEventListener('keydown', onGlobalKeydown);
}

/* 偏好设置覆盖层（主题 + 语言） - 与搜索分离 */
let prefsOverlay = null;
let prefsKeydownHandler = null;
function ensurePrefsOverlay() {
  // 若页面已有偏好覆盖层，复用它以防止与搜索/订阅覆盖层混淆
  if (prefsOverlay) return;
  const existingPrefs = typeof document !== 'undefined' ? document.querySelector('.pref-prefs-overlay') : null;
  if (existingPrefs) {
    prefsOverlay = existingPrefs;
    return;
  }
  prefsOverlay = document.createElement('div');
  prefsOverlay.className = 'pref-search-overlay pref-prefs-overlay';
  prefsOverlay.innerHTML = `
    <style>
  /* 使用全局 CSS 变量以与 header.css 中的 overlay 保持一致 */
  .pref-prefs-overlay { position: fixed; inset: 0; display:none; align-items:center; justify-content:center; z-index:2147483647; background: var(--pref-overlay-bg-transparent); -webkit-backdrop-filter: blur(0px); backdrop-filter: blur(0px); transition: background-color 0.3s ease, -webkit-backdrop-filter 0.3s ease, backdrop-filter 0.3s ease; will-change: opacity, backdrop-filter; }
  .pref-prefs-overlay.is-open { display:flex; background: var(--pref-overlay-bg); -webkit-backdrop-filter: blur(var(--pref-overlay-blur)); backdrop-filter: blur(var(--pref-overlay-blur)); }
  .pref-prefs-overlay.is-closing { background: var(--pref-overlay-bg-transparent); -webkit-backdrop-filter: blur(0px); backdrop-filter: blur(0px); }
  .pref-prefs-overlay .pref-dialog { width: min(720px, calc(100% - 48px)); background: var(--pref-dialog-bg); color: rgb(var(--black)); border-radius: 12px; box-shadow: var(--pref-dialog-shadow); overflow: hidden; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; opacity: 0; transform: translateY(30px) scale(0.95); transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); will-change: transform, opacity; }
  .pref-prefs-overlay.is-open .pref-dialog { animation: dialogSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
  .pref-prefs-overlay.is-closing .pref-dialog { animation: dialogSlideDown 0.25s ease forwards; }
  @keyframes dialogSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes dialogSlideDown { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.98); } }
  html[data-theme="dark"] .pref-prefs-overlay .pref-dialog { background: var(--surface); color: rgb(var(--black)); }
      .pref-prefs-overlay .pref-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:18px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); }
  html[data-theme="dark"] .pref-prefs-overlay .pref-header { border-bottom-color: rgba(255,255,255,0.04); }
  /* 仅针对 h2 偏好设置标题，以便 h4 回退到全局 h4 样式 */
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
  /* 主题分段控制 */
  .pref-prefs-overlay .segmented { position: relative; display:inline-flex; background: var(--surface); border:1px solid rgba(var(--gray),0.08); border-radius:999px; padding:4px; gap:4px; }
  .pref-prefs-overlay .segmented::before { content: ''; position: absolute; top: 4px; left: 4px; width: var(--indicator-width, 0); height: calc(100% - 8px); background: var(--accent); border-radius: 999px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); transform: translateX(var(--indicator-offset, 0)); transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); will-change: transform, width; z-index: 0; pointer-events: none; }
  .pref-prefs-overlay .segmented .seg-btn { position: relative; z-index: 1; appearance:none; border:0; background:transparent; padding:8px 12px; border-radius:999px; cursor:pointer; font-weight:600; color: rgb(var(--gray-dark)); display:inline-flex; align-items:center; gap:8px; transition: color 0.3s ease; }
  .pref-prefs-overlay .segmented .seg-btn.is-active { background: transparent; color: #fff; box-shadow: none; }
  .pref-prefs-overlay .segmented .seg-btn:focus { outline:2px solid rgba(var(--accent),0.12); outline-offset:2px; }
  
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
  // 在偏好弹窗打开时按 Escape 键关闭
  prefsKeydownHandler = function (ev) {
    if (ev.key === 'Escape' || ev.key === 'Esc') {
      if (prefsOverlay && prefsOverlay.classList.contains('is-open')) {
        ev.preventDefault();
        closePrefsOverlay();
      }
    }
  };
  document.addEventListener('keydown', prefsKeydownHandler);
  

  // 辅助函数：更新分段指示器的位置
  function updateSegIndicator(segmentedContainer) {
    try {
      const activeBtn = segmentedContainer.querySelector('.seg-btn.is-active');
      if (!activeBtn) return;
      const containerRect = segmentedContainer.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
  const offset = btnRect.left - containerRect.left - 4; // 4px 为容器内边距
      const width = btnRect.width;
      segmentedContainer.style.setProperty('--indicator-offset', `${offset}px`);
      segmentedContainer.style.setProperty('--indicator-width', `${width}px`);
  } catch (e) { /* 空操作 */ }
  }

  // 分段控件：主题与语言（保留 openPrefsOverlay 中使用的函数名）
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
  // 状态变更后更新指示器位置
      requestAnimationFrame(() => updateSegIndicator(seg));
  } catch (e) { /* 空操作 */ }
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
      // 规范化当前路径与候选 base，确保尾部斜杠一致以便正确检测
      const normalized = path.endsWith('/') ? path : path + '/';
      // base 固定为 '/'，直接用 html[lang] 判断中文
      const isZh = document.documentElement.lang === 'zh' || normalized.startsWith('/zh/');
      
      seg.querySelectorAll('[data-lang]').forEach((btn) => {
        const v = btn.getAttribute('data-lang');
        const active = (v === 'zh') ? isZh : !isZh;
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        btn.classList.toggle('is-active', active);
      });
  // 状态变更后更新指示器位置
      requestAnimationFrame(() => updateSegIndicator(seg));
  } catch (e) { /* 空操作 */ }
  }
  const langSegBtns = prefsOverlay.querySelectorAll('.pref-seg-lang [data-lang]');
  langSegBtns.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      const v = ev.currentTarget && ev.currentTarget.getAttribute('data-lang');
      if (!v) return;
  // 若存在则立即更新头部角标（非阻塞）
      try {
        const badge = document.querySelector('.lang-badge');
        if (badge) badge.textContent = v === 'zh' ? 'ZH' : 'EN';
      } catch (e) {}

      const curPath = window.location.pathname || '/';
      // 使用文件顶部的全局 basePath（可能是绝对 URL 或仅路径），避免在多个地方硬编码 '/Creation_notes/'
      const globalBase = (typeof basePath !== 'undefined' && basePath) ? basePath : '/';
      // 为了正确剥离当前路径的站点前缀（不论 base 是绝对 URL 还是路径形式），
      // 我们只取 base 的 pathname 部分用于比较和切割。
      let basePathname = '/';
      try {
        if (globalBase && /^https?:\/\//i.test(String(globalBase))) {
          basePathname = (new URL(String(globalBase))).pathname || '/';
        } else {
          basePathname = String(globalBase) || '/';
        }
      } catch (e) {
        basePathname = String(globalBase) || '/';
      }
      const normBaseForStrip = (basePathname.endsWith('/') ? basePathname : (basePathname + '/'));
      const normCur = (curPath.endsWith('/') ? curPath : (curPath + '/'));
  // debug output removed
      // 去掉 base pathname 前缀，得到相对站点根的路径（例如 'blog/post/' 或 'zh/blog/post/'）
      let pathAfterBase = '';
      if (normBaseForStrip !== '/' && normCur.startsWith(normBaseForStrip)) {
        pathAfterBase = normCur.slice(normBaseForStrip.length);
      } else {
        // 若未以 base 前缀开头，则按普通方式去除首尾斜杠以取得相对路径
        pathAfterBase = curPath.replace(/^\/+|\/+$/g, '');
      }
      // 防护：若计算结果仍然包含站点 base 名称（例如 'Creation_notes/...'），将其剥离
      try {
        const baseName = String(basePathname || '/').replace(/^\/+|\/+$/g, '');
        if (baseName) {
          if (pathAfterBase === baseName) {
            pathAfterBase = '';
          } else if (pathAfterBase.startsWith(baseName + '/')) {
            pathAfterBase = pathAfterBase.slice((baseName + '/').length);
          }
        }
      } catch (e) { /* 容错：不改变 pathAfterBase */ }

      if (v === 'zh') {
        // 切换到中文：若相对路径未以 zh/ 开头，则在其前加入 zh/
        if (!/^zh(\/|$)/.test(pathAfterBase)) {
          const newRel = '/zh/' + pathAfterBase;
          const resolved = resolveWithBase(newRel.replace(/\/+/g, '/'));
          let target = resolved || (globalBase + 'zh/' + pathAfterBase);
          try { target = normalizeTarget(target, globalBase); } catch(e){}
          window.location.assign(target);
        } else {
          // 已经是中文路径，直接跳转到同一路径以保证刷新
          const newRel = '/' + pathAfterBase.replace(/\/+/g, '/');
          const resolved = resolveWithBase(newRel) || null;
          let target = resolved || ('/' + pathAfterBase);
          try { target = normalizeTarget(target, globalBase); } catch(e){}
          window.location.assign(target);
        }
      } else {
        // 切换到英文：若相对路径以 zh/ 开头，则去掉该前缀
        if (/^zh(\/|$)/.test(pathAfterBase)) {
          const withoutZh = pathAfterBase.replace(/^zh(\/)?/, '');
          const newRel = '/' + withoutZh;
          const resolved = (withoutZh && withoutZh.length) ? resolveWithBase(newRel.replace(/\/+/g, '/')) : null;
          let target = (withoutZh && withoutZh.length) ? (resolved || (globalBase + withoutZh)) : (globalBase);
          try { target = normalizeTarget(target, globalBase); } catch(e){}
          window.location.assign(target);
        } else {
          // 已经是英文路径，跳转到当前路径以保证刷新
          const newRel = '/' + pathAfterBase.replace(/\/+/g, '/');
          const resolved = resolveWithBase(newRel) || null;
          let target = resolved || ('/' + pathAfterBase);
          try { target = normalizeTarget(target, globalBase); } catch(e){}
          window.location.assign(target);
        }
      }
    });
  });

  // 确保分段控件反映当前状态
  try { setThemeSwitchState(); } catch (e) {}
  try { setLangSwitchState(); } catch (e) {}
  
  // 窗口大小变化时更新指示器
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
  
  // 存储处理器以便清理
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
  
  // 计算滚动条宽度并补偿 body，避免内容跳动（只在第一次打开时设置）
  if (!scrollbarCompensated) {
  // 保存原始 padding 值
    originalBodyPadding = document.body.style.paddingRight || '';
    
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
  // 仅设置 body 的 padding 补偿
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }
    scrollbarCompensated = true;
  }
  
  // 移除可能残留的关闭类
  prefsOverlay.classList.remove('is-closing');
  prefsOverlay.classList.add('is-open');
  // 在对话框动画结束后再做一次指示器更新，避免初次测量因 scale(0.95) 导致尺寸偏小
  try {
    const dialogEl = prefsOverlay.querySelector('.pref-dialog');
    if (dialogEl) {
      const onAnimEnd = () => {
        try {
          const themeSeg = prefsOverlay.querySelector('.pref-seg-theme');
          if (themeSeg) {
            try {
              const activeBtn = themeSeg.querySelector('.seg-btn.is-active');
              if (activeBtn) {
                const containerRect = themeSeg.getBoundingClientRect();
                const btnRect = activeBtn.getBoundingClientRect();
                const offset = btnRect.left - containerRect.left - 4;
                const width = btnRect.width;
                themeSeg.style.setProperty('--indicator-offset', `${offset}px`);
                themeSeg.style.setProperty('--indicator-width', `${width}px`);
              }
            } catch (e) { /* 无操作（容错） */ }
          }
          const langSeg = prefsOverlay.querySelector('.pref-seg-lang');
          if (langSeg) {
            try {
              const activeBtn = langSeg.querySelector('.seg-btn.is-active');
              if (activeBtn) {
                const containerRect = langSeg.getBoundingClientRect();
                const btnRect = activeBtn.getBoundingClientRect();
                const offset = btnRect.left - containerRect.left - 4;
                const width = btnRect.width;
                langSeg.style.setProperty('--indicator-offset', `${offset}px`);
                langSeg.style.setProperty('--indicator-width', `${width}px`);
              }
            } catch (e) { /* 无操作（容错） */ }
          }
  } catch (e) { /* 无操作（容错） */ }
        dialogEl.removeEventListener('animationend', onAnimEnd);
      };
      dialogEl.addEventListener('animationend', onAnimEnd, { once: true });
    }
  } catch (e) { /* 无操作（容错） */ }
  
  // 打开时确保覆盖层的主题按钮反映当前主题
  // 使用 requestAnimationFrame 与 setTimeout 确保 DOM 完全渲染后再更新指示器位置
  setTimeout(() => {
    requestAnimationFrame(() => {
      try {
  // 直接调用 updateSegIndicator 更新所有分段控件
        const themeSeg = prefsOverlay.querySelector('.pref-seg-theme');
        const langSeg = prefsOverlay.querySelector('.pref-seg-lang');
        
  // 更新主题按钮状态
        if (themeSeg) {
          const cur = root.dataset.theme === 'dark' ? 'dark' : 'light';
          themeSeg.querySelectorAll('[data-theme-option]').forEach((btn) => {
            const v = btn.getAttribute('data-theme-option');
            const active = v === cur;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-active', active);
          });
          
          // 更新指示器位置
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
        
  // 更新语言按钮状态
        if (langSeg) {
          const path = (window.location.pathname || '/');
          const normalized = path.endsWith('/') ? path : path + '/';
          // base 固定为 '/'，直接用 html[lang] 判断中文
          const isZh = document.documentElement.lang === 'zh' || normalized.startsWith('/zh/');
          
          langSeg.querySelectorAll('[data-lang]').forEach((btn) => {
            const v = btn.getAttribute('data-lang');
            const active = (v === 'zh') ? isZh : !isZh;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('is-active', active);
          });
          
          // 更新指示器位置
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
  }, 50); // 增加延迟以确保动画开始后 DOM 稳定
  
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
  // 清理 resize 处理器
    try {
      if (prefsOverlay._resizeHandler) {
        window.removeEventListener('resize', prefsOverlay._resizeHandler);
        delete prefsOverlay._resizeHandler;
      }
    } catch (e) {}
  // 隐藏并完全移除覆盖层，以防其 <style> 泄漏并隐藏头部图标
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
  // 触发一次 resize，以便头部逻辑重新评估布局（安全措施）
    try { window.setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } catch (e) {}
    console.log('[Prefs Debug] Overlay closed');
  }, 300); // 与 CSS 动画时长匹配
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

  // 确保对话框在动画未运行或被浏览器跳过时仍可见。
  // 使用 requestAnimationFrame 让类变更稳定后，再设置最终的内联状态作为安全回退。
  requestAnimationFrame(() => {
    try {
      const dlg = searchOverlay.querySelector('.pref-search-dialog');
      if (dlg) {
  // 强制最终可见状态（遵循不使用 !important 的项目原则）
  try { dlg.style.opacity = '1'; } catch(e) {}
  try { dlg.style.transform = 'translateY(0) scale(1)'; } catch(e) {}
  // 确保 display 与背景/层级设置为期望值
  try { dlg.style.display = 'flex'; } catch(e) {}
  try { dlg.style.background = getComputedStyle(document.documentElement).getPropertyValue('--pref-dialog-bg') || '#fff'; } catch(e) {}
  try { dlg.style.zIndex = '2147483647'; } catch(e) {}
      }
    } catch (e) {}
    try { searchInput?.focus(); } catch (e) {}
    try { searchInput?.select(); } catch (e) {}
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
            // 在本地或不同主机上运行：优先使用 path-only base 以保持当前 origin
            if (typeof window.__ASTRO_BASE_PATH__ === 'string' && window.__ASTRO_BASE_PATH__) {
              runtimeBase = String(window.__ASTRO_BASE_PATH__);
            } else {
              runtimeBase = u.pathname || '/';
            }
          } else {
            // 同一主机（或无可靠位置）：保留注入的绝对 base
            runtimeBase = injected;
          }
        } catch (e) {
          // 不是完整 URL，则将其作为 base 字符串处理
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
  // 使用 runtime base 构建目标，以兼容 GH Pages 子路径和本地开发
    let target;
    try {
      // new URL() 要求 base 为绝对 URL；如果我们得到的是 path-only base（例如 '/repo/'），
      // 需要把它转成以当前 origin 为前缀的绝对 URL 才能安全构造新 URL。
      let urlBase = base;
      try {
        // 简单检测是否已经是绝对 URL（含 scheme）
        if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(String(urlBase))) {
          if (typeof location !== 'undefined' && location.origin) {
            urlBase = location.origin.replace(/\/$/, '') + (String(urlBase).startsWith('/') ? '' : '/') + String(urlBase);
          }
        }
      } catch (_) {
        // 若检测出错，回退保持原样，让下面的 new URL 抛出并走到 catch 分支处理
      }
      target = new URL(rel, urlBase).toString();
    } catch (e) {
      // 回退到简单的字符串拼接
      target = (base.endsWith('/') ? base : base + '/') + rel;
      try { target = target.replace(/([^:]\/)\/+/g, '$1/'); } catch (err) {}
    }
    // 添加 q 查询参数
    target += `?q=${encodeURIComponent(query)}`;
    // 规范化重复斜杠
    try { target = target.replace(/([^:]\/)\/+/g, '$1/'); } catch (e) {}
  // debug output removed

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
  // 若页面已有订阅覆盖层，复用它以避免重复创建多个 overlay
  if (subscribeOverlay) return;
  const existingSub = typeof document !== 'undefined' ? document.querySelector('.pref-subscribe-overlay:not(.pref-prefs-overlay)') : null;
  if (existingSub) {
    subscribeOverlay = existingSub;
    return;
  }

  subscribeOverlay = document.createElement('div');
  subscribeOverlay.className = 'pref-subscribe-overlay';
  subscribeOverlay.innerHTML = `
    <style>
  /* 确保订阅对话框具有统一的面板外观与偏好对话框相同的动画 */
      .pref-subscribe-overlay .pref-subscribe-dialog {
        width: min(720px, calc(100% - 48px));
        background: var(--pref-dialog-bg);
        color: rgb(var(--black));
        border-radius: 12px;
        box-shadow: var(--pref-dialog-shadow);
        overflow: hidden;
        opacity: 0;
        transform: translateY(30px) scale(0.95);
        transition: opacity 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        will-change: transform, opacity;
      }
      .pref-subscribe-overlay.is-open .pref-subscribe-dialog {
        animation: dialogSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  /* 即使动画未运行也确保最终可见状态 */
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .pref-subscribe-overlay.is-closing .pref-subscribe-dialog {
        animation: dialogSlideDown 0.25s ease forwards;
      }
      @keyframes dialogSlideUp { from { opacity: 0; transform: translateY(30px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes dialogSlideDown { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(20px) scale(0.98); } }
    </style>
    <div class="pref-subscribe-dialog" role="dialog" aria-modal="true" aria-labelledby="pref-subscribe-title">
      <div class="pref-subscribe-header">
        <h5 class="pref-subscribe-title" id="pref-subscribe-title">${i18n.subscribe.title}</h5>
        <button type="button" class="pref-subscribe-close" aria-label="${i18n.subscribe.closeLabel}">&times;</button>
      </div>
      <hr class="pref-divider" />
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

  // 确保对话框在小屏幕上不被头部遮挡：为对话框添加与头部高度相等的上边距
  try {
    const headerEl = document.querySelector && document.querySelector('header');
    const dialog = subscribeOverlay.querySelector('.pref-subscribe-dialog');
    if (headerEl && dialog && window.innerWidth <= 820) {
      const hdrRect = headerEl.getBoundingClientRect();
  // 留出一点缓冲空间
      dialog.style.marginTop = Math.max(8, Math.round(hdrRect.height)) + 'px';
    }
  } catch (e) {
    // 无操作（容错）
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
  
  // 移除可能残留的关闭类，然后由 CSS 管理 overlay 的背景与模糊过渡（避免内联覆盖引起的突兀）
  subscribeOverlay.classList.remove('is-closing');
  subscribeOverlay.classList.add('is-open');
  document.body.dataset.prefSubscribeLock = 'true';
  document.body.style.overflow = 'hidden';

  // 确保订阅对话框即使在动画未执行时也可见。
  requestAnimationFrame(() => {
    try {
      const dlg = subscribeOverlay.querySelector('.pref-subscribe-dialog');
      if (dlg) {
        // 强制最终可见状态（遵循不使用 !important 的项目原则）
        try { dlg.style.opacity = '1'; } catch(e) {}
        try { dlg.style.transform = 'translateY(0) scale(1)'; } catch(e) {}
        try { dlg.style.display = 'flex'; } catch(e) {}
        try { dlg.style.background = getComputedStyle(document.documentElement).getPropertyValue('--pref-dialog-bg') || '#fff'; } catch(e) {}
        try { dlg.style.zIndex = '2147483647'; } catch(e) {}
      }
    } catch (e) {}
  });
}

function closeSubscribeOverlay() {
  if (!subscribeOverlay) return;
  
  // 添加关闭动画
  subscribeOverlay.classList.add('is-closing');
  
  // 等待动画完成后移除类和样式（微调为 350ms 以匹配更平滑的缓动）
  setTimeout(() => {
    subscribeOverlay.classList.remove('is-open', 'is-closing');
    // 清理我们可能设置的内联样式（若已不存在则无害）
    try { subscribeOverlay.style.display = ''; } catch(e) {}
    try { subscribeOverlay.style.background = ''; } catch(e) {}
    try { subscribeOverlay.style.webkitBackdropFilter = ''; } catch(e) {}
    try { subscribeOverlay.style.backdropFilter = ''; } catch(e) {}
    try { subscribeOverlay.style.zIndex = ''; } catch(e) {}
    document.body.style.overflow = '';
    document.body.style.paddingRight = originalBodyPadding;
    delete document.body.dataset.prefSubscribeLock;
    scrollbarCompensated = false; // 重置标志，允许下次打开时重新计算
    originalBodyPadding = '';
    if (prevActiveElement) prevActiveElement.focus();
  }, 350); // 与CSS动画时长匹配（微调以获得更平滑的过渡）
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

// 调试友好：将关键的 overlay 函数暴露到 window，方便在 DevTools 控制台直接调用进行交互式调试。
// 仅在浏览器环境下执行，不影响生产逻辑；如需从代码中撤销此暴露，可删除下面的几行。
try {
  if (typeof window !== 'undefined') {
    window.ensureSearchOverlay = ensureSearchOverlay;
    window.openSearchOverlay = openSearchOverlay;
    window.closeSearchOverlay = closeSearchOverlay;
    window.ensureSubscribeOverlay = ensureSubscribeOverlay;
    window.openSubscribeOverlay = openSubscribeOverlay;
    window.closeSubscribeOverlay = closeSubscribeOverlay;
    window.ensurePrefsOverlay = ensurePrefsOverlay;
    window.openPrefsOverlay = openPrefsOverlay;
    window.closePrefsOverlay = closePrefsOverlay;
  }
} catch (e) {
  // 安静失败，调试绑定不是必需的
}


