/* =====================================================
   Khaya Kos — Nav Scroll Module
   Adds a shadow to the nav bar once the page scrolls.
   ===================================================== */

export function initNavScroll() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  window.addEventListener(
    'scroll',
    () => {
      nav.classList.toggle('scrolled', window.scrollY > 10);
    },
    { passive: true }
  );
}
