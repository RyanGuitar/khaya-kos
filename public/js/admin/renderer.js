// js/admin/renderer.js
// Rebuilds the #menu-grid / #extras-grid containers from store state.
// Re-run on every state change (full-state, product-update/add/remove).

import { shouldShowMarketItems } from "./marketLogic.js";

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(price) {
  return price > 0 ? `R${price}` : "Ask in-store";
}

function fieldId(field, itemId) {
  return `${field}-${String(itemId).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

const LIKED_ITEMS_KEY = "khayaKosLikedItems";

function getLikedItems() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_ITEMS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function buildLikeButton(categoryId, item, isAdmin) {
  const isLiked = getLikedItems().has(item.id);
  if (isAdmin) {
    // Owners shouldn't be able to like their own items — shown as an
    // informational, non-interactive count instead of a real button.
    return `
      <span class="like-btn is-disabled" aria-hidden="true">
        <span class="like-icon">♡</span>
        <span class="like-count">${item.likes || 0}</span>
      </span>
    `;
  }
  return `
    <button type="button" class="like-btn ${isLiked ? "is-liked" : ""}" data-action="like"
      data-category="${categoryId}" data-item="${item.id}" data-name="${escapeHtml(item.name)}"
      aria-pressed="${isLiked}">
      <span class="like-icon" aria-hidden="true">${isLiked ? "❤" : "♡"}</span>
      <span class="like-count" aria-hidden="true">${item.likes || 0}</span>
      <span class="sr-only">${isLiked ? "Unlike" : "Like"} ${escapeHtml(item.name)}</span>
    </button>
  `;
}

function buildNameField(categoryId, item) {
  const id = fieldId("name", item.id);
  return `
    <div class="admin-field">
      <label class="admin-field-label" for="${id}">Product name</label>
      <input id="${id}" type="text" class="name-input" data-field="name"
        data-category="${categoryId}" data-item="${item.id}"
        placeholder="Product name" value="${escapeHtml(item.name)}">
    </div>
  `;
}

function buildPriceField(categoryId, item) {
  const id = fieldId("price", item.id);
  return `
    <div class="admin-field admin-price-field">
      <label class="admin-field-label" for="${id}">Price (rand)</label>
      <input id="${id}" type="number" min="0" step="1" class="price-input" data-field="price"
        data-category="${categoryId}" data-item="${item.id}" value="${item.price}">
    </div>
  `;
}

function buildDescriptionField(categoryId, item, rows) {
  const id = fieldId("description", item.id);
  return `
    <div class="admin-field">
      <label class="admin-field-label" for="${id}">Description</label>
      <textarea id="${id}" class="card-description-input" data-field="description"
        data-category="${categoryId}" data-item="${item.id}" rows="${rows}">${escapeHtml(item.description)}</textarea>
    </div>
  `;
}

function buildCard(categoryId, item, isAdmin) {
  const ribbonClass = `rib-${item.ribbon || "navy"}`;

  const priceMarkup = isAdmin
    ? buildPriceField(categoryId, item)
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const nameFieldMarkup = isAdmin ? buildNameField(categoryId, item) : "";

  const descriptionMarkup = isAdmin
    ? buildDescriptionField(categoryId, item, 3)
    : `<ul>${item.description
        .split("\n")
        .filter(Boolean)
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`;

  const adminControls = isAdmin
    ? `<button type="button" class="admin-delete-btn" data-action="delete"
         data-category="${categoryId}" data-item="${item.id}">
         <span aria-hidden="true">✕</span><span class="sr-only">Delete ${escapeHtml(item.name)}</span>
       </button>
       <button type="button" class="admin-photo-overlay" data-action="change-photo"
         data-category="${categoryId}" data-item="${item.id}">📷 Change photo</button>`
    : "";

  // The ribbon is a read-only live preview of the name now — it's layered
  // over the photo overlay in admin mode, so making it independently
  // clickable there caused clicks meant for it to land on "change photo"
  // instead. Editing happens through the clearly-labelled field below.
  const nameMarkup = `<h3 class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)}</h3>`;

  return `
    <div class="menu-card revealed" data-item-id="${item.id}">
      <div class="card-img-wrap">
        ${nameMarkup}
        <img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" width="400" height="300">
        ${adminControls}
      </div>
      <div class="card-body">
        ${isAdmin ? priceMarkup : ""}
        ${nameFieldMarkup}
        ${descriptionMarkup}
        <div class="card-footer-row">
          ${isAdmin ? "" : priceMarkup}
          ${buildLikeButton(categoryId, item, isAdmin)}
        </div>
      </div>
    </div>
  `;
}

function buildAddCard(categoryId) {
  return `
    <button type="button" class="add-item-card" id="add-item-${categoryId}"
      data-action="add" data-category="${categoryId}">
      <span>➕<br>Add Item</span>
    </button>
  `;
}

function buildSectionReturnButton(categoryId) {
  return `
    <div class="owner-section-return">
      <button type="button" class="owner-return-btn" data-action="return-to-section"
        data-category="${categoryId}">Back to section top</button>
    </div>
  `;
}

function isOptionalCategory(category) {
  return category?.id === "extras";
}

function buildOwnerJumpButton(categoryId) {
  return `
    <button type="button" class="owner-jump-btn" data-action="jump-to-add"
      data-category="${categoryId}">Add new item</button>
  `;
}

function buildVisibilityToggle(category) {
  const isVisible = category.isVisible !== false;
  return `
    <button type="button" class="owner-state-btn ${isVisible ? "is-on" : "is-off"}"
      data-action="toggle-section-visibility" data-category="${category.id}"
      aria-pressed="${isVisible}">
      <span class="owner-state-line"><span class="owner-state-dot" aria-hidden="true"></span>
        ${isVisible ? "Published — visible to visitors" : "Draft — hidden from visitors"}</span>
      <span class="owner-state-action">${isVisible ? "Hide section" : "Publish section"}</span>
    </button>
  `;
}

function buildCategoryTextField(category, field, label, { multiline = false, maxlength = 80 } = {}) {
  const id = fieldId(`section-${field}`, category.id);
  const value = escapeHtml(category[field] || "");
  const control = multiline
    ? `<textarea id="${id}" rows="4" maxlength="${maxlength}"
        data-field="category-${field}" data-category="${category.id}">${value}</textarea>`
    : `<input id="${id}" type="text" value="${value}" maxlength="${maxlength}"
        data-field="category-${field}" data-category="${category.id}">`;
  return `
    <div class="owner-section-name-field">
      <label for="${id}">${label}</label>
      ${control}
    </div>
  `;
}

function buildCategoryCopyFields(category) {
  return `
    <div class="owner-section-copy-fields">
      ${buildCategoryTextField(category, "eyebrow", "Small heading")}
      ${buildCategoryTextField(category, "title", "Main heading")}
      ${buildCategoryTextField(category, "subtitle", "Description", { multiline: true, maxlength: 320 })}
    </div>
  `;
}

function buildOwnerSectionToolbar(category) {
  const optional = isOptionalCategory(category);
  const visibilityToggle = optional ? buildVisibilityToggle(category) : "";
  const title = optional
    ? buildCategoryCopyFields(category)
    : `<h2 class="owner-section-title">${escapeHtml(category.title)}</h2>`;
  return `
    ${title}
    <div class="owner-section-actions">
      ${visibilityToggle}
      ${buildOwnerJumpButton(category.id)}
    </div>
  `;
}

function ensureStandardSection(category) {
  if (typeof document === "undefined") return null;
  return document.getElementById(category.id);
}

function updateStandardSection(category, isAdmin) {
  if (typeof document === "undefined") return true;

  const section = ensureStandardSection(category);
  const isVisible = !isOptionalCategory(category) || category.isVisible !== false;
  if (section) {
    section.hidden = !isAdmin && !isVisible;
    section.classList.toggle("owner-view", isAdmin);
    const publicHeader = section.querySelector(".section-header");
    if (publicHeader) {
      publicHeader.hidden = isAdmin;
      const eyebrow = publicHeader.querySelector?.(".section-eyebrow");
      const title = publicHeader.querySelector?.(".section-title");
      const subtitle = publicHeader.querySelector?.(".section-subtitle");
      if (eyebrow) eyebrow.textContent = category.eyebrow || "Also available";
      if (title) title.textContent = category.title;
      if (subtitle) subtitle.textContent = category.subtitle || "A changing selection of items from Khaya Kos.";
    }
  }

  const controls = document.getElementById(`${category.id}-owner-controls`);
  if (controls) {
    controls.hidden = !isAdmin;
    controls.innerHTML = isAdmin ? buildOwnerSectionToolbar(category) : "";
  }

  if (category.id === "extras") {
    const navLink = document.getElementById("extras-nav-link");
    if (navLink) navLink.hidden = !isAdmin && !isVisible;
  }

  return isAdmin || isVisible;
}

function buildMenuDisclosure(totalItems, isExpanded) {
  return `
    <div class="menu-disclosure-row">
      <button type="button" class="menu-disclosure-btn" data-action="toggle-weekly-menu"
        data-category="menu" data-total="${totalItems}" aria-controls="menu-grid"
        aria-expanded="${isExpanded}">
        ${isExpanded ? "Show fewer" : `See all ${totalItems} menu items`}
      </button>
    </div>
  `;
}

export function renderCategory(category, container, isAdmin) {
  if (!container && typeof document !== "undefined") {
    ensureStandardSection(category);
    container = document.getElementById(`${category.id}-grid`);
  }
  if (!container) return;
  const showSection = updateStandardSection(category, isAdmin);
  if (!showSection) {
    container.innerHTML = "";
    return;
  }
  const hasDisclosure = category.id === "menu" && !isAdmin && category.items.length > 4;
  const isExpanded = hasDisclosure && container.dataset.expanded === "true";

  container.classList.toggle("weekly-menu-grid", hasDisclosure);
  container.classList.toggle("is-collapsed", hasDisclosure && !isExpanded);
  container.classList.toggle("is-expanded", hasDisclosure && isExpanded);
  container.classList.toggle("has-six-or-fewer", hasDisclosure && category.items.length <= 6);

  const cards = category.items.map((item) => buildCard(category.id, item, isAdmin)).join("");
  const addCard = isAdmin ? buildAddCard(category.id) + buildSectionReturnButton(category.id) : "";
  const disclosure = hasDisclosure ? buildMenuDisclosure(category.items.length, isExpanded) : "";
  container.innerHTML = cards + addCard + disclosure;
}

/* =====================================================
   MARKET SECTION — a live, quantity-tracked subset of
   stock sold in person on Saturdays. Unlike the regular
   menu, this has an open/closed state and no WhatsApp CTA
   (it's first-come-first-served, in person, not orderable
   ahead).
   ===================================================== */

function buildMarketCard(categoryId, item, isAdmin) {
  const ribbonClass = `rib-${item.ribbon || "navy"}`;
  // A brand-new item defaults to stock:null ("not set up yet") — that's
  // deliberately distinct from stock:0 ("sold out"), so a freshly-added
  // item doesn't get stamped SOLD OUT before she's even priced it.
  const hasStock = typeof item.stock === "number";
  const soldOut = hasStock && item.stock <= 0;

  const priceMarkup = isAdmin
    ? buildPriceField(categoryId, item)
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const nameFieldMarkup = isAdmin ? buildNameField(categoryId, item) : "";

  const descriptionMarkup = isAdmin
    ? buildDescriptionField(categoryId, item, 2)
    : `<p class="market-card-desc">${escapeHtml(item.description)}</p>`;

  const stockId = fieldId("stock", item.id);
  const stockMarkup = isAdmin
    ? `<div class="admin-field admin-stock-field">
         <label class="admin-field-label" for="${stockId}">Stock available</label>
         <div class="stock-stepper">
           <button type="button" class="stock-btn" data-action="stock-minus"
             data-category="${categoryId}" data-item="${item.id}">
             <span aria-hidden="true">−</span><span class="sr-only">Record one ${escapeHtml(item.name)} sold</span>
           </button>
           <input id="${stockId}" type="number" min="0" step="1" class="stock-input" data-field="stock"
             data-category="${categoryId}" data-item="${item.id}" value="${item.stock ?? ""}" placeholder="0">
           <button type="button" class="stock-btn" data-action="stock-plus"
             data-category="${categoryId}" data-item="${item.id}">
             <span aria-hidden="true">+</span><span class="sr-only">Add one ${escapeHtml(item.name)} back</span>
           </button>
         </div>
       </div>`
    : `<span class="stock-badge ${soldOut ? "stock-out" : ""}">${
        !hasStock ? "Coming soon" : soldOut ? "Sold out" : `${item.stock} left`
      }</span>`;

  const adminControls = isAdmin
    ? `<button type="button" class="admin-delete-btn" data-action="delete"
         data-category="${categoryId}" data-item="${item.id}">
         <span aria-hidden="true">✕</span><span class="sr-only">Delete ${escapeHtml(item.name)}</span>
       </button>
       <button type="button" class="admin-photo-overlay" data-action="change-photo"
         data-category="${categoryId}" data-item="${item.id}">📷 Change photo</button>`
    : "";

  // Read-only preview — see the comment in buildCard() for why this is no
  // longer contentEditable.
  const nameMarkup = `<h3 class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)}</h3>`;

  const soldOutStamp = soldOut ? `<div class="sold-out-stamp">Sold<br>Out</div>` : "";

  return `
    <div class="menu-card revealed market-card ${soldOut ? "is-sold-out" : ""}" data-item-id="${item.id}">
      <div class="card-img-wrap">
        ${nameMarkup}
        <img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" width="400" height="300">
        ${soldOutStamp}
        ${adminControls}
      </div>
      <div class="card-body">
        ${isAdmin ? priceMarkup : ""}
        ${nameFieldMarkup}
        ${descriptionMarkup}
        ${isAdmin
          ? stockMarkup
          : `<div class="card-footer-row market-card-meta">${priceMarkup}${stockMarkup}</div>`}
      </div>
    </div>
  `;
}

function buildMarketToggle(category) {
  const isOpen = !!category.isOpen;
  return `
    <button type="button" class="owner-state-btn market-toggle-btn ${isOpen ? "is-on" : "is-off"}"
      data-action="toggle-market" data-category="${category.id}" aria-pressed="${isOpen}">
      <span class="owner-state-line"><span class="owner-state-dot" aria-hidden="true"></span>
        Market ${isOpen ? "open" : "closed"}</span>
      <span class="owner-state-action">Tap to ${isOpen ? "close" : "open"}</span>
    </button>
  `;
}

function buildOwnerMarketToolbar(category) {
  return `
    <div class="owner-section-toolbar market-owner-toolbar">
      <h2 class="owner-section-title">Live at the Market</h2>
      <div class="owner-section-actions">
        ${buildMarketToggle(category)}
        ${buildOwnerJumpButton(category.id)}
      </div>
    </div>
  `;
}

function buildMarketBanner(isOpen) {
  if (!isOpen) return "";
  return `
    <a href="#find-us" class="market-live-banner market-route-link"
      aria-label="Market open at Gazebo Valley. View map and directions">
      <span class="live-dot" aria-hidden="true"></span>
      <strong>Open now</strong>
      <span>at Gazebo Valley</span>
      <span class="market-live-divider" aria-hidden="true"></span>
      <span>View map and directions</span>
    </a>
  `;
}

function updateMarketStatus(category) {
  const isOpen = Boolean(category.isOpen);
  const heroStatus = document.getElementById("hero-market-status");
  const navLink = document.getElementById("market-nav-link");
  const mapReturn = document.getElementById("map-market-return");

  if (heroStatus) {
    heroStatus.hidden = isOpen;
    heroStatus.classList.toggle("is-live", isOpen);
    const kicker = heroStatus.querySelector(".status-kicker");
    const label = heroStatus.querySelector(".status-label");
    const detail = heroStatus.querySelector(".status-detail");
    if (kicker) kicker.textContent = isOpen ? "Open now" : "Gazebo Valley · Closed";
    if (label) {
      label.textContent = isOpen
        ? "Gazebo Valley stall is open"
        : "Saturday market availability goes live here";
    }
    if (detail) {
      detail.textContent = isOpen
        ? "See today’s selection and remaining stock"
        : "When the stall opens, you’ll see today’s selection and remaining stock update in real time.";
    }
  }

  if (navLink) {
    navLink.classList.toggle("is-live", isOpen);
    navLink.setAttribute(
      "aria-label",
      isOpen ? "Live at the Market — open now, see current stock" : "Live at the Market"
    );
  }

  if (mapReturn) mapReturn.hidden = !isOpen;
}

export function renderMarketSection(category, isAdmin) {
  const container = document.getElementById("market-content");
  if (!container) return;

  const section = container.closest(".market-section");
  section?.classList.toggle("is-live", Boolean(category.isOpen));
  section?.classList.toggle("is-closed", !category.isOpen);
  section?.classList.toggle("owner-view", isAdmin);
  updateMarketStatus(category);

  // Visitors already have the compact Saturday status in the hero. Keep the
  // larger live-market section out of their way until it is actually open.
  // Owners still see it while closed so they can prepare stock and products.
  const showSection = Boolean(category.isOpen) || isAdmin;
  if (section) section.hidden = !showSection;
  if (!showSection) {
    container.innerHTML = "";
    return;
  }

  const publicHeader = `
    <div class="section-header">
      <p class="section-eyebrow">${escapeHtml(category.eyebrow)}</p>
      <div class="market-title-row">
        <h2 class="section-title">${escapeHtml(category.title)}</h2>
      </div>
      <p class="section-subtitle">${escapeHtml(category.isOpen
        ? "Today’s stall selection updates in real time as items sell. First come, first served."
        : category.subtitle)}</p>
    </div>
  `;

  const header = isAdmin ? buildOwnerMarketToolbar(category) : publicHeader;
  const banner = isAdmin ? "" : buildMarketBanner(category.isOpen);

  // The owner can always see/edit the market list (to set it up before
  // opening); everyone else only sees it once it's actually live.
  const showItems = shouldShowMarketItems(category.isOpen, isAdmin);

  const cards = showItems
    ? category.items.map((item) => buildMarketCard(category.id, item, isAdmin)).join("")
    : "";
  const addCard = showItems && isAdmin
    ? buildAddCard(category.id) + buildSectionReturnButton(category.id)
    : "";
  const body = showItems ? `<div class="menu-grid market-grid">${cards}${addCard}</div>` : "";

  container.innerHTML = `${header}${banner}${body}`;
}

/* =====================================================
   SURGICAL CARD UPDATES
   Rebuilding an entire grid's HTML for a single field
   change (a like, a stock tick) tears down and recreates
   every card's <img> in that section — that's what causes
   the flicker, and it costs a fresh image request each
   time too. This rebuilds just the ONE card that actually
   changed, using the exact same card-building functions,
   and leaves every sibling card's DOM completely untouched.

   Returns true if the patch succeeded, false if the card
   wasn't found in the DOM (caller should fall back to a
   full render — e.g. right after a fresh full-state load).
   ===================================================== */
export function patchCard(state, categoryId, itemId, isAdmin) {
  const category = state.categories.find((c) => c.id === categoryId);
  if (!category) return false;

  const item = category.items.find((i) => i.id === itemId);
  if (!item) return false;

  const existingCard = document.querySelector(`.menu-card[data-item-id="${itemId}"]`);
  if (!existingCard) return false;

  const html = category.id === "market"
    ? buildMarketCard(categoryId, item, isAdmin)
    : buildCard(categoryId, item, isAdmin);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  const newCard = wrapper.firstElementChild;
  if (!newCard) return false;

  existingCard.replaceWith(newCard);
  return true;
}

/* =====================================================
   TRUE FIELD-LEVEL PATCHES
   Even patchCard() above still tears down and recreates the
   <img> and ribbon inside that one card, which is visible as
   a flicker for the two fields that change constantly during
   normal use — likes and market stock. These update only the
   specific DOM nodes that actually changed and touch nothing
   else in the card at all.
   ===================================================== */
export function patchLikeCount(itemId, value, isLiked) {
  const btn = document.querySelector(`.like-btn[data-item="${itemId}"]`);
  if (!btn) return false;

  const countEl = btn.querySelector(".like-count");
  const iconEl = btn.querySelector(".like-icon");
  const labelEl = btn.querySelector(".sr-only");
  if (countEl) countEl.textContent = value;
  if (iconEl) iconEl.textContent = isLiked ? "❤" : "♡";
  if (labelEl) labelEl.textContent = `${isLiked ? "Unlike" : "Like"} ${btn.dataset.name || "this item"}`;
  btn.setAttribute("aria-pressed", String(isLiked));
  btn.classList.toggle("is-liked", isLiked);
  return true;
}

export function patchStock(itemId, value, isAdmin, { deferSoldOut = false } = {}) {
  const card = document.querySelector(`.menu-card[data-item-id="${itemId}"]`);
  if (!card) return false;

  const soldOut = value <= 0;

  if (isAdmin) {
    const input = card.querySelector(".stock-input");
    // Don't stomp on it mid-edit if this happens to be the field the
    // admin is actively typing in right now.
    if (input && document.activeElement !== input) input.value = value;
  }

  // The owner still sees the numeric input reach zero immediately, but no
  // customer-facing sold-out treatment is applied until the correction
  // window has elapsed. This lets an accidental extra tap be corrected
  // without briefly showing a sold-out badge, dimmed card, or stamp.
  if (deferSoldOut && soldOut) return true;

  if (!isAdmin) {
    const badge = card.querySelector(".stock-badge");
    if (badge) {
      badge.textContent = soldOut ? "Sold out" : `${value} left`;
      badge.classList.toggle("stock-out", soldOut);
    }
  }

  card.classList.toggle("is-sold-out", soldOut);

  const imgWrap = card.querySelector(".card-img-wrap");
  const existingStamp = card.querySelector(".sold-out-stamp");
  if (soldOut && !existingStamp && imgWrap) {
    const stamp = document.createElement("div");
    stamp.className = "sold-out-stamp";
    stamp.innerHTML = "Sold<br>Out";
    imgWrap.appendChild(stamp);
  } else if (!soldOut && existingStamp) {
    existingStamp.remove();
  }

  return true;
}

export function renderAll(state, isAdmin) {
  document.body.classList.toggle("admin-mode", isAdmin);
  const editModeLabel = document.getElementById("edit-mode-label");
  const exitButton = document.getElementById("owner-exit-btn");
  if (editModeLabel) editModeLabel.hidden = !isAdmin;
  if (exitButton) exitButton.hidden = !isAdmin;

  state.categories.forEach((category) => {
    if (category.id === "market") {
      renderMarketSection(category, isAdmin);
    } else {
      const container = document.getElementById(`${category.id}-grid`);
      renderCategory(category, container, isAdmin);
    }
  });
}
