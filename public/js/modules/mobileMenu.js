/* =====================================================
   Khaya Kos — Mobile Menu Module
   Handles the hamburger toggle, outside-click close,
   closing after a link is tapped, and closing automatically
   if the user starts scrolling with the menu open.
   ===================================================== */

export function initMobileMenu() {
  const toggle = document.getElementById('mobile-menu');
  const navList = document.getElementById('nav-list');
  const backdrop = document.getElementById('nav-backdrop');

  if (!toggle || !navList) return;

  const setMenuIsolation = (isolate) => {
    [...document.body.children].forEach((element) => {
      if (
        element === toggle.closest('nav') ||
        element === backdrop ||
        ['SCRIPT', 'STYLE'].includes(element.tagName)
      ) return;

      if (isolate) {
        if (!element.inert) {
          element.inert = true;
          element.dataset.menuInertAdded = 'true';
        }
        if (!element.hasAttribute('aria-hidden')) {
          element.setAttribute('aria-hidden', 'true');
          element.dataset.menuAriaHiddenAdded = 'true';
        }
        return;
      }

      if (element.dataset.menuInertAdded === 'true') {
        element.inert = false;
        delete element.dataset.menuInertAdded;
      }
      if (element.dataset.menuAriaHiddenAdded === 'true') {
        element.removeAttribute('aria-hidden');
        delete element.dataset.menuAriaHiddenAdded;
      }
    });
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    const focusWasInMenu = navList.contains(document.activeElement);
    navList.classList.remove('open');
    toggle.classList.remove('is-active');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
    document.body.classList.remove('menu-open');
    backdrop?.classList.remove('open');
    setMenuIsolation(false);
    if (restoreFocus && focusWasInMenu) toggle.focus();
  };

  const focusLinkTarget = (link) => {
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('#') || href.length < 2) return;
    const section = document.getElementById(decodeURIComponent(href.slice(1)));
    const target = section?.querySelector('h1, h2') || section;
    if (!target) return;
    const addedTabIndex = !target.hasAttribute('tabindex');
    if (addedTabIndex) target.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      if (addedTabIndex) {
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
    });
  };

  toggle.addEventListener('click', () => {
    const isOpen = navList.classList.toggle('open');
    toggle.classList.toggle('is-active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    document.body.classList.toggle('menu-open', isOpen);
    backdrop?.classList.toggle('open', isOpen);
    setMenuIsolation(isOpen);
  });

  backdrop?.addEventListener('click', () => closeMenu({ restoreFocus: true }));

  document.addEventListener('click', (e) => {
    if (!navList.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  navList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      const isPageTarget = (link.getAttribute('href') || '').startsWith('#');
      closeMenu({ restoreFocus: !isPageTarget });
      if (isPageTarget) focusLinkTarget(link);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (!navList.classList.contains('open')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key !== 'Tab') return;
    const links = [...navList.querySelectorAll('a:not([hidden])')];
    const first = toggle;
    const last = links.at(-1) || toggle;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener('resize', () => {
    const isDesktop = window.matchMedia('(min-width: 1100px)').matches;
    if (isDesktop) {
      const toggleHadFocus = document.activeElement === toggle;
      closeMenu();
      if (toggleHadFocus) document.querySelector('#main-nav .logo')?.focus();
    } else if (!navList.classList.contains('open') && navList.contains(document.activeElement)) {
      toggle.focus();
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      if (navList.classList.contains('open')) closeMenu({ restoreFocus: true });
    },
    { passive: true }
  );
}
