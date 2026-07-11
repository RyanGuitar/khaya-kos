/* =====================================================
   Khaya Kos â€” Owner Button Scroll Module
   Starts icon-only so it never overlaps the hero's CTA
   buttons, then grows into the full pill once the visitor
   scrolls (and shrinks back near the top).
   ===================================================== */

export function initOwnerButtonScroll() {
  const btn = document.getElementById("owner-login-btn");
  if (!btn) return;

  const EXPAND_AFTER = 60; // px scrolled before it grows

  window.addEventListener(
    "scroll",
    () => {
      btn.classList.toggle("expanded", window.scrollY > EXPAND_AFTER);
    },
    { passive: true }
  );
}
