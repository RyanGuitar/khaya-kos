// js/admin/renderer.js
// Rebuilds the #menu-grid / #extras-grid containers from store state.
// Re-run on every state change (full-state, product-update/add/remove).

const WHATSAPP_NUMBER = "27000000000"; // TODO Ryan: replace with the real number

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
        <a href="${waLink(item.name)}" class="card-cta" target="_blank" rel="noopener noreferrer">Order on WhatsApp →</a>
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

export function renderAll(state, isAdmin) {
  state.categories.forEach((category) => {
    const container = document.getElementById(`${category.id}-grid`);
    renderCategory(category, container, isAdmin);
  });
  document.body.classList.toggle("admin-mode", isAdmin);
}
