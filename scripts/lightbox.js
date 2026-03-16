const DEFAULT_SELECTOR = 'main img';

const boundImages = new WeakSet();
const registeredSelectors = new Set();

 
const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

 
const monitor = {
  log: function() {}
};

 
let observer;
let openRequestId = 0;

let isOpen = false;
let skipCloseClick = false;
let scrollLockSnapshot = null;

const settings = {
  viewportPadding: 48,
  transitionDurationMs: 150,
};

const state = {
  naturalWidth: 0,
  naturalHeight: 0,
  scale: 1,
  initialScale: 1,
  minScale: 0.5,
  maxScale: 3,
  translateX: 0,
  translateY: 0,
};

const pointerState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  longPressTimer: 0,
  dragReady: false,
  hasDragged: false,
};

 
function ensureOpenSeadragon(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.OpenSeadragon) return resolve(window.OpenSeadragon);
    // Avoid adding multiple script tags
    const existing = document.querySelector('script[data-osd-loader]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.OpenSeadragon));
      existing.addEventListener('error', () => reject(new Error('OSD load failed')));
      return;
    }
    const s = document.createElement('script');
    s.setAttribute('data-osd-loader', '1');
    s.src = 'https://openseadragon.github.io/openseadragon/openseadragon.min.js';
    s.async = true;
    const to = setTimeout(() => { reject(new Error('OpenSeadragon load timeout')); }, timeoutMs);
    s.onload = () => { clearTimeout(to); resolve(window.OpenSeadragon); };
    s.onerror = (e) => { clearTimeout(to); reject(new Error('OpenSeadragon load error')); };
    document.head.appendChild(s);
  });
}

