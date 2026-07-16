/* =====================================================
   Khaya Kos — Main Entry (ES Module)
   Imports and initialises every site behaviour, including
   the live product-editing engine.
   Loaded via <script type="module" src="js/main.js">.
   ===================================================== */

import { initNavScroll } from './modules/nav.js';
import { initMobileMenu } from './modules/mobileMenu.js';
import { initScrollReveal } from './modules/scrollReveal.js';
import { initLazyMap } from './modules/lazyMap.js';
import { initOwnerButtonScroll } from './modules/ownerButtonScroll.js';
import { engine } from './admin/engine.js?v=3.12';

function init() {
  initNavScroll();
  initMobileMenu();
  initLazyMap();
  initOwnerButtonScroll();
  engine.start();     // renders product cards into the DOM first...
  initScrollReveal(); // ...so the reveal observer has cards to watch
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
