// Init PhotoSwipe only for the Featured (Markdown) area
// Try local dependency first; fallback to CDN on failure (dev environments)
let PhotoSwipeLightbox;
function loadCss(href){
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = (e) => reject(e);
    document.head.appendChild(link);
  });
}
async function ensurePhotoSwipe() {
  try {
    const m = await import('photoswipe/lightbox');
    PhotoSwipeLightbox = m.default;
    // 样式已由页面侧全局引入；若没有，引入 CDN 样式兜底
    if (!Array.from(document.styleSheets).some(s => (s.href||'').includes('photoswipe'))) {
      await loadCss('https://unpkg.com/photoswipe@5/dist/photoswipe.css');
    }
  } catch (e) {
    // Fallback to CDN（浏览器原生 import 不支持 CSS，需要 <link> 注入）
    await loadCss('https://unpkg.com/photoswipe@5/dist/photoswipe.css');
    const m2 = await import('https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.js');
    PhotoSwipeLightbox = m2.default;
  }
}

function wrapImagesForLightbox(root) {
  const imgs = root.querySelectorAll('img');
  imgs.forEach((img) => {
    if (!(img instanceof HTMLImageElement)) return;
    const parentIsLink = img.parentElement?.tagName.toLowerCase() === 'a';
    if (parentIsLink) return;

    const link = document.createElement('a');
    const src = (img.currentSrc || img.src);
    link.href = src;
    link.setAttribute('data-pswp-src', src);
    const setSize = () => {
      if (img.naturalWidth && img.naturalHeight) {
        link.setAttribute('data-pswp-width', String(img.naturalWidth));
        link.setAttribute('data-pswp-height', String(img.naturalHeight));
      }
    };
    if (img.complete) setSize(); else img.addEventListener('load', setSize, { once: true });

    img.replaceWith(link);
    link.appendChild(img);
  });
}

function setSizeOnLinkedImages(root) {
  const linkedImgs = root.querySelectorAll('a > img');
  linkedImgs.forEach((img) => {
    const a = img.parentElement;
    if (!(img instanceof HTMLImageElement) || !(a instanceof HTMLAnchorElement)) return;
    const src = (img.currentSrc || img.src);
    a.setAttribute('data-pswp-src', src);
    if (a.getAttribute('data-pswp-width') && a.getAttribute('data-pswp-height')) return;
    const setSize = () => {
      if (img.naturalWidth && img.naturalHeight) {
        a.setAttribute('data-pswp-width', String(img.naturalWidth));
        a.setAttribute('data-pswp-height', String(img.naturalHeight));
      }
    };
    if (img.complete) setSize(); else img.addEventListener('load', setSize, { once: true });
  });
}

;(async () => {
  // close legacy overlay if somehow open
  try { const lb = document.querySelector('.lightbox'); lb?.classList.remove('active'); document.body.style.overflow = ''; } catch {}

  await ensurePhotoSwipe();
  const featuredRoot = document.querySelector('.pswp-featured') || document;
  wrapImagesForLightbox(featuredRoot);
  setSizeOnLinkedImages(featuredRoot);

  const lightbox = new PhotoSwipeLightbox({
    gallery: '.pswp-featured',
    children: 'a',
    pswpModule: () => import('photoswipe'),
    wheelToZoom: true,
    showHideAnimationType: 'zoom',
    tapAction: 'close',
    imageClickAction: 'close',
    bgClickAction: 'close',
    doubleTapAction: 'zoom',
    closeOnVerticalDrag: true,
  });
  lightbox.init();
  window.__PSWP_READY__ = true;
})();
