/**
 * lightbox.js — PhotoSwipe v5 封装
 *
 * 排除容器：.inline-portfolio-card、.no-lightbox、.md-masonry-wrapper
 * 图片源：data-full > data-lightbox-src > currentSrc > src
 *
 * window.initLightbox({ selector })
 * window.initLightboxAuto()
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const DEFAULT_SELECTOR = '.md-content.pswp-featured img';
  const EXCLUDED = ['.inline-portfolio-card', '.no-lightbox', '.md-masonry-wrapper'];

  const boundImages = new WeakSet();
  const registeredSelectors = new Set();
  let mutationObserver;
  let pswpLoaded = false;
  let PhotoSwipe;

  /* ─── 加载 PhotoSwipe（只加载一次） ─────── */
  function loadPhotoSwipe() {
    if (pswpLoaded) return Promise.resolve();
    pswpLoaded = true;

    if (!document.getElementById('pswp-base-css')) {
      const link = document.createElement('link');
      link.id = 'pswp-base-css';
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.css';
      document.head.appendChild(link);
    }

    return import('https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.min.js')
      .then(function (mod) { PhotoSwipe = mod.default; });
  }

  /* ─── 工具 ───────────────────────────────── */
  function resolveSource(img) {
    return img.dataset.full || img.dataset.lightboxSrc || img.currentSrc || img.src || null;
  }

  function isExcluded(node) {
    return EXCLUDED.some(function (sel) { return node.closest && node.closest(sel); });
  }

  /* ─── 收集同页图片组 ────────────────────── */
  function collectGallery(clickedImg) {
    const scope =
      clickedImg.closest('article') ||
      clickedImg.closest('.md-content') ||
      clickedImg.closest('main') ||
      document;

    const items = [];
    let startIndex = 0;

    scope.querySelectorAll('img').forEach(function (img) {
      if (isExcluded(img)) return;
      if (!boundImages.has(img)) return;
      const src = resolveSource(img);
      if (!src) return;
      if (img === clickedImg) startIndex = items.length;
      items.push({
        src: src,
        width: img.naturalWidth || 1600,
        height: img.naturalHeight || 900,
        alt: img.alt || '',
        element: img,
        msrc: img.currentSrc || img.src,
      });
    });

    return { items: items, startIndex: startIndex };
  }

  /* ─── 打开灯箱 ───────────────────────────── */
  function openLightbox(clickedImg) {
    loadPhotoSwipe().then(function () {
      if (!PhotoSwipe) return;

      const { items, startIndex } = collectGallery(clickedImg);
      if (!items.length) return;

      const pswp = new PhotoSwipe({
        dataSource: items,
        index: startIndex,

        bgOpacity: 0.9,
        spacing: 0.1,
        loop: false,
        pinchToClose: true,
        closeOnVerticalDrag: true,
        showHideAnimationType: 'zoom',

        getThumbBoundsFn: function (index) {
          const item = items[index];
          if (!item || !item.element) return null;
          const rect = item.element.getBoundingClientRect();
          return { x: rect.left, y: rect.top + (window.scrollY || 0), w: rect.width };
        },
      });

      /* ── 滚轮缩放：帧级响应，以鼠标位置为中心 ── */
      let wheelRaf = null;
      pswp.on('wheel', function (e) {
        e.preventDefault();
        const oe = e.originalEvent;

        if (wheelRaf) return; // 节流：每帧最多处理一次
        wheelRaf = requestAnimationFrame(function () { wheelRaf = null; });

        const delta = oe.deltaY !== undefined ? oe.deltaY : (oe.detail || 0);
        const slide = pswp.currSlide;
        const current = slide.currZoomLevel;
        const minZoom = slide.zoomLevels.fit;
        const maxZoom = slide.zoomLevels.max * 2;

        // 小步长：每档 4%
        const factor = delta < 0 ? 1.04 : 0.96;
        const next = Math.min(maxZoom, Math.max(minZoom, current * factor));

        if (next === current) return;

        // duration=0：立即到位，不产生动画叠加跳位
        slide.zoomTo(next, { x: oe.clientX, y: oe.clientY }, 0);
      });

      pswp.init();
    }).catch(function (err) {
      console.error('[lightbox] PhotoSwipe 加载失败', err);
    });
  }

  /* ─── 绑定图片 ───────────────────────────── */
  function bindImage(node) {
    if (!(node instanceof HTMLImageElement)) return;
    if (isExcluded(node)) return;
    if (boundImages.has(node)) return;

    if (!node.complete || node.naturalWidth === 0) {
      node.addEventListener('load', function () { bindImage(node); }, { once: true });
      return;
    }

    boundImages.add(node);
    node.addEventListener('click', function (e) {
      e.preventDefault();
      openLightbox(node);
    });
  }

  function bindImages(selector) {
    document.querySelectorAll(selector).forEach(bindImage);
  }

  /* ─── MutationObserver ───────────────────── */
  function ensureObserver() {
    if (mutationObserver || typeof MutationObserver === 'undefined') return;
    mutationObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;
          registeredSelectors.forEach(function (sel) {
            if (node.matches && node.matches(sel)) bindImage(node);
            node.querySelectorAll(sel).forEach(bindImage);
          });
        });
      });
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ─── 公开 API ───────────────────────────── */
  function initLightbox(opts) {
    const selector = (opts && opts.selector) ? String(opts.selector).trim() : DEFAULT_SELECTOR;
    bindImages(selector);
    registeredSelectors.add(selector);
    ensureObserver();
    loadPhotoSwipe().catch(function () {});
  }

  function initLightboxAuto() {
    initLightbox({ selector: DEFAULT_SELECTOR });
  }

  function autoInit() {
    bindImages(DEFAULT_SELECTOR);
    registeredSelectors.add(DEFAULT_SELECTOR);
    ensureObserver();
    loadPhotoSwipe().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  window.initLightbox = initLightbox;
  window.initLightboxAuto = initLightboxAuto;
})();
