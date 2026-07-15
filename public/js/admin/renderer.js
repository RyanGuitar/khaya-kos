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
      data-category="${categoryId}" data-item="${item.id}" aria-label="Like ${escapeHtml(item.name)}">
      <span class="like-icon">${isLiked ? "❤" : "♡"}</span>
      <span class="like-count">${item.likes || 0}</span>
    </button>
  `;
}

function buildNameField(categoryId, item) {
  return `
    <input type="text" class="name-input" data-field="name"
      data-category="${categoryId}" data-item="${item.id}"
      placeholder="Product name" value="${escapeHtml(item.name)}">
  `;
}

function buildCard(categoryId, item, isAdmin) {
  const ribbonClass = `rib-${item.ribbon || "navy"}`;

  const priceMarkup = isAdmin
    ? `<input type="number" min="0" step="1" class="price-input" data-field="price"
         data-category="${categoryId}" data-item="${item.id}" value="${item.price}">`
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const nameFieldMarkup = isAdmin ? buildNameField(categoryId, item) : "";

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

  // The ribbon is a read-only live preview of the name now — it's layered
  // over the photo overlay in admin mode, so making it independently
  // clickable there caused clicks meant for it to land on "change photo"
  // instead. Editing happens through the clearly-labelled field below.
  const nameMarkup = `<span class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)} ♡</span>`;

  return `
    <div class="menu-card revealed" data-item-id="${item.id}">
      <div class="card-img-wrap">
        ${nameMarkup}
        <img src="${item.image}" alt="${escapeHtml(item.name)}" loading="lazy" width="400" height="300">
        ${adminControls}
      </div>
      <div class="card-body">
        ${priceMarkup}
        ${nameFieldMarkup}
        ${descriptionMarkup}
        <div class="card-footer-row">
          ${buildLikeButton(categoryId, item, isAdmin)}
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
  // A brand-new item defaults to stock:null ("not set up yet") — that's
  // deliberately distinct from stock:0 ("sold out"), so a freshly-added
  // item doesn't get stamped SOLD OUT before she's even priced it.
  const hasStock = typeof item.stock === "number";
  const soldOut = hasStock && item.stock <= 0;

  const priceMarkup = isAdmin
    ? `<input type="number" min="0" step="1" class="price-input" data-field="price"
         data-category="${categoryId}" data-item="${item.id}" value="${item.price}">`
    : `<span class="price-tag">${formatPrice(item.price)}</span>`;

  const nameFieldMarkup = isAdmin ? buildNameField(categoryId, item) : "";

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
           data-category="${categoryId}" data-item="${item.id}" value="${item.stock ?? ""}" placeholder="Set stock">
         <button type="button" class="stock-btn" data-action="stock-plus"
           data-category="${categoryId}" data-item="${item.id}" aria-label="Add one back">+</button>
       </div>`
    : `<span class="stock-badge ${soldOut ? "stock-out" : ""}">${
        !hasStock ? "Coming soon" : soldOut ? "Sold out" : `${item.stock} left`
      }</span>`;

  const adminControls = isAdmin
    ? `<button type="button" class="admin-delete-btn" data-action="delete"
         data-category="${categoryId}" data-item="${item.id}" aria-label="Delete this item">✕</button>
       <div class="admin-photo-overlay" data-action="change-photo"
         data-category="${categoryId}" data-item="${item.id}">📷 Change Photo</div>`
    : "";

  // Read-only preview — see the comment in buildCard() for why this is no
  // longer contentEditable.
  const nameMarkup = `<span class="card-ribbon ${ribbonClass}">${escapeHtml(item.name)} ♡</span>`;

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
        ${nameFieldMarkup}
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
        from the full menu below any day of the week.
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
  if (countEl) countEl.textContent = value;
  if (iconEl) iconEl.textContent = isLiked ? "❤" : "♡";
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
