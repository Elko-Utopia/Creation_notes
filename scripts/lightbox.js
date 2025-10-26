const DEFAULT_SELECTOR = 'main img';

const boundImages = new WeakSet();
const registeredSelectors = new Set();

// 监控器支持
const monitor = {
  log: function(hookName, ...args) {
    if (window.LightboxMonitor && window.LightboxMonitor.isEnabled() && window.LightboxMonitor.hooks[hookName]) {
      window.LightboxMonitor.hooks[hookName](...args);
    }
  }
};

let overlayEl;
let stageEl;
let imageEl;
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

/**
 * 初始化轻量灯箱并绑定选择器对应的图片。
 */
function initLightbox({ selector = DEFAULT_SELECTOR, viewportPadding, transitionDuration } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const normalized = typeof selector === 'string' && selector.trim() ? selector.trim() : DEFAULT_SELECTOR;

  if (typeof viewportPadding === 'number' && Number.isFinite(viewportPadding)) {
    settings.viewportPadding = Math.max(0, viewportPadding);
  }
  if (typeof transitionDuration === 'number' && Number.isFinite(transitionDuration)) {
    settings.transitionDurationMs = clamp(transitionDuration, 80, 320);
    applyTransitionDuration();
  }

  ensureOverlay();
  bindImages(normalized);
  registeredSelectors.add(normalized);
  ensureObserver();
  
  // 自动预加载所有图片
  autoPreloadImages(normalized);
}

/**
 * 增强的自动初始化函数 - 无需任何配置
 * 自动检测页面中的 .md-content.pswp-featured img[data-full] 图片
 */
function initLightboxAuto() {
  const images = document.querySelectorAll('.md-content.pswp-featured img[data-full]');
  monitor.log('onInitialization', '.md-content.pswp-featured img[data-full]', images.length);
  
  if (images.length > 0) {
    initLightbox({ selector: '.md-content.pswp-featured img[data-full]' });
    // 简化的成功信息 - 不依赖监控器
    if (!window.LightboxMonitor || !window.LightboxMonitor.isEnabled()) {
      console.log(`✅ Lightbox initialized for ${images.length} images`);
    }
  } else {
    // 简化的提示信息 - 不依赖监控器
    if (!window.LightboxMonitor || !window.LightboxMonitor.isEnabled()) {
      console.log('ℹ️ No lightbox images found');
    }
  }
}

