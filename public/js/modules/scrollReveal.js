/* =====================================================
   Khaya Kos — Scroll Reveal Module
   Fades/slides menu cards and off-screen elements into
   view only once they enter the viewport.
   ===================================================== */

export function initScrollReveal() {
  const cards = document.querySelectorAll('.menu-card');
  if (!cards.length) return;

  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = [...cards].indexOf(entry.target) % 6 * 70;
          setTimeout(() => entry.target.classList.add('revealed'), delay);
          cardObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  cards.forEach((el) => cardObserver.observe(el));
}
