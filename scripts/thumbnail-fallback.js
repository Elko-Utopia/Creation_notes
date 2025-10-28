// Client-side fallback to swap inline markdown images to generated webp variants
// Runs in the browser; safe no-op if network/HEAD fails.
(async function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  function candidateUrls(origUrl) {
    // origUrl is a site-root or base-prefixed URL like /Creation_notes/assets/.. or /assets/...
    // produce variant URLs by inserting -<w>.webp before extension
    try {
      const m = origUrl.match(/^(.*?)(\.[^./?#]+)(\?|#|$)/);
      if (!m) return [];
      const base = m[1];
      const suffix = m[2];
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
      if (!img.dataset.full) img.dataset.full = img.src;
      if (srcset) img.setAttribute('srcset', srcset);
      img.src = best;
      // keep loading=lazy and decoding=async if present
      img.loading = img.loading || 'lazy';
      img.decoding = img.decoding || 'async';
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
      // build srcset by testing other candidates in parallel
      const checks = await Promise.all(candidates.map(async (c) => ({ c, ok: await exists(c) })));
      const srcset = checks.filter(x => x.ok).map((x, idx) => `${x.c} ${[640,320,1024][idx]}w`).join(', ');
      swapImg(img, preferred, srcset || undefined);
    }
  }

  function scan() {
    const imgs = document.querySelectorAll('.md-content.pswp-featured img');
    imgs.forEach((img) => {
      // only process images that appear to be local
      try {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src) return;
        if (/\.webp$/.test(src)) return; // already webp
        // run async but don't await (fire-and-forget)
        handleImage(img).catch(() => {});
      } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    setTimeout(scan, 20);
  }
})();