// 自动预加载图片函数
function autoPreloadImages(selector) {
  const images = document.querySelectorAll(selector);
  images.forEach(img => {
    if (img.dataset.full) {
      // 异步预加载高清图片
      setTimeout(() => {
        const fullImg = new Image();
        fullImg.src = img.dataset.full;
      }, 100);
    }
  });
}

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'lb-overlay';
  overlayEl.setAttribute('aria-hidden', 'true');
  overlayEl.setAttribute('aria-modal', 'true');
  overlayEl.setAttribute('role', 'dialog');
  overlayEl.setAttribute('tabindex', '-1');


  // 居中CSS loading动画
  const spinner = document.createElement('div');
  spinner.className = 'lb-spinner';
  spinner.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:20;display:none;pointer-events:none;width:48px;height:48px;';
  spinner.innerHTML = `<div style="width:32px;height:32px;border:4px solid #09f;border-top-color:transparent;border-radius:50%;animation:lbspin 0.8s linear infinite;"></div>`;
  overlayEl.appendChild(spinner);

  // 注入动画样式和响应式图片样式
  if (!document.getElementById('lbspin-style')) {
    const style = document.createElement('style');
    style.id = 'lbspin-style';
    style.textContent = `
      @keyframes lbspin{to{transform:rotate(360deg);}} 
      .lb-image{opacity:0;transition:opacity 0.35s cubic-bezier(.4,0,.2,1);} 
      .lb-image.lb-fadein{opacity:1;}
      
      /* 自动注入的响应式图片样式 */
      .md-content.pswp-featured img {
        margin-left: auto;
        margin-right: auto;
        display: block;
        object-fit: contain;
        max-width: 100%;
        height: auto;
        border-radius: 12px;
        box-shadow: var(--box-shadow, 0 6px 24px rgba(0, 0, 0, 0.08));
        margin: clamp(1.5rem, 5vw, 2.5rem) auto;
      }
      
      /* 横版图片样式 */
      .md-content.pswp-featured img.landscape {
        max-width: 100%;
        width: 100%;
        height: auto;
        max-height: none;
      }
      
      /* 竖版图片样式 */
      .md-content.pswp-featured img.portrait {
        max-height: 70vh;
        width: auto;
        max-width: 80%;
      }
      
      /* 正方形图片样式 */
      .md-content.pswp-featured img.square {
        max-width: 60%;
        width: 60%;
        height: auto;
      }
      
      @media (max-width: 720px) {
        .md-content.pswp-featured img.portrait {
          max-height: 60vh;
          max-width: 90%;
        }
        .md-content.pswp-featured img.square {
          max-width: 80%;
        }
      }
      
      /* 图片加载状态样式 */
      .md-content.pswp-featured img[style*="cursor: wait"] {
        opacity: 0.7;
        filter: grayscale(20%);
        position: relative;
      }
      
      .md-content.pswp-featured img[style*="cursor: wait"]::before {
        content: '⏳';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 2rem;
        z-index: 1;
        pointer-events: none;
        text-shadow: 0 0 4px rgba(255,255,255,0.8);
      }
      
      .md-content.pswp-featured img[style*="cursor: not-allowed"] {
        opacity: 0.5;
        filter: grayscale(100%);
      }
      
      .md-content.pswp-featured img[style*="cursor: not-allowed"]::before {
        content: '❌';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 2rem;
        z-index: 1;
        pointer-events: none;
        text-shadow: 0 0 4px rgba(255,255,255,0.8);
      }
    `;
    document.head.appendChild(style);
  }

  stageEl = document.createElement('div');
  stageEl.className = 'lb-stage';

  imageEl = document.createElement('img');
  imageEl.className = 'lb-image';
  imageEl.alt = '';
  imageEl.decoding = 'async';
  imageEl.draggable = false;

  stageEl.appendChild(imageEl);
  overlayEl.appendChild(stageEl);

  // loading控制方法
  overlayEl._spinner = spinner;

  if (document.body) {
    document.body.appendChild(overlayEl);
  } else {
    window.addEventListener(
      'DOMContentLoaded',
      () => {
        if (!overlayEl.isConnected) {
          document.body.appendChild(overlayEl);
        }
      },
      { once: true }
    );
  }

  overlayEl.addEventListener('click', onOverlayClick);
  overlayEl.addEventListener('wheel', onWheel, { passive: false });

  imageEl.addEventListener('pointerdown', onPointerDown);
  imageEl.addEventListener('pointermove', onPointerMove);
  imageEl.addEventListener('pointerup', onPointerUp);
  imageEl.addEventListener('pointercancel', onPointerCancel);
  imageEl.addEventListener('lostpointercapture', onPointerCancel);

  applyTransitionDuration();
}

function bindImages(selector) {
  document.querySelectorAll(selector).forEach(bindImage);
}

function bindImage(node) {
  if (!(node instanceof HTMLImageElement)) return;
  if (boundImages.has(node)) return;

  boundImages.add(node);
  node.addEventListener('click', onImageClick);
  
  // 检查图片加载状态并设置适当的光标
  updateImageCursor(node);
  
  // 监听图片加载完成事件
  if (!node.complete) {
    node.addEventListener('load', () => {
      updateImageCursor(node);
      classifyImageOrientation(node);
    }, { once: true });
    
    node.addEventListener('error', () => {
      updateImageCursor(node);
    }, { once: true });
  }
  
  // 自动分类图片方向
  classifyImageOrientation(node);
}

