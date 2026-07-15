import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { __INITIAL_STATE__: { categories: [] } };
const { store } = await import("../public/js/admin/store.js");

function freshState() {
  return {
    categories: [
      {
        id: "menu",
        items: [
          { id: "pie", name: "Pie", price: 20 },
          { id: "scone", name: "Scone", price: 15 },
        ],
      },
      {
        id: "market",
        isOpen: false,
        items: [{ id: "market-pie", name: "Market Pie", stock: 3 }],
      },
      {
        id: "extras",
        isVisible: true,
        items: [{ id: "scarf", name: "Scarf", price: 60 }],
      },
    ],
  };
}

test.beforeEach(() => {
  store.replaceState(freshState());
});

test("updates only the requested product field", () => {
  store.applyUpdate("menu", "pie", "price", 25);

  assert.equal(store.getItem("menu", "pie").price, 25);
  assert.equal(store.getItem("menu", "scone").price, 15);
  assert.equal(store.getItem("market", "market-pie").stock, 3);
});

test("adds and removes products in the requested category", () => {
  store.applyAdd("menu", { id: "muffin", name: "Muffin", price: 18 });
  assert.equal(store.getItem("menu", "muffin").name, "Muffin");
  assert.equal(store.getCategory("menu").items.length, 3);

  store.applyRemove("menu", "pie");
  assert.equal(store.getItem("menu", "pie"), null);
  assert.equal(store.getCategory("menu").items.length, 2);
  assert.equal(store.getCategory("market").items.length, 1);
});

test("updates the market open state without replacing its products", () => {
  const marketItem = store.getItem("market", "market-pie");

  store.applyCategoryToggle("market", true);
  assert.equal(store.getCategory("market").isOpen, true);
  assert.equal(store.getItem("market", "market-pie"), marketItem);

  store.applyCategoryToggle("market", false);
  assert.equal(store.getCategory("market").isOpen, false);
});

test("updates optional section visibility without replacing its products", () => {
  const extrasItem = store.getItem("extras", "scarf");

  store.applyCategoryVisibility("extras", false);
  assert.equal(store.getCategory("extras").isVisible, false);
  assert.equal(store.getItem("extras", "scarf"), extrasItem);

  store.applyCategoryVisibility("extras", true);
  assert.equal(store.getCategory("extras").isVisible, true);
});
