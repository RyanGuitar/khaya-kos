/* =====================================================
   Khaya Kos — Mobile Menu Module
   Handles the hamburger toggle, outside-click close,
   and closing the menu after a link is tapped.
   ===================================================== */

export function initMobileMenu() {
  const toggle = document.getElementById('mobile-menu');
  const navList = document.getElementById('nav-list');

  if (!toggle || !navList) return;

  const closeMenu = () => {
    navList.classList.remove('open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const isOpen = navList.classList.toggle('open');
    toggle.classList.toggle('is-active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  document.addEventListener('click', (e) => {
    if (!navList.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  navList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMenu);
  });
}
