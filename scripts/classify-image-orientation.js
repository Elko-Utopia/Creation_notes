// Classify image orientation for portfolio/article featured images
(function () {
  function classifyImageOrientation() {
    const imgs = Array.from(document.querySelectorAll('.md-content.pswp-featured img'));
    imgs.forEach((img) => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        img.classList.remove('landscape', 'portrait', 'square');
        if (w > h) img.classList.add('landscape');
        else if (h > w) img.classList.add('portrait');
        else img.classList.add('square');
      } catch (e) {
        // ignore
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', classifyImageOrientation);
  else classifyImageOrientation();
})();
