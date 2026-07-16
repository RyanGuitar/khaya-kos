import test from "node:test";
import assert from "node:assert/strict";

import {
  initMarketHashGuard,
  isUnavailableMarketHash,
  resolveUnavailableMarketHash,
} from "../public/js/admin/marketRoute.js";

function createFixture({ hash = "#market", reduceMotion = false } = {}) {
  const listeners = new Map();
  const scrollCalls = [];
  const historyCalls = [];
  const target = {
    hidden: false,
    scrollIntoView(options) {
      scrollCalls.push(options);
    },
  };
  const windowObject = {
    location: { hash },
    history: {
      state: { retained: true },
      replaceState(state, title, url) {
        historyCalls.push({ state, title, url });
        windowObject.location.hash = url;
      },
    },
    matchMedia() {
      return { matches: reduceMotion };
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const documentObject = {
    getElementById(id) {
      return id === "hero-market-status" ? target : null;
    },
  };

  return { documentObject, historyCalls, listeners, scrollCalls, target, windowObject };
}

test("only a closed, unavailable market hash needs a fallback", () => {
  assert.equal(isUnavailableMarketHash("#market", false), true);
  assert.equal(isUnavailableMarketHash("#market", true), false);
  assert.equal(isUnavailableMarketHash("#menu", false), false);
});

test("closed #market replaces the invalid entry and uses native responsive scrolling", () => {
  const fixture = createFixture();

  const resolved = resolveUnavailableMarketHash({
    marketAvailable: false,
    windowObject: fixture.windowObject,
    documentObject: fixture.documentObject,
  });

  assert.equal(resolved, true);
  assert.deepEqual(fixture.historyCalls, [{
    state: { retained: true },
    title: "",
    url: "#hero-market-status",
  }]);
  assert.deepEqual(fixture.scrollCalls, [{ behavior: "smooth", block: "start" }]);
});

test("visible market routes and missing fallback targets are left untouched", () => {
  const fixture = createFixture();

  assert.equal(resolveUnavailableMarketHash({
    marketAvailable: true,
    windowObject: fixture.windowObject,
    documentObject: fixture.documentObject,
  }), false);

  fixture.target.hidden = true;
  assert.equal(resolveUnavailableMarketHash({
    marketAvailable: false,
    windowObject: fixture.windowObject,
    documentObject: fixture.documentObject,
  }), false);
  assert.equal(fixture.historyCalls.length, 0);
  assert.equal(fixture.scrollCalls.length, 0);
});

test("the guard handles initial load, hash/history navigation, and live closure", () => {
  const fixture = createFixture({ hash: "#menu", reduceMotion: true });
  let marketAvailable = false;
  const guard = initMarketHashGuard({
    getMarketAvailable: () => marketAvailable,
    windowObject: fixture.windowObject,
    documentObject: fixture.documentObject,
  });

  assert.equal(fixture.historyCalls.length, 0);
  assert.ok(fixture.listeners.has("hashchange"));
  assert.ok(fixture.listeners.has("popstate"));

  fixture.windowObject.location.hash = "#market";
  fixture.listeners.get("hashchange")();
  assert.equal(fixture.historyCalls.length, 1);
  assert.deepEqual(fixture.scrollCalls.at(-1), { behavior: "auto", block: "start" });

  marketAvailable = true;
  fixture.windowObject.location.hash = "#market";
  fixture.listeners.get("popstate")();
  assert.equal(fixture.historyCalls.length, 1);

  marketAvailable = false;
  guard.reconcile();
  assert.equal(fixture.historyCalls.length, 2);
  assert.equal(fixture.historyCalls.at(-1).url, "#hero-market-status");

  guard.destroy();
  assert.equal(fixture.listeners.size, 0);
});
