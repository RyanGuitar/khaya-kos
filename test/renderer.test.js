import test from "node:test";
import assert from "node:assert/strict";

import { patchStock } from "../public/js/admin/renderer.js";

function createClassList(initial = []) {
  const classes = new Set(initial);
  return {
    contains(name) {
      return classes.has(name);
    },
    toggle(name, force) {
      const shouldAdd = force === undefined ? !classes.has(name) : force;
      if (shouldAdd) classes.add(name);
      else classes.delete(name);
      return shouldAdd;
    },
  };
}

function createMarketCard() {
  const badge = { textContent: "1 left", classList: createClassList() };
  const input = { value: "1" };
  let stamp = null;

  const imageWrap = {
    appendChild(element) {
      stamp = element;
      element.remove = () => {
        stamp = null;
      };
    },
  };

  const card = {
    classList: createClassList(),
    querySelector(selector) {
      if (selector === ".stock-badge") return badge;
      if (selector === ".stock-input") return input;
      if (selector === ".card-img-wrap") return imageWrap;
      if (selector === ".sold-out-stamp") return stamp;
      return null;
    },
  };

  return { card, badge, input, getStamp: () => stamp };
}

function useFakeDocument(card) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    querySelector: () => card,
    createElement: () => ({ className: "", innerHTML: "" }),
  };
  return () => {
    globalThis.document = previousDocument;
  };
}

test("deferred zero leaves every visitor sold-out treatment unchanged", () => {
  const fixture = createMarketCard();
  const restoreDocument = useFakeDocument(fixture.card);

  try {
    patchStock("last-pie", 0, false, { deferSoldOut: true });

    assert.equal(fixture.badge.textContent, "1 left");
    assert.equal(fixture.badge.classList.contains("stock-out"), false);
    assert.equal(fixture.card.classList.contains("is-sold-out"), false);
    assert.equal(fixture.getStamp(), null);
  } finally {
    restoreDocument();
  }
});

test("finalized zero applies the badge, dimming class, and stamp", () => {
  const fixture = createMarketCard();
  const restoreDocument = useFakeDocument(fixture.card);

  try {
    patchStock("last-pie", 0, false);

    assert.equal(fixture.badge.textContent, "Sold out");
    assert.equal(fixture.badge.classList.contains("stock-out"), true);
    assert.equal(fixture.card.classList.contains("is-sold-out"), true);
    assert.equal(fixture.getStamp().className, "sold-out-stamp");
    assert.equal(fixture.getStamp().innerHTML, "Sold<br>Out");
  } finally {
    restoreDocument();
  }
});

test("the owner sees zero immediately while sold-out visuals are deferred", () => {
  const fixture = createMarketCard();
  const restoreDocument = useFakeDocument(fixture.card);

  try {
    patchStock("last-pie", 0, true, { deferSoldOut: true });

    assert.equal(fixture.input.value, 0);
    assert.equal(fixture.card.classList.contains("is-sold-out"), false);
    assert.equal(fixture.getStamp(), null);
  } finally {
    restoreDocument();
  }
});
