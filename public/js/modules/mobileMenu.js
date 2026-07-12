/* =====================================================
   Khaya Kos — Mobile Menu Module
   Handles the hamburger toggle, outside-click close,
   closing after a link is tapped, and closing automatically
   if the user starts scrolling with the menu open.
   ===================================================== */

export function initMobileMenu() {
  const toggle = document.getElementById('mobile-menu');
  const navList = document.getElementById('nav-list');

  if (!toggle || !navList) return;

  const closeMenu = () => {
    navList.classList.remove('open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open');
  };

  toggle.addEventListener('click', () => {
    const isOpen = navList.classList.toggle('open');
    toggle.classList.toggle('is-active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('menu-open', isOpen);
  });

  document.addEventListener('click', (e) => {
    if (!navList.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  navList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });

  window.addEventListener(
    'scroll',
    () => {
      if (navList.classList.contains('open')) closeMenu();
    },
    { passive: true }
  );
}
