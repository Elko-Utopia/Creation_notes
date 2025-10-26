/**
 * 通用Markdown灯箱功能脚本
 * 自动为markdown内容中的所有图片添加灯箱功能
 * 适用于BlogPost和Portfolio布局
 */

// 等待页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initMarkdownLightbox();
});

function initMarkdownLightbox() {
    // 查找markdown内容区域中的所有图片
    const markdownContainers = [
        '.prose',           // BlogPost布局
        'main',             // Portfolio布局
        'article',          // 通用文章容器
        '.md-content'       // 其他可能的markdown容器
    ];
    
    let allImages = [];
    
    // 从各个容器中收集图片
    markdownContainers.forEach(selector => {
        const container = document.querySelector(selector);
        if (container) {
            const images = container.querySelectorAll('img');
            allImages = allImages.concat(Array.from(images));
        }
    });
    
    // 去重处理
    const uniqueImages = Array.from(new Set(allImages));
    
    // 为每个图片添加点击事件
    uniqueImages.forEach(img => {
        // 跳过hero图片（通常在.hero-image容器中）
        if (img.closest('.hero-image')) {
            return;
        }
        
        // 添加点击事件
        img.addEventListener('click', function(e) {
            e.preventDefault();
            openLightbox(this.src, this.alt || '');
        });
        
        // 添加视觉提示样式
        img.style.cursor = 'zoom-in';
        
        // 确保图片有过渡效果
        if (!img.style.transition) {
            img.style.transition = 'transform 0.2s ease';
        }
    });
    
    console.log(`Markdown Lightbox: 已为 ${uniqueImages.length} 张图片添加灯箱功能`);
}

/**
 * 打开灯箱显示图片
 * @param {string} imageSrc - 图片源地址
 * @param {string} imageAlt - 图片替代文本
 */
function openLightbox(imageSrc, imageAlt = '') {
    // 如果灯箱已存在，直接返回
    if (document.querySelector('.lightbox-overlay')) {
        return;
    }
    
    // 锁定页面滚动
    lockScroll();
    
    // 创建灯箱容器
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
        <div class="lightbox-content">
            <img src="${imageSrc}" alt="${imageAlt}" class="lightbox-image">
            <button class="lightbox-close" aria-label="关闭灯箱">&times;</button>
            ${imageAlt ? `<div class="lightbox-caption">${imageAlt}</div>` : ''}
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(overlay);
    
    // 添加关闭事件
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.classList.contains('lightbox-close')) {
            closeLightbox();
        }
    });
    
    // 添加键盘ESC关闭事件
    document.addEventListener('keydown', handleEscapeKey);
    
    // 添加显示动画
    requestAnimationFrame(() => {
        overlay.classList.add('lightbox-show');
    });
}

/**
 * 关闭灯箱
 */
function closeLightbox() {
    const overlay = document.querySelector('.lightbox-overlay');
    if (!overlay) return;
    
    // 添加关闭动画
    overlay.classList.remove('lightbox-show');
    
    // 动画完成后移除元素
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        unlockScroll();
        document.removeEventListener('keydown', handleEscapeKey);
    }, 300);
}

/**
 * 处理ESC键关闭
 */
function handleEscapeKey(e) {
    if (e.key === 'Escape') {
        closeLightbox();
    }
}

/**
 * 锁定页面滚动
 */
function lockScroll() {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.dataset.scrollY = scrollY;
}

/**
 * 解锁页面滚动
 */
function unlockScroll() {
    const scrollY = document.body.dataset.scrollY;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    if (scrollY) {
        window.scrollTo(0, parseInt(scrollY));
        delete document.body.dataset.scrollY;
    }
}