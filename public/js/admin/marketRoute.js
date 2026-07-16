const CLOSED_MARKET_TARGET_ID = "hero-market-status";

export function isUnavailableMarketHash(hash, marketAvailable) {
  return !marketAvailable && hash === "#market";
}

export function resolveUnavailableMarketHash({
  marketAvailable,
  windowObject = window,
  documentObject = document,
} = {}) {
  if (!isUnavailableMarketHash(windowObject.location.hash, marketAvailable)) return false;

  const target = documentObject.getElementById(CLOSED_MARKET_TARGET_ID);
  if (!target || target.hidden) return false;

  // Replace the unusable history entry before scrolling so Back/Forward
  // cannot return visitors to the hidden market section.
  windowObject.history.replaceState(
    windowObject.history.state,
    "",
    `#${CLOSED_MARKET_TARGET_ID}`
  );

  const reduceMotion = windowObject
    .matchMedia?.("(prefers-reduced-motion: reduce)")
    .matches;
  target.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  return true;
}

export function initMarketHashGuard({
  getMarketAvailable,
  windowObject = window,
  documentObject = document,
} = {}) {
  const reconcile = () => resolveUnavailableMarketHash({
    marketAvailable: Boolean(getMarketAvailable?.()),
    windowObject,
    documentObject,
  });

  windowObject.addEventListener("hashchange", reconcile);
  windowObject.addEventListener("popstate", reconcile);
  reconcile();

  return {
    reconcile,
    destroy() {
      windowObject.removeEventListener("hashchange", reconcile);
      windowObject.removeEventListener("popstate", reconcile);
    },
  };
}
