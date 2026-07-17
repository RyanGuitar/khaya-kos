import test from "node:test";
import assert from "node:assert/strict";

import { patchStock, renderCategory, renderMarketSection } from "../public/js/admin/renderer.js";

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
  const decrementButton = { disabled: false };
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
      if (selector === '[data-action="stock-minus"]') return decrementButton;
      if (selector === ".card-img-wrap") return imageWrap;
      if (selector === ".sold-out-stamp") return stamp;
      return null;
    },
  };

  return { card, badge, input, decrementButton, getStamp: () => stamp };
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
    assert.equal(fixture.decrementButton.disabled, true);
    assert.equal(fixture.card.classList.contains("is-sold-out"), false);
    assert.equal(fixture.getStamp(), null);
  } finally {
    restoreDocument();
  }
});

test("the owner stock decrement re-enables immediately after restocking", () => {
  const fixture = createMarketCard();
  const restoreDocument = useFakeDocument(fixture.card);

  try {
    patchStock("last-pie", 0, true);
    assert.equal(fixture.decrementButton.disabled, true);

    patchStock("last-pie", 1, true);
    assert.equal(fixture.decrementButton.disabled, false);
  } finally {
    restoreDocument();
  }
});

function createMarketPageFixture() {
  const section = { classList: createClassList() };
  const container = {
    innerHTML: "",
    closest: () => section,
  };
  const label = { textContent: "" };
  const detail = { textContent: "" };
  const kicker = { textContent: "" };
  const heroStatus = {
    classList: createClassList(),
    querySelector(selector) {
      if (selector === ".status-kicker") return kicker;
      if (selector === ".status-label") return label;
      if (selector === ".status-detail") return detail;
      return null;
    },
  };
  const navLink = {
    classList: createClassList(),
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  const mapReturn = { hidden: true };

  return { section, container, heroStatus, navLink, mapReturn, kicker, label, detail };
}

function useFakeMarketDocument(fixture) {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.document = {
    getElementById(id) {
      if (id === "market-content") return fixture.container;
      if (id === "hero-market-status") return fixture.heroStatus;
      if (id === "market-nav-link") return fixture.navLink;
      if (id === "map-market-return") return fixture.mapReturn;
      return null;
    },
  };
  globalThis.localStorage = { getItem: () => null };

  return () => {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
  };
}

function marketCategory(isOpen) {
  return {
    id: "market",
    eyebrow: "Gazebo Valley · Saturdays",
    title: "Live at the Market",
    subtitle: "Current Saturday stall stock.",
    isOpen,
    items: [
      {
        id: "market-pie",
        name: "Chicken Pie",
        description: "Chicken and mushroom",
        price: 28,
        image: "/images/pies.svg",
        ribbon: "brown",
        stock: 3,
      },
    ],
  };
}

test("closed market hides the repeated visitor section and keeps hero status cues", () => {
  const fixture = createMarketPageFixture();
  const restoreDocument = useFakeMarketDocument(fixture);

  try {
    renderMarketSection(marketCategory(false), false);

    assert.equal(fixture.container.innerHTML, "");
    assert.equal(fixture.section.hidden, true);
    assert.equal(fixture.section.classList.contains("is-closed"), true);
    assert.equal(fixture.section.classList.contains("is-live"), false);
    assert.equal(fixture.heroStatus.classList.contains("is-live"), false);
    assert.equal(fixture.heroStatus.hidden, false);
    assert.equal(fixture.mapReturn.hidden, true);
    assert.equal(fixture.kicker.textContent, "Gazebo Valley · Closed");
    assert.equal(fixture.label.textContent, "Live stock updates appear here every Saturday");
    assert.equal(
      fixture.detail.textContent,
      "When the stall opens, you’ll see today’s selection and remaining stock update in real time."
    );
  } finally {
    restoreDocument();
  }
});

test("open market exposes stock and live status cues", () => {
  const fixture = createMarketPageFixture();
  const restoreDocument = useFakeMarketDocument(fixture);

  try {
    renderMarketSection(marketCategory(true), false);

    assert.match(fixture.container.innerHTML, /market-grid/);
    assert.match(fixture.container.innerHTML, /3 left/);
    const marketDescriptionIndex = fixture.container.innerHTML.indexOf("Chicken and mushroom");
    const marketMetaIndex = fixture.container.innerHTML.indexOf('class="card-footer-row market-card-meta"');
    const marketPriceIndex = fixture.container.innerHTML.indexOf('class="price-tag"');
    const marketStockIndex = fixture.container.innerHTML.indexOf('class="stock-badge');
    assert.ok(marketDescriptionIndex < marketMetaIndex);
    assert.ok(marketMetaIndex < marketPriceIndex);
    assert.ok(marketPriceIndex < marketStockIndex);
    assert.match(fixture.container.innerHTML, /Today’s stall selection updates in real time as items sell/);
    assert.match(fixture.container.innerHTML, /<strong>Open now<\/strong>/);
    assert.match(fixture.container.innerHTML, /href="#find-us"/);
    assert.match(fixture.container.innerHTML, /View map and directions/);
    assert.doesNotMatch(fixture.container.innerHTML, /market-title-live/);
    assert.equal(fixture.section.classList.contains("is-live"), true);
    assert.equal(fixture.section.classList.contains("is-closed"), false);
    assert.equal(fixture.section.hidden, false);
    assert.equal(fixture.heroStatus.classList.contains("is-live"), true);
    assert.equal(fixture.heroStatus.hidden, true);
    assert.equal(fixture.mapReturn.hidden, false);
    assert.equal(fixture.navLink.classList.contains("is-live"), true);
    assert.equal(
      fixture.navLink.attributes["aria-label"],
      "Live at the Market — open now, see current stock"
    );
    assert.equal(fixture.kicker.textContent, "Open now");
    assert.equal(fixture.label.textContent, "Gazebo Valley stall is open");
    assert.equal(fixture.detail.textContent, "See today’s selection and remaining stock");
  } finally {
    restoreDocument();
  }
});

function weeklyMenu(itemCount = 7) {
  return {
    id: "menu",
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `item-${index + 1}`,
      name: `Item ${index + 1}`,
      description: "Made fresh to order",
      price: 10 + index,
      image: "/images/placeholder.svg",
      ribbon: "navy",
      likes: 0,
    })),
  };
}

