// Client-side fallback to swap inline markdown images to generated webp variants
// Runs in the browser; safe no-op if network/HEAD fails.
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function candidateUrls(origUrl) {
    try {
      const m = origUrl.match(/^(.*?)(\.[^./?#]+)(\?|#|$)/);
      if (!m) return [];
      const base = m[1];
      const tail = m[3] || '';
      // sizes order to prefer
      const sizes = [640, 320, 1024];
      return sizes.map(s => `${base}-${s}.webp${tail}`);
    } catch (e) {
      return [];
    }
  }

  async function exists(url) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function swapImg(img, best, srcset) {
    try {
      if (!img.dataset.full) img.dataset.full = img.src || '';
      if (srcset) img.setAttribute('srcset', srcset);
      img.src = best;
      // keep loading=lazy and decoding=async if present
      try { if (!img.loading) img.loading = 'lazy'; } catch (e) {}
      try { if (!img.decoding) img.decoding = 'async'; } catch (e) {}
    } catch (e) {
      // ignore
    }
  }

  async function handleImage(img) {
    const orig = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!orig) return;
    // don't touch remote images
    if (/^https?:\/\//i.test(orig) || orig.startsWith('data:')) return;

    const candidates = candidateUrls(orig);
    if (!candidates.length) return;

    // Check preferred candidate (640) first
    const preferred = candidates[0];
    if (await exists(preferred)) {
      const checks = await Promise.all(candidates.map(async (c) => ({ c, ok: await exists(c) })));
      const widths = [640, 320, 1024];
      const srcset = checks.filter(x => x.ok).map((x, idx) => `${x.c} ${widths[idx]}w`).join(', ');
      swapImg(img, preferred, srcset || undefined);
    }
  }

  function scan() {
    // target featured images in md content; include generic md-content imgs as fallback
    const imgs = document.querySelectorAll('.md-content.pswp-featured img, .md-content img');
    imgs.forEach((img) => {
      try {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src) return;
        if (/\.webp$/.test(src)) return; // already webp
        // fire-and-forget
        handleImage(img).catch(() => {});
      } catch (e) {}
    });
  }

  // schedule scanning with small debounce
  let scanTimer = null;
  function scheduleScan(delay = 60) {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { try { scan(); } catch (e) {} }, delay);
  }

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleScan(20));
  } else {
    scheduleScan(20);
  }

  // Re-scan when history navigation occurs (single-page navigation)
  try {
    const _push = history.pushState;
    history.pushState = function () {
      const ret = _push.apply(this, arguments);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    const _replace = history.replaceState;
    history.replaceState = function () {
      const ret = _replace.apply(this, arguments);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', () => scheduleScan(40));
  } catch (e) {
    // ignore
  }

  // MutationObserver: detect when new md-content is added to the DOM
  try {
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            try {
              if (n && n.querySelector && (n.matches && n.matches('.md-content') || n.querySelector('.md-content'))) {
                scheduleScan(30);
                return;
              }
            } catch (e) {}
          }
        }
      }
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (e) {}

})();
