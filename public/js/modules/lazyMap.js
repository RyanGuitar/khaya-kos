/* =====================================================
   Khaya Kos — Lazy Map Module
   The map iframe only loads once it's about to enter
   the viewport, keeping first-load weight low.
   ===================================================== */

export function initLazyMap() {
  const lazyIframes = document.querySelectorAll('iframe[data-src]');
  if (!lazyIframes.length) return;

  const iframeObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const iframe = entry.target;
          iframe.src = iframe.dataset.src;
          iframe.removeAttribute('data-src');
          iframeObserver.unobserve(iframe);
        }
      });
    },
    { rootMargin: '300px' }
  );

  lazyIframes.forEach((el) => iframeObserver.observe(el));
}