function openWithOpenSeadragon(imageUrl, opts = {}) {
  try {
    // Create or reuse a modal container
    let modal = document.getElementById('osd-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'osd-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;';
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'Close';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;z-index:100000;padding:8px 12px;border-radius:6px;background:#fff;color:#000;border:none;';
      closeBtn.id = 'osd-close-btn';
      modal.appendChild(closeBtn);
      const viewer = document.createElement('div');
      viewer.id = 'osd-viewer';
      viewer.style.cssText = 'width:100%;height:100%;touch-action:none;';
      modal.appendChild(viewer);
      document.body.appendChild(modal);
      closeBtn.addEventListener('click', () => {
        try { if (window._osdViewer) { window._osdViewer.destroy(); window._osdViewer = null; } } catch(e){}
        modal.style.display = 'none';
      });
    } else {
      modal.style.display = '';
    }

    // Init OpenSeadragon viewer
    try {
      if (window._osdViewer) {
        try { window._osdViewer.destroy(); } catch(e){}
        window._osdViewer = null;
      }
      window._osdViewer = window.OpenSeadragon({
        id: 'osd-viewer',
        prefixUrl: opts.prefixUrl || 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: { type: 'image', url: imageUrl },
        gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
        showNavigator: !!opts.showNavigator,
        defaultZoomLevel: 0
      });
    } catch (e) {
      console.warn('OpenSeadragon init failed', e);
      throw e;
    }
  } catch (err) {
    console.error('openWithOpenSeadragon failed', err);
    throw err;
  }
}


 
function initLightbox({ selector = DEFAULT_SELECTOR, viewportPadding, transitionDuration } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const normalized = typeof selector === 'string' && selector.trim() ? selector.trim() : DEFAULT_SELECTOR;

  if (typeof viewportPadding === 'number' && Number.isFinite(viewportPadding)) {
    settings.viewportPadding = Math.max(0, viewportPadding);
  }

  if (!document.getElementById('lightbox-styles-injected')) {
    const style = document.createElement('style');
    style.id = 'lightbox-styles-injected';
    style.textContent = `
      .md-content.pswp-featured img:not(.hero-img) {
        margin-left: auto;
        margin-right: auto;
        display: block;
        object-fit: contain;
        max-width: 100%;
        height: auto;
        border-radius: 12px;
        box-shadow: var(--box-shadow, 0 6px 24px rgba(0, 0, 0, 0.08));
        margin: clamp(1.5rem, 5vw, 2.5rem) auto;
        cursor: pointer;
      }
      
      .md-content.pswp-featured img:not(.hero-img).landscape {
        max-width: 100%;
        width: 100%;
        height: auto;
        max-height: none;
      }
      
      .md-content.pswp-featured img:not(.hero-img).portrait {
        max-height: 70vh;
        width: auto;
        max-width: 80%;
      }
      
      .md-content.pswp-featured img:not(.hero-img).square {
        max-width: 60%;
        width: 60%;
        height: auto;
      }
      
      @media (max-width: 720px) {
        .md-content.pswp-featured img:not(.hero-img).portrait {
          max-height: 60vh;
          max-width: 90%;
        }
        .md-content.pswp-featured img:not(.hero-img).square {
          max-width: 80%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  bindImages(normalized);
  registeredSelectors.add(normalized);
  ensureObserver();
  

}

 
function initLightboxAuto() {
  const images = document.querySelectorAll('.md-content.pswp-featured img[data-full]');
  monitor.log('onInitialization', '.md-content.pswp-featured img[data-full]', images.length);
  
  if (images.length > 0) {
    initLightbox({ selector: '.md-content.pswp-featured img[data-full]' });
  }
}

 
function autoPreloadImages(selector) {
  const images = document.querySelectorAll(selector);
  images.forEach(img => {
    if (img.dataset.full) {
      
      setTimeout(() => {
        const fullImg = new Image();
        fullImg.src = img.dataset.full;
      }, 100);
    }
  });
}

 
(function schedulePreloadAfterLoad() {
  if (typeof window === 'undefined') return;

  function shouldPreload() {
    try {
      if (navigator.connection) {
        if (navigator.connection.saveData) return false;
        const et = navigator.connection.effectiveType || '';
        if (/2g|slow-2g/.test(et)) return false;
      }
    } catch (e) {}
    return true;
  }

  function runPreload() {
    if (!shouldPreload()) return;
    // If selectors were registered via initLightbox, use them; otherwise fallback
    const sels = registeredSelectors.size ? Array.from(registeredSelectors) : [DEFAULT_SELECTOR];
    for (const s of sels) {
      try { autoPreloadImages(s); } catch (e) {}
    }
  }

  window.addEventListener('load', () => {
    // schedule during idle time to avoid blocking rendering
    if (typeof requestIdleCallback === 'function') {
      try { requestIdleCallback(runPreload, { timeout: 2000 }); } catch (e) { setTimeout(runPreload, 1500); }
    } else {
      setTimeout(runPreload, 1500);
    }
  });
})();

function bindImages(selector) {
  document.querySelectorAll(selector).forEach(bindImage);
}

function bindImage(node) {
  if (!(node instanceof HTMLImageElement)) return;
  // Do not bind images that are inside inline portfolio cards (injected wiki-link cards)
  // — these images are UI/teaser images and should not open in the site-wide lightbox.
  if (node.closest && node.closest('.inline-portfolio-card')) return;
  // Do not bind images inside masonry galleries - they have their own lightbox handling
  if (node.closest && node.closest('.md-masonry-wrapper')) return;

  // ...existing code...
  try {
    console.debug('[lightbox.debug] bindImage candidate', {
      src: node.src,
      currentSrc: node.currentSrc,
      complete: node.complete,
      naturalWidth: node.naturalWidth,
      naturalHeight: node.naturalHeight,
      inInlineCard: !!(node.closest && node.closest('.inline-portfolio-card'))
    });
  } catch (e) {  }
    // ...existing code...
    try {
      const hasLayout = node.offsetWidth > 0 && node.offsetHeight > 0;
      if (!node.complete || !hasLayout) {
        console.debug('[lightbox.debug] bindImage deferred (not ready)', { src: node.src, complete: node.complete, offsetWidth: node.offsetWidth, offsetHeight: node.offsetHeight });
        const onReady = function onReady() {
          try { node.removeEventListener('load', onReady); node.removeEventListener('error', onErr); } catch(e){}
          // Re-run bindImage when the image is ready
          try { bindImage(node); } catch(e) { console.warn('[lightbox.debug] bindImage rebind failed', e); }
        };
        const onErr = function onErr() {
          try { node.removeEventListener('load', onReady); node.removeEventListener('error', onErr); } catch(e){}
          console.debug('[lightbox.debug] bindImage deferred image error', { src: node.src });
        };
        node.addEventListener('load', onReady, { once: true });
        node.addEventListener('error', onErr, { once: true });
        return;
      }
  } catch (e) {  }

    if (boundImages.has(node)) return;

    boundImages.add(node);
    node.addEventListener('click', onImageClick);
  try { console.debug('[lightbox.debug] bindImage bound listener', { src: node.src, currentSrc: node.currentSrc }); } catch(e){}
  
  // ...existing code...
  updateImageCursor(node);
  
  // ...existing code...
  if (!node.complete) {
    node.addEventListener('load', () => {
      updateImageCursor(node);
      classifyImageOrientation(node);
    }, { once: true });
    
    node.addEventListener('error', () => {
      updateImageCursor(node);
    }, { once: true });
  }
  
  // ...existing code...
  classifyImageOrientation(node);
}

 
function updateImageCursor(img) {
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
    // ...existing code...
    img.style.cursor = 'wait';
    img.title = 'Image loading, please wait...';
  } else {
    // ...existing code...
    img.style.cursor = 'pointer';
    img.title = 'Click to view the larger image';
  }
}

 
function classifyImageOrientation(img) {
  if (!img.naturalWidth || !img.naturalHeight) {
    // ...existing code...
    if (!img.complete) {
      img.addEventListener('load', () => classifyImageOrientation(img), { once: true });
      return;
    }
  }
  
  const aspectRatio = img.naturalWidth / img.naturalHeight;
  
  img.classList.remove('landscape', 'portrait', 'square');
  
  if (aspectRatio > 1.1) {
    img.classList.add('landscape');
  } else if (aspectRatio < 0.9) {
    img.classList.add('portrait');
  } else {
    img.classList.add('square');
  }
}

function ensureObserver() {
  if (observer || typeof MutationObserver === 'undefined') return;

  observer = new MutationObserver((mutations) => {
    if (!registeredSelectors.size) return;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        scanNodeForImages(node);
      });
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

 

function onImageClick(event) {
  if (event.button && event.button !== 0) return;
  event.preventDefault();

  const target = event.currentTarget;
  if (!(target instanceof HTMLImageElement)) return;

  const full = resolveSource(target);
  if (full) {
    ensureOpenSeadragon().then(() => {
      try {
        openWithOpenSeadragon(target.dataset.dzi || full, { showNavigator: true });
      } catch (e) {
        console.error('OSD open failed', e);
      }
    }).catch((err) => {
      console.error('OSD load failed', err);
    });
  }
}

 

 

function computeWheelScale(event) {
  const { deltaY, deltaMode } = event;
  if (deltaY === 0) return 1;

  const step = deltaMode === 1 ? 0.2 : deltaMode === 2 ? 0.45 : 0.0025;
  return Math.exp(-deltaY * step);
}

function resolveSource(image) {
  if (image.dataset && image.dataset.full) {
    return image.dataset.full;
  }
  if (image.dataset && image.dataset.lightboxSrc) {
    return image.dataset.lightboxSrc;
  }
  return image.currentSrc || image.src || null;
}

function loadSourceImage(original, src) {
  return new Promise((resolve, reject) => {
    const loader = new Image();
    loader.decoding = 'async';

    if (original && original.crossOrigin) {
      loader.crossOrigin = original.crossOrigin;
    }
    if (original && original.referrerPolicy) {
      loader.referrerPolicy = original.referrerPolicy;
    }
    if (original && original.srcset) {
      loader.srcset = original.srcset;
      if (original.sizes) {
        loader.sizes = original.sizes;
      }
    }

    loader.addEventListener(
      'load',
      () => {
        const finalize = () =>
          resolve({
            src: loader.currentSrc || loader.src,
            width: loader.naturalWidth,
            height: loader.naturalHeight,
            alt: original ? original.alt || '' : '',
          });

        if (typeof loader.decode === 'function') {
          loader.decode().then(finalize).catch(finalize);
        } else {
          finalize();
        }
      },
      { once: true }
    );

    loader.addEventListener('error', reject, { once: true });
    loader.src = src;
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

 
window.initLightbox = initLightbox;
window.initLightboxAuto = initLightboxAuto;