// 更新图片光标状态
function updateImageCursor(img) {
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) {
    // 图片未加载完成或加载失败
    img.style.cursor = 'wait';
    img.title = '图片加载中，请稍候...';
  } else {
    // 图片已加载完成
    img.style.cursor = 'pointer';
    img.title = '点击查看大图';
  }
}

// 图片方向分类函数
function classifyImageOrientation(img) {
  if (!img.naturalWidth || !img.naturalHeight) {
    // 如果图片还未加载，等待加载完成
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

function applyTransitionDuration() {
  if (!overlayEl) return;
  overlayEl.style.setProperty('--lb-duration', `${settings.transitionDurationMs}ms`);
}

function lockScroll() {
  // ...
  const startTime = performance.now();
  if (scrollLockSnapshot || typeof window === 'undefined') return;
  const body = document.body;
  const docEl = document.documentElement;
  if (!body || !docEl) return;

  // 保存当前滚动位置 - 使用更精确的方式
  const currentScrollY = window.pageYOffset || docEl.scrollTop || body.scrollTop || 0;
  const currentScrollX = window.pageXOffset || docEl.scrollLeft || body.scrollLeft || 0;
  const scrollbarWidth = window.innerWidth - docEl.clientWidth;
  
  monitor.log('onScrollLock', { 
    currentScrollY, 
    currentScrollX, 
    scrollbarWidth,
    windowScrollY: window.scrollY,
    docElScrollTop: docEl.scrollTop,
    bodyScrollTop: body.scrollTop
  });
  
  scrollLockSnapshot = {
    bodyOverflow: body.style.overflow,
    bodyPaddingRight: body.style.paddingRight,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyMarginRight: body.style.marginRight,
    docOverflow: docEl.style.overflow,
    htmlOverflow: docEl.style.overflow,
    htmlPaddingRight: docEl.style.paddingRight,
    appliedPadding: 0,
    savedScrollY: currentScrollY,
    savedScrollX: currentScrollX
  };

  // 给body加margin-right补偿滚动条消失，防止内容跳动（用margin而不是padding避免影响布局）
  if (scrollbarWidth > 0) {
    body.style.marginRight = `${scrollbarWidth}px`;
    scrollLockSnapshot.appliedPadding = scrollbarWidth;
  }

  // 锁定body：用fixed+top负值保持视觉位置不变
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `${-currentScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  // 不设置width，让body保持原有宽度计算方式
  
  const endTime = performance.now();
  monitor.log('onScrollLockComplete', {
    duration: (endTime - startTime).toFixed(2) + 'ms',
    bodyTop: body.style.top,
    actualScrollY: currentScrollY
  });
}

function unlockScroll() {
  // ...
  const startTime = performance.now();
  if (!scrollLockSnapshot) {
    monitor.log('onError', 'unlockScroll', 'scrollLockSnapshot为空，跳过解锁');
    return;
  }
  
  const body = document.body;
  const docEl = document.documentElement;
  
  // 保存快照数据到局部变量，防止被提前清空
  const savedScrollY = scrollLockSnapshot.savedScrollY || 0;
  const savedScrollX = scrollLockSnapshot.savedScrollX || 0;
  const bodyPosition = scrollLockSnapshot.bodyPosition || '';
  const bodyTop = scrollLockSnapshot.bodyTop || '';
  const bodyLeft = scrollLockSnapshot.bodyLeft || '';
  const bodyRight = scrollLockSnapshot.bodyRight || '';
  const bodyWidth = scrollLockSnapshot.bodyWidth || '';
  const bodyMarginRight = scrollLockSnapshot.bodyMarginRight || '';
  const bodyOverflow = scrollLockSnapshot.bodyOverflow || '';
  const htmlOverflow = scrollLockSnapshot.htmlOverflow || '';
  const htmlPaddingRight = scrollLockSnapshot.htmlPaddingRight || '';
  
  monitor.log('onScrollUnlock', {
    savedScrollY,
    bodyPosition,
    bodyTop,
    bodyOverflow,
    bodyMarginRight,
    htmlOverflow,
    htmlPaddingRight
  });
  
  // 清空快照
  scrollLockSnapshot = null;
  
  if (body && docEl) {
    // 先恢复body样式，移除fixed定位
    body.style.position = bodyPosition;
    body.style.top = bodyTop;
    body.style.left = bodyLeft;
    body.style.right = bodyRight;
    body.style.width = bodyWidth;
    body.style.marginRight = bodyMarginRight;
    body.style.overflow = bodyOverflow;
    
    // 恢复html样式
    docEl.style.overflow = htmlOverflow;
    docEl.style.paddingRight = htmlPaddingRight;
    
    // 使用requestAnimationFrame确保样式已应用后再恢复滚动
    requestAnimationFrame(() => {
      // 多种方式恢复滚动位置，确保兼容性
      window.scrollTo(savedScrollX, savedScrollY);
      docEl.scrollTop = savedScrollY;
      body.scrollTop = savedScrollY;
      
      const endTime = performance.now();
      monitor.log('onScrollUnlockComplete', {
        duration: (endTime - startTime).toFixed(2) + 'ms',
        restoredTo: { x: savedScrollX, y: savedScrollY },
        actualScrollY: window.scrollY,
        docElScrollTop: docEl.scrollTop,
        bodyScrollTop: body.scrollTop,
        canScroll: body.style.overflow !== 'hidden' && body.style.position !== 'fixed'
      });
    });
  }
}

function primeWithPreview(triggerImage) {
  const startTime = performance.now();
  
  if (!triggerImage) {
    monitor.log('onError', 'primeWithPreview', '没有触发图片');
    return false;
  }

  // 双重检查：确保缩略图已完全加载
  if (!triggerImage.complete || !triggerImage.naturalWidth || !triggerImage.naturalHeight) {
    monitor.log('onError', 'primeWithPreview', '缩略图未加载完成，无法获取预览');
    return false;
  }

  const previewSrc = triggerImage.currentSrc || triggerImage.src;
  
  if (!previewSrc) {
    monitor.log('onError', 'primeWithPreview', '没有预览图src');
    return false;
  }

  const rect = triggerImage.getBoundingClientRect();
  const naturalW = triggerImage.naturalWidth || triggerImage.width || rect.width;
  const naturalH = triggerImage.naturalHeight || triggerImage.height || rect.height;
  
  monitor.log('onImageLoadStart', previewSrc, {
    naturalW, 
    naturalH, 
    complete: triggerImage.complete,
    cached: triggerImage.complete && triggerImage.naturalWidth > 0
  });

  if (!naturalW || !naturalH) {
    monitor.log('onError', 'primeWithPreview', '无效尺寸');
    return false;
  }

  state.naturalWidth = naturalW;
  state.naturalHeight = naturalH;
  state.scale = 1;
  state.translateX = 0;
  state.translateY = 0;

  const beforeSetSrc = performance.now();
  
  // 如果imageEl已经是同一个src，不要重复设置
  if (imageEl.src === previewSrc) {
    imageEl.style.width = `${state.naturalWidth}px`;
    imageEl.style.height = `${state.naturalHeight}px`;
    configureStageDimensions(false);
    const endTime = performance.now();
    monitor.log('onImageLoadComplete', previewSrc, {
      duration: (endTime - startTime).toFixed(2) + 'ms',
      cached: true,
      skippedReload: true
    });
    return true;
  }
  
  imageEl.src = previewSrc;
  const afterSetSrc = performance.now();
  
  imageEl.alt = triggerImage.alt || '';
  imageEl.style.width = `${state.naturalWidth}px`;
  imageEl.style.height = `${state.naturalHeight}px`;
  configureStageDimensions(false);
  
  const endTime = performance.now();
  monitor.log('onImageLoadComplete', previewSrc, {
    duration: (endTime - startTime).toFixed(2) + 'ms',
    cached: false,
    loadTime: (afterSetSrc - beforeSetSrc).toFixed(2) + 'ms'
  });
  return true;
}

function scanNodeForImages(node) {
  registeredSelectors.forEach((selector) => {
    if (node.matches(selector)) {
      bindImage(node);
    }
    node.querySelectorAll(selector).forEach(bindImage);
  });
}

function onImageClick(event) {
  // ...
  if (event.button && event.button !== 0) return;
  event.preventDefault();

  const target = event.currentTarget;
  if (!(target instanceof HTMLImageElement)) return;

  // 检查缩略图是否已完全加载
  if (!target.complete || !target.naturalWidth || !target.naturalHeight) {
    monitor.log('onError', 'onImageClick', '缩略图未加载完成，阻止灯箱打开');
    console.warn('⚠️ 缩略图未加载完成，无法打开灯箱');
    
    // 可选：显示加载提示
    if (!target.dataset.loadingHint) {
      target.dataset.loadingHint = 'true';
      target.style.cursor = 'wait';
      
      // 等待图片加载完成后恢复光标
      const handleLoad = () => {
        target.style.cursor = 'pointer';
        delete target.dataset.loadingHint;
        target.removeEventListener('load', handleLoad);
        target.removeEventListener('error', handleError);
      };
      
      const handleError = () => {
        target.style.cursor = 'not-allowed';
        delete target.dataset.loadingHint;
        target.removeEventListener('load', handleLoad);
        target.removeEventListener('error', handleError);
        console.error('❌ 缩略图加载失败:', target.src);
      };
      
      target.addEventListener('load', handleLoad, { once: true });
      target.addEventListener('error', handleError, { once: true });
    }
    
    return;
  }

  // ...
  openLightbox(target);
}

async function openLightbox(triggerImage) {
  // ...
  if (isOpen || !triggerImage) return;

  const source = resolveSource(triggerImage);
  // ...
  if (!source) return;

  const requestId = ++openRequestId;

  const startTime = performance.now();
  monitor.log('onLightboxOpen', {
    src: triggerImage.src,
    currentSrc: triggerImage.currentSrc,
    complete: triggerImage.complete,
    naturalWidth: triggerImage.naturalWidth,
    naturalHeight: triggerImage.naturalHeight
  });

  // 重置imageEl状态，清除上一次光箱的残留
  imageEl.style.visibility = 'hidden';
  imageEl.classList.remove('lb-fadein');
  imageEl.style.transition = '';
  imageEl.onload = null;
  imageEl.onerror = null;
  // 先锁定滚动，彻底消除跳动
  const beforeLockScroll = performance.now();
  lockScroll();
  const afterLockScroll = performance.now();
  // 立即显示lightbox，使用当前图片作为预览
  isOpen = true;
  overlayEl.setAttribute('aria-hidden', 'false');
  overlayEl.classList.add('lb-open');
  skipCloseClick = false;

  // 秒开预览：直接使用页面img的src
  const beforePrime = performance.now();  
  // 获取预览图src用于后续检查
  const previewSrc = triggerImage.currentSrc || triggerImage.src;
  
  const primeSuccess = primeWithPreview(triggerImage);
  const afterPrime = performance.now();  
  const beforeVisible = performance.now();
  
  // 检查原始图片是否已缓存
  const originalImageCached = triggerImage.complete && triggerImage.naturalWidth > 0;  
  // 等待图片加载完成的通用函数
  const handleImageLoad = () => {
    imageEl.removeEventListener('load', handleImageLoad);
    imageEl.removeEventListener('error', handleImageError);
    
    if (overlayEl._spinner) {
      overlayEl._spinner.style.display = 'none';
    }
    
    imageEl.style.visibility = 'visible';
    
    if (originalImageCached) {
      // 原始图片已缓存，立即显示（不要淡入动画）
      imageEl.classList.add('lb-fadein');
      imageEl.style.transition = 'none';
      requestAnimationFrame(() => {
        imageEl.style.transition = '';
      });
    } else {
      // 原始图片未缓存，使用淡入动画
      setTimeout(() => { imageEl.classList.add('lb-fadein'); }, 10);
    }
  };
  
  const handleImageError = () => {
    imageEl.removeEventListener('load', handleImageLoad);
    imageEl.removeEventListener('error', handleImageError);
    if (overlayEl._spinner) {
      overlayEl._spinner.style.display = 'none';
    }
    // 即使失败也显示，避免一直loading
    imageEl.style.visibility = 'visible';
    imageEl.classList.add('lb-fadein');
  };
  
  // 检查imageEl是否需要等待加载
  if (imageEl.complete && imageEl.naturalWidth > 0) {
    // imageEl已经加载完成，立即显示
    handleImageLoad();
  } else {
    // imageEl需要等待加载
    
    // 先隐藏imageEl
    imageEl.style.visibility = 'hidden';
    imageEl.classList.remove('lb-fadein');
    
    // 根据原始图片缓存状态决定是否显示loading
    if (originalImageCached) {
      // 不显示loading，预期很快完成
    } else {
      if (overlayEl._spinner) {
        overlayEl._spinner.style.display = '';
      }
    }
    
    // 设置加载事件监听器
    imageEl.addEventListener('load', handleImageLoad, { once: true });
    imageEl.addEventListener('error', handleImageError, { once: true });
  }
  
  const afterVisible = performance.now();  
  const totalInitTime = performance.now() - startTime;
  monitor.log('onLightboxOpenComplete');

  // 异步加载大图（如有data-full）
  let fullSrc = triggerImage.dataset && triggerImage.dataset.full;
  if (fullSrc && fullSrc !== imageEl.src) {
    if (overlayEl._spinner) overlayEl._spinner.style.display = '';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', fullSrc, true);
    xhr.responseType = 'blob';
    xhr.onload = function() {
      if (xhr.status === 200) {
        const blobUrl = URL.createObjectURL(xhr.response);
        const img = new window.Image();
        img.onload = function() {
          if (isOpen) {
            state.naturalWidth = img.naturalWidth;
            state.naturalHeight = img.naturalHeight;
            imageEl.classList.remove('lb-fadein');
            imageEl.src = blobUrl;
            configureStageDimensions(false);
            setTimeout(()=>{imageEl.classList.add('lb-fadein');}, 10);
            if (overlayEl._spinner) overlayEl._spinner.style.display = 'none';
          }
        };
        img.src = blobUrl;
      } else {
        if (overlayEl._spinner) overlayEl._spinner.style.display = 'none';
      }
    };
    xhr.onerror = function() {
      if (overlayEl._spinner) overlayEl._spinner.style.display = 'none';
    };
    xhr.send();
  }

  // 异步加载高质量图片，不阻塞显示
  loadSourceImage(triggerImage, source).then(loaded => {
    if (!isOpen || requestId !== openRequestId) {
      return;
    }
    
    if (loaded && loaded.src !== imageEl.src) {
      // 无缝切换到高质量图片
      state.naturalWidth = loaded.naturalWidth;
      state.naturalHeight = loaded.naturalHeight;
      imageEl.src = loaded.src;
      imageEl.style.width = `${state.naturalWidth}px`;
      imageEl.style.height = `${state.naturalHeight}px`;
      configureStageDimensions(false);
    }
  }).catch(error => {
  // ...
    // 继续使用预览图片
  });

  // 添加事件监听器
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', handleResize);
  
  // 手动添加键盘支持，不依赖focus
  overlayEl.setAttribute('tabindex', '-1');
  overlayEl.style.outline = 'none';
}

function closeLightbox() {
  const startTime = performance.now();
  monitor.log('onLightboxClose');
  
  if (!isOpen) return;
  isOpen = false;
  
  // 移除事件监听器（立即执行，防止在关闭动画期间响应事件）
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('resize', handleResize);
  
  // 定义清理函数
  const cleanup = () => {
    const beforeClear = performance.now();
    
    // 清理图片元素的所有状态
    imageEl.src = '';
    imageEl.alt = '';
    imageEl.style.width = '0px';
    imageEl.style.height = '0px';
    imageEl.style.visibility = 'hidden';  // 重置可见性
    imageEl.style.transition = '';  // 重置过渡
    imageEl.classList.remove('lb-fadein');  // 移除淡入类
    
    // 移除可能残留的事件监听器
    imageEl.onload = null;
    imageEl.onerror = null;    
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    applyTransform();
    state.naturalWidth = 0;
    state.naturalHeight = 0;

    window.clearTimeout(pointerState.longPressTimer);
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.longPressTimer = 0;
    pointerState.dragReady = false;
    pointerState.hasDragged = false;
    skipCloseClick = false;
    
    const totalTime = performance.now() - startTime;
    monitor.log('onLightboxCloseComplete');
  };
  
  // 监听过渡结束事件，然后解锁滚动
  const handleTransitionEnd = (e) => {
    // 只监听opacity过渡，避免重复触发
    if (e.target === overlayEl && e.propertyName === 'opacity') {
      overlayEl.removeEventListener('transitionend', handleTransitionEnd);
      clearTimeout(fallbackTimeout);
      const beforeUnlock = performance.now();      unlockScroll();
      const afterUnlock = performance.now();      cleanup();
    }
  };
  
  overlayEl.addEventListener('transitionend', handleTransitionEnd);
  
  // 添加超时保护，防止transitionend不触发
  const fallbackTimeout = setTimeout(() => {
    overlayEl.removeEventListener('transitionend', handleTransitionEnd);    unlockScroll();
    cleanup();
  }, 500);
  
  // 移除lb-open类，触发CSS过渡动画
  overlayEl.classList.remove('lb-open');
  if (document.activeElement === overlayEl) {
    overlayEl.blur();
  }
  overlayEl.setAttribute('aria-hidden', 'true');}

function onOverlayClick(event) {
  if (!isOpen) return;
  if (skipCloseClick) {
    skipCloseClick = false;
    return;
  }
  event.preventDefault();
  closeLightbox();
}

function onKeyDown(event) {
  if (!isOpen) return;
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault();
    closeLightbox();
  }
}

function handleResize() {
  if (!isOpen || !state.naturalWidth || !state.naturalHeight) return;
  configureStageDimensions(true);
}

function configureStageDimensions(maintainCurrentView) {
  const paddingLimit = Math.min(settings.viewportPadding, Math.min(window.innerWidth, window.innerHeight) / 2);
  const viewportW = Math.max(1, window.innerWidth - paddingLimit * 2);
  const viewportH = Math.max(1, window.innerHeight - paddingLimit * 2);

  const stageWidth = Math.max(1, Math.min(state.naturalWidth, viewportW));
  const stageHeight = Math.max(1, Math.min(state.naturalHeight, viewportH));

  stageEl.style.width = `${stageWidth}px`;
  stageEl.style.height = `${stageHeight}px`;

  const fitScale = Math.min(stageWidth / state.naturalWidth, stageHeight / state.naturalHeight, 1);

  state.initialScale = fitScale;
  state.minScale = Math.min(fitScale, 0.5);
  state.maxScale = 3;

  if (!maintainCurrentView) {
    state.scale = fitScale;
    state.translateX = (stageWidth - state.naturalWidth * state.scale) / 2;
    state.translateY = (stageHeight - state.naturalHeight * state.scale) / 2;
  } else {
    state.scale = clamp(state.scale, state.minScale, state.maxScale);
    constrainTranslation();
  }

  applyTransform();
}

/**
 * 鼠标滚轮缩放需要确保光标下的像素不漂移，
 * 因此缩放前记录光标对应的图像坐标，再重新解新的平移量。
 */
function onWheel(event) {
  if (!isOpen) return;
  event.preventDefault();

  if (!state.naturalWidth) return;

  const rect = stageEl.getBoundingClientRect();
  const offsetX = clamp(event.clientX - rect.left, 0, rect.width);
  const offsetY = clamp(event.clientY - rect.top, 0, rect.height);

  const scaleFactor = computeWheelScale(event);
  const nextScale = clamp(state.scale * scaleFactor, state.minScale, state.maxScale);
  if (Math.abs(nextScale - state.scale) < 1e-4) return;

  const imageX = (offsetX - state.translateX) / state.scale;
  const imageY = (offsetY - state.translateY) / state.scale;

  state.scale = nextScale;
  state.translateX = offsetX - imageX * state.scale;
  state.translateY = offsetY - imageY * state.scale;

  constrainTranslation();
  applyTransform();
}

/**
 * 长按激活拖拽，松开后解除 pointer capture，拖拽只影响视觉平移。
 */
function onPointerDown(event) {
  if (!isOpen || event.button !== 0) return;

  pointerState.active = true;
  pointerState.pointerId = event.pointerId;
  pointerState.startX = event.clientX;
  pointerState.startY = event.clientY;
  pointerState.originX = state.translateX;
  pointerState.originY = state.translateY;
  pointerState.hasDragged = false;
  pointerState.dragReady = false;

  window.clearTimeout(pointerState.longPressTimer);
  pointerState.longPressTimer = window.setTimeout(() => {
    pointerState.dragReady = true;
  }, 180);

  try {
    imageEl.setPointerCapture(event.pointerId);
  } catch (_) {
    // pointer capture 在部分浏览器上可能不支持，忽略即可。
  }
}

function onPointerMove(event) {
  if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;

  const deltaX = event.clientX - pointerState.startX;
  const deltaY = event.clientY - pointerState.startY;

  if (!pointerState.dragReady) {
    return;
  }

  if (!pointerState.hasDragged) {
    pointerState.hasDragged = true;
  }

  state.translateX = pointerState.originX + deltaX;
  state.translateY = pointerState.originY + deltaY;
  constrainTranslation();
  applyTransform();
  skipCloseClick = true;
}

function onPointerUp(event) {
  if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;

  window.clearTimeout(pointerState.longPressTimer);
  pointerState.longPressTimer = 0;

  try {
    imageEl.releasePointerCapture(event.pointerId);
  } catch (_) {
    // 捕获可能未开启，忽略错误。
  }

  if (pointerState.hasDragged) {
    skipCloseClick = true;
    window.setTimeout(() => {
      skipCloseClick = false;
    }, 0);
  }

  pointerState.active = false;
  pointerState.pointerId = null;
  pointerState.hasDragged = false;
  pointerState.dragReady = false;
}

function onPointerCancel(event) {
  if (pointerState.pointerId !== null && event.pointerId !== pointerState.pointerId) {
    return;
  }

  window.clearTimeout(pointerState.longPressTimer);
  pointerState.longPressTimer = 0;
  pointerState.active = false;
  pointerState.pointerId = null;
  pointerState.hasDragged = false;
  pointerState.dragReady = false;

  try {
    if (event.pointerId !== undefined) {
      imageEl.releasePointerCapture(event.pointerId);
    }
  } catch (_) {
    // 忽略。
  }
}

function applyTransform() {
  imageEl.style.transform = `translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.scale})`;
}

function constrainTranslation() {
  const stageWidth = stageEl.clientWidth;
  const stageHeight = stageEl.clientHeight;

  const displayWidth = state.naturalWidth * state.scale;
  const displayHeight = state.naturalHeight * state.scale;

  const minX = Math.min(0, stageWidth - displayWidth);
  const maxX = Math.max(0, stageWidth - displayWidth);
  const minY = Math.min(0, stageHeight - displayHeight);
  const maxY = Math.max(0, stageHeight - displayHeight);

  state.translateX = clamp(state.translateX, minX, maxX);
  state.translateY = clamp(state.translateY, minY, maxY);
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

// 使initLightbox在全局作用域中可用
window.initLightbox = initLightbox;
window.initLightboxAuto = initLightboxAuto;
