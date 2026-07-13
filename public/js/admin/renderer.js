// js/admin/renderer.js
// Rebuilds the #menu-grid / #extras-grid containers from store state.
// Re-run on every state change (full-state, product-update/add/remove).

const WHATSAPP_NUMBER = "27726785972";

function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function waLink(itemName) {
  const text = encodeURIComponent(`Hi Khaya Kos! I'd like to order ${itemName}.`);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

function formatPrice(price) {
  return price > 0 ? `R${price}` : "Ask in-store";
}

const LIKED_ITEMS_KEY = "khayaKosLikedItems";

function getLikedItems() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_ITEMS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function buildLikeButton(categoryId, item) {
  const isLiked = getLikedItems().has(item.id);
  return `
    <button type="button" class="like-btn ${isLiked ? "is-liked" : ""}" data-action="like"
      data-category="${categoryId}" data-item="${item.id}" aria-label="Like ${escapeHtml(item.name)}">
      <span class="like-icon">${isLiked ? "❤" : "♡"}</span>
      <span class="like-count">${item.likes || 0}</span>
    </button>
  `;
}

function buildCard(categoryId, item, isAdmin) {
  const ribbonClass = `rib-${item.ribbon || "navy"}`;

  const priceMarkup = isAdmin
    ? `<input type="number" min="0" step="1" class="price-input" data-field="price"
         data-category="${categoryId}" data-item="${item.id}" value="${item.price}">`
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const descriptionMarkup = isAdmin
    ? `<textarea class="card-description-input" data-field="description"
         data-category="${categoryId}" data-item="${item.id}" rows="3"
         style="width:100%;font-family:'Nunito',sans-serif;font-size:0.92rem;color:var(--ink-soft);
         border:2px dashed var(--gold-deep);border-radius:8px;padding:8px 10px;margin-bottom:14px;
         background:var(--cream);resize:vertical;">${escapeHtml(item.description)}</textarea>`
    : `<ul>${item.description
        .split("\n")
        .filter(Boolean)
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("")}</ul>`;

  const adminControls = isAdmin
    ? `<button type="button" class="admin-delete-btn" data-action="delete"
         data-category="${categoryId}" data-item="${item.id}" aria-label="Delete this item">✕</button>
       <div class="admin-photo-overlay" data-action="change-photo"
         data-category="${categoryId}" data-item="${item.id}">📷 Change Photo</div>`
    : "";

  const nameMarkup = isAdmin
    ? `<span class="card-ribbon ${ribbonClass}" contenteditable="true" data-editable
         data-field="name" data-category="${categoryId}" data-item="${item.id}">${escapeHtml(item.name)} ♡</span>`
    : `<span class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)} ♡</span>`;

  return `
    <div class="menu-card revealed" data-item-id="${item.id}">
      <div class="card-img-wrap">
        ${nameMarkup}
        <img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" width="400" height="300">
        ${adminControls}
      </div>
      <div class="card-body">
        ${priceMarkup}
        ${descriptionMarkup}
        <div class="card-footer-row">
          ${buildLikeButton(categoryId, item)}
          <a href="${waLink(item.name)}" class="card-cta" target="_blank" rel="noopener noreferrer">Order on WhatsApp →</a>
        </div>
      </div>
    </div>
  `;
}

function buildAddCard(categoryId) {
  return `
    <div class="add-item-card" data-action="add" data-category="${categoryId}">
      <span>➕<br>Add Item</span>
    </div>
  `;
}

export function renderCategory(category, container, isAdmin) {
  if (!container) return;
  const cards = category.items.map((item) => buildCard(category.id, item, isAdmin)).join("");
  const addCard = isAdmin ? buildAddCard(category.id) : "";
  container.innerHTML = cards + addCard;
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
  const soldOut = item.stock <= 0;

  const priceMarkup = isAdmin
    ? `<input type="number" min="0" step="1" class="price-input" data-field="price"
         data-category="${categoryId}" data-item="${item.id}" value="${item.price}">`
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const descriptionMarkup = isAdmin
    ? `<textarea class="card-description-input" data-field="description"
         data-category="${categoryId}" data-item="${item.id}" rows="2"
         style="width:100%;font-family:'Nunito',sans-serif;font-size:0.92rem;color:var(--ink-soft);
         border:2px dashed var(--gold-deep);border-radius:8px;padding:8px 10px;margin-bottom:14px;
         background:var(--cream);resize:vertical;">${escapeHtml(item.description)}</textarea>`
    : `<p class="market-card-desc">${escapeHtml(item.description)}</p>`;

  const stockMarkup = isAdmin
    ? `<div class="stock-stepper">
         <button type="button" class="stock-btn" data-action="stock-minus"
           data-category="${categoryId}" data-item="${item.id}" aria-label="One sold">−</button>
         <input type="number" min="0" step="1" class="stock-input" data-field="stock"
           data-category="${categoryId}" data-item="${item.id}" value="${item.stock}">
         <button type="button" class="stock-btn" data-action="stock-plus"
           data-category="${categoryId}" data-item="${item.id}" aria-label="Add one back">+</button>
       </div>`
    : `<span class="stock-badge ${soldOut ? "stock-out" : ""}">${soldOut ? "Sold out" : `${item.stock} left`}</span>`;

  const adminControls = isAdmin
    ? `<button type="button" class="admin-delete-btn" data-action="delete"
         data-category="${categoryId}" data-item="${item.id}" aria-label="Delete this item">✕</button>
       <div class="admin-photo-overlay" data-action="change-photo"
         data-category="${categoryId}" data-item="${item.id}">📷 Change Photo</div>`
    : "";

  const nameMarkup = isAdmin
    ? `<span class="card-ribbon ${ribbonClass}" contenteditable="true" data-editable
         data-field="name" data-category="${categoryId}" data-item="${item.id}">${escapeHtml(item.name)} ♡</span>`
    : `<span class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)} ♡</span>`;

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
        ${priceMarkup}
        ${descriptionMarkup}
        ${stockMarkup}
      </div>
    </div>
  `;
}

function buildMarketToggle(category) {
  const isOpen = !!category.isOpen;
  return `
    <button type="button" class="market-toggle-btn ${isOpen ? "is-live" : ""}"
      data-action="toggle-market" data-category="${category.id}">
      ${isOpen ? "🔴 Market is LIVE — tap to close" : "⚪ Market is closed — tap to open"}
    </button>
  `;
}

function buildMarketBanner(isOpen) {
  if (!isOpen) return "";
  return `<div class="market-live-banner"><span class="live-dot"></span> LIVE NOW at Gazebo Valley</div>`;
}

function buildMarketClosedState() {
  return `
    <div class="market-closed">
      <img src="images/daisy.svg" alt="" class="daisy" aria-hidden="true">
      <p class="market-closed-text">The market stall isn't open right now.</p>
      <p class="market-closed-sub">
        Catch the live stock here every Saturday at Gazebo Valley — or order
        from the full menu above any day of the week.
      </p>
    </div>
  `;
}

export function renderMarketSection(category, isAdmin) {
  const container = document.getElementById("market-content");
  if (!container) return;

  const header = `
    <div class="section-header">
      <p class="section-eyebrow">${escapeHtml(category.eyebrow)}</p>
      <h2 class="section-title">${escapeHtml(category.title)}</h2>
      <p class="section-subtitle">${escapeHtml(category.subtitle)}</p>
    </div>
  `;

  const toggle = isAdmin ? buildMarketToggle(category) : "";
  const banner = buildMarketBanner(category.isOpen);

  // The owner can always see/edit the market list (to set it up before
  // opening); everyone else only sees it once it's actually live.
  const showItems = isAdmin || category.isOpen;

  let body;
  if (showItems) {
    const cards = category.items.map((item) => buildMarketCard(category.id, item, isAdmin)).join("");
    const addCard = isAdmin ? buildAddCard(category.id) : "";
    body = `<div class="menu-grid market-grid">${cards}${addCard}</div>`;
  } else {
    body = buildMarketClosedState();
  }

  container.innerHTML = `${header}${toggle}${banner}${body}`;
}

export function renderAll(state, isAdmin) {
  state.categories.forEach((category) => {
    if (category.id === "market") {
      renderMarketSection(category, isAdmin);
    } else {
      const container = document.getElementById(`${category.id}-grid`);
      renderCategory(category, container, isAdmin);
    }
  });
  document.body.classList.toggle("admin-mode", isAdmin);
}
