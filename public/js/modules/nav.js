/* =====================================================
   Khaya Kos — Nav Scroll Module
   Adds a shadow to the nav bar once the page scrolls.
   ===================================================== */

export function initNavScroll() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const update = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', update, { passive: true });
  update();
}