function createMenuContainer() {
  return {
    classList: createClassList(),
    dataset: {},
    innerHTML: "",
  };
}

test("public weekly menu renders every product with collapsed disclosure", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  const container = createMenuContainer();

  try {
    renderCategory(weeklyMenu(7), container, false);

    assert.equal(container.classList.contains("weekly-menu-grid"), true);
    assert.equal(container.classList.contains("is-collapsed"), true);
    assert.match(container.innerHTML, /See all 7 menu items/);
    assert.match(container.innerHTML, /aria-expanded="false"/);
    assert.equal((container.innerHTML.match(/class="menu-card revealed"/g) || []).length, 7);

    container.dataset.expanded = "true";
    renderCategory(weeklyMenu(7), container, false);
    assert.equal(container.classList.contains("is-expanded"), true);
    assert.equal(container.classList.contains("is-collapsed"), false);
    assert.match(container.innerHTML, /Show fewer/);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("owner and short weekly menus do not use progressive disclosure", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  const ownerContainer = createMenuContainer();
  const shortContainer = createMenuContainer();

  try {
    renderCategory(weeklyMenu(7), ownerContainer, true);
    assert.doesNotMatch(ownerContainer.innerHTML, /toggle-weekly-menu/);
    assert.equal(ownerContainer.classList.contains("weekly-menu-grid"), false);

    renderCategory(weeklyMenu(4), shortContainer, false);
    assert.doesNotMatch(shortContainer.innerHTML, /toggle-weekly-menu/);
    assert.equal(shortContainer.classList.contains("weekly-menu-grid"), false);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("owner product controls have visible labels and descriptive button names", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  const container = createMenuContainer();

  try {
    renderCategory(weeklyMenu(1), container, true);

    assert.match(container.innerHTML, /<label class="admin-field-label" for="name-item-1">Product name<\/label>/);
    assert.match(container.innerHTML, /<label class="admin-field-label" for="price-item-1">Price \(rand\)<\/label>/);
    assert.match(container.innerHTML, /<label class="admin-field-label" for="description-item-1">Description<\/label>/);
    assert.match(container.innerHTML, /<span class="sr-only">Delete Item 1<\/span>/);
    assert.doesNotMatch(container.innerHTML, /card-cta|Order on WhatsApp/);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("visitor cards balance price and live likes after the description", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  const container = createMenuContainer();

  try {
    renderCategory(weeklyMenu(1), container, false);

    const descriptionIndex = container.innerHTML.indexOf("Description 1");
    const footerIndex = container.innerHTML.indexOf('class="card-footer-row"');
    const priceIndex = container.innerHTML.indexOf('class="price-tag"');
    const likeIndex = container.innerHTML.indexOf('data-action="like"');
    assert.ok(descriptionIndex < footerIndex);
    assert.ok(footerIndex < priceIndex);
    assert.ok(priceIndex < likeIndex);
    assert.doesNotMatch(container.innerHTML, /Item 1 ♡/);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }
});

test("market stock controls expose an associated label and product-specific actions", () => {
  const fixture = createMarketPageFixture();
  const restoreDocument = useFakeMarketDocument(fixture);

  try {
    renderMarketSection(marketCategory(false), true);

    assert.equal(fixture.section.hidden, false);
    assert.match(fixture.container.innerHTML, /class="owner-section-toolbar market-owner-toolbar"/);
    assert.match(fixture.container.innerHTML, /Market closed/);
    assert.match(fixture.container.innerHTML, /Tap to open/);
    assert.match(fixture.container.innerHTML, /data-action="jump-to-add"/);
    assert.match(fixture.container.innerHTML, />Add new item<\/button>/);
    assert.doesNotMatch(fixture.container.innerHTML, /market-live-banner|Gazebo Valley · Saturdays/);
    assert.match(fixture.container.innerHTML, /<label class="admin-field-label" for="stock-market-pie">Stock available<\/label>/);
    assert.match(fixture.container.innerHTML, /Record one Chicken Pie sold/);
    assert.match(fixture.container.innerHTML, /Add one Chicken Pie back/);
  } finally {
    restoreDocument();
  }
});

test("optional sections stay available to owners but hide from visitors", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  const sectionHeader = { hidden: false };
  const section = {
    hidden: false,
    classList: createClassList(),
    querySelector: (selector) => selector === ".section-header" ? sectionHeader : null,
  };
  const controls = { hidden: true, innerHTML: "" };
  const navLink = { hidden: false };
  const container = createMenuContainer();
  const extras = {
    ...weeklyMenu(1),
    id: "extras",
    title: "Clothing, Socks & Scarves",
    isVisible: false,
  };

  globalThis.localStorage = { getItem: () => null };
  globalThis.document = {
    getElementById(id) {
      if (id === "extras") return section;
      if (id === "extras-owner-controls") return controls;
      if (id === "extras-nav-link") return navLink;
      return null;
    },
  };

  try {
    renderCategory(extras, container, false);
    assert.equal(section.hidden, true);
    assert.equal(navLink.hidden, true);
    assert.equal(container.innerHTML, "");

    renderCategory(extras, container, true);
    assert.equal(section.hidden, false);
    assert.equal(sectionHeader.hidden, true);
    assert.equal(controls.hidden, false);
    assert.match(controls.innerHTML, /Draft — hidden from visitors/);
    assert.match(controls.innerHTML, /Publish section/);
    assert.match(controls.innerHTML, /Add new item/);
    assert.match(controls.innerHTML, /data-field="category-eyebrow"/);
    assert.match(controls.innerHTML, /data-field="category-title"/);
    assert.match(controls.innerHTML, /data-field="category-subtitle"/);
    assert.match(controls.innerHTML, /Small heading/);
    assert.match(controls.innerHTML, /Main heading/);
    assert.match(controls.innerHTML, /Description/);
    assert.match(container.innerHTML, /data-action="return-to-section"/);
    assert.doesNotMatch(controls.innerHTML, /[↑↓→]/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
  }
});

test("the full menu owner header uses the same compact add-item workflow", () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  const sectionHeader = { hidden: false };
  const section = {
    hidden: false,
    classList: createClassList(),
    querySelector: (selector) => selector === ".section-header" ? sectionHeader : null,
  };
  const controls = { hidden: true, innerHTML: "" };
  const container = createMenuContainer();
  const menu = { ...weeklyMenu(1), title: "The Full Menu" };

  globalThis.localStorage = { getItem: () => null };
  globalThis.document = {
    getElementById(id) {
      if (id === "menu") return section;
      if (id === "menu-owner-controls") return controls;
      return null;
    },
  };

  try {
    renderCategory(menu, container, true);
    assert.equal(sectionHeader.hidden, true);
    assert.equal(controls.hidden, false);
    assert.match(controls.innerHTML, /The Full Menu/);
    assert.match(controls.innerHTML, /data-action="jump-to-add"/);
    assert.match(container.innerHTML, /data-action="return-to-section"/);
    assert.doesNotMatch(controls.innerHTML, /toggle-section-visibility|[↑↓→]/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousLocalStorage;
  }
});
