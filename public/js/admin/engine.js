// js/admin/engine.js
import { store } from "./store.js";
import { sync } from "./sync.js";
import { renderAll, renderCategory, patchCard, renderMarketSection } from "./renderer.js";
import { fileToCompressedDataUrl } from "./imageUtils.js";

let isAdmin = false;
let pendingPhotoTarget = null; // { categoryId, itemId }

function render() {
  renderAll(store.state, isAdmin);
}

// Updates just the one card that changed instead of rebuilding the whole
// grid — falls back to a full render only if the card isn't in the DOM yet
// (shouldn't normally happen, but keeps this safe either way).
function patchOrRender(categoryId, itemId) {
  const success = patchCard(store.state, categoryId, itemId, isAdmin);
  if (!success) render();
}

// Re-renders just one category's section instead of the whole page —
// used when an item is added/removed, which changes the grid's item
// count rather than a single field, so patchCard doesn't apply.
function renderCategoryById(categoryId) {
  const category = store.getCategory(categoryId);
  if (!category) return;
  if (category.id === "market") {
    renderMarketSection(category, isAdmin);
  } else {
    renderCategory(category, document.getElementById(`${category.id}-grid`), isAdmin);
  }
}

function showToast(message) {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ===== LIKES =====
const LIKED_ITEMS_KEY = "khayaKosLikedItems";

function getLikedItems() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_ITEMS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveLikedItems(set) {
  try {
    localStorage.setItem(LIKED_ITEMS_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage unavailable (private browsing etc.) — likes still work,
    // they just won't remember the "liked" state on this device next visit.
  }
}

// The floating-hearts burst everyone sees when they tap like — several
// small hearts drift up from the button and fade out.
function spawnFloatingHearts(button) {
  const rect = button.getBoundingClientRect();
  const count = 5;
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    heart.className = "floating-heart";
    heart.textContent = "❤";
    heart.style.left = `${rect.left + rect.width / 2 + (Math.random() * 40 - 20)}px`;
    heart.style.top = `${rect.top + (Math.random() * 10 - 5)}px`;
    heart.style.animationDelay = `${i * 70}ms`;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1400);
  }
}

// The ambient hearts that drift up the left edge of the screen when
// SOMEONE ELSE, anywhere on the site right now, likes something — this is
// what makes the "real people are here right now" feeling visible to
// visitors who aren't the one clicking.
function spawnAmbientHearts() {
  const count = 3;
  const isDesktop = window.innerWidth >= 1015;
  const leftBase = isDesktop ? 30 : 18;
  const leftRange = isDesktop ? 55 : 26;
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    heart.className = "ambient-heart";
    heart.textContent = "❤";
    heart.style.left = `${leftBase + Math.random() * leftRange}px`;
    heart.style.animationDelay = `${i * 130}ms`;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 2400);
  }
}

// The live "something just sold" flourish everyone on the site sees —
// this is what makes market day feel alive rather than just a number
// quietly changing.
function showSoldToast(itemName, qty, isSoldOut) {
  const container = document.getElementById("sold-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "sold-toast" + (isSoldOut ? " sold-toast-out" : "");

  const strong = document.createElement("strong");
  strong.textContent = itemName;

  if (isSoldOut) {
    toast.append("🎉 ", strong, " just sold out!");
  } else {
    toast.append(`🥧 ${qty} × `, strong, " just sold at the market!");
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

// Shared by the fast +/- steppers and the direct stock number input — both
// end up here so the "sold" toast fires consistently either way.
function adjustStock(categoryId, itemId, delta) {
  const item = store.getItem(categoryId, itemId);
  if (!item) return;
  const oldValue = item.stock;
  const newValue = Math.max(0, oldValue + delta);

  store.applyUpdate(categoryId, itemId, "stock", newValue);
  patchOrRender(categoryId, itemId);
  sync.adjustStock(categoryId, itemId, delta);

  if (newValue < oldValue) {
    showSoldToast(item.name, oldValue - newValue, newValue === 0);
  }
}

/* ===== LOGIN MODAL ===== */
function openLoginModal() {
  const overlay = document.getElementById("login-modal-overlay");
  const input = document.getElementById("login-password-input");
  const error = document.getElementById("login-error");
  if (!overlay) return;
  error.textContent = "";
  overlay.hidden = false;
  input.value = "";
  input.focus();
}

function closeLoginModal() {
  const overlay = document.getElementById("login-modal-overlay");
  if (overlay) overlay.hidden = true;
}

function updateLoginButton() {
  const btn = document.getElementById("owner-login-btn");
  if (!btn) return;
  const icon = btn.querySelector(".btn-icon");
  const label = btn.querySelector(".btn-label");
  if (icon) icon.textContent = isAdmin ? "🔓" : "🔒";
  if (label) label.textContent = isAdmin ? "Exit Edit Mode" : "Owner Login";
  btn.classList.toggle("is-admin", isAdmin);
}

/* ===== EVENT WIRING (attached once, delegated) ===== */
function wireEvents() {
  // Login button toggles modal open, or logs out if already admin.
  document.getElementById("owner-login-btn")?.addEventListener("click", () => {
    if (isAdmin) {
      isAdmin = false;
      sessionStorage.removeItem("khayaKosAdminPw");
      updateLoginButton();
      render();
      showToast("Logged out of edit mode.");
    } else {
      openLoginModal();
    }
  });

  document.getElementById("login-cancel-btn")?.addEventListener("click", closeLoginModal);

  document.getElementById("login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = document.getElementById("login-password-input").value;
    if (!password) return;
    sync.sendAuth(password);
  });

  // Hidden file input used for photo uploads.
  document.getElementById("admin-photo-input")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !pendingPhotoTarget) return;

    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const { categoryId, itemId } = pendingPhotoTarget;
      store.applyUpdate(categoryId, itemId, "image", dataUrl);
      patchOrRender(categoryId, itemId);
      sync.updateProduct(categoryId, itemId, "image", dataUrl);
    } catch (err) {
      showToast(err.message || "Could not process that photo.");
    }
    pendingPhotoTarget = null;
  });

  // Delegated clicks across the whole document: delete, add, change-photo.
  document.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest('[data-action="delete"]');
    if (deleteBtn) {
      const { category, item } = deleteBtn.dataset;
      if (confirm("Remove this item from the site for everyone?")) {
        store.applyRemove(category, item);
        renderCategoryById(category);
        sync.removeProduct(category, item);
        showToast("Item removed.");
      }
      return;
    }

    const addBtn = e.target.closest('[data-action="add"]');
    if (addBtn) {
      sync.addProduct(addBtn.dataset.category);
      showToast("Adding new item…");
      return;
    }

    const photoBtn = e.target.closest('[data-action="change-photo"]');
    if (photoBtn) {
      pendingPhotoTarget = { categoryId: photoBtn.dataset.category, itemId: photoBtn.dataset.item };
      document.getElementById("admin-photo-input")?.click();
      return;
    }

    const stockMinusBtn = e.target.closest('[data-action="stock-minus"]');
    if (stockMinusBtn) {
      adjustStock(stockMinusBtn.dataset.category, stockMinusBtn.dataset.item, -1);
      return;
    }

    const stockPlusBtn = e.target.closest('[data-action="stock-plus"]');
    if (stockPlusBtn) {
      adjustStock(stockPlusBtn.dataset.category, stockPlusBtn.dataset.item, 1);
      return;
    }

    const marketToggleBtn = e.target.closest('[data-action="toggle-market"]');
    if (marketToggleBtn) {
      const categoryId = marketToggleBtn.dataset.category;
      const category = store.getCategory(categoryId);
      if (!category) return;
      const newIsOpen = !category.isOpen;
      store.applyCategoryToggle(categoryId, newIsOpen);
      renderMarketSection(category, isAdmin);
      sync.toggleCategory(categoryId);
      showToast(newIsOpen ? "📣 Market is now open — live for everyone." : "Market closed.");
      return;
    }

    const likeBtn = e.target.closest('[data-action="like"]');
    if (likeBtn) {
      const { category, item } = likeBtn.dataset;
      const liked = getLikedItems();
      const alreadyLiked = liked.has(item);
      const delta = alreadyLiked ? -1 : 1;

      if (alreadyLiked) {
        liked.delete(item);
      } else {
        liked.add(item);
        spawnFloatingHearts(likeBtn);
      }
      saveLikedItems(liked);

      const current = store.getItem(category, item);
      if (current) {
        current.likes = Math.max(0, (current.likes || 0) + delta);
      }
      patchOrRender(category, item);
      sync.likeProduct(category, item, delta);
      return;
    }
  });

  // Delegated commit of contentEditable name fields (focusout bubbles, unlike blur).
  document.addEventListener("focusout", (e) => {
    if (!e.target.matches("[data-editable][data-field='name']")) return;
    const { category, item } = e.target.dataset;
    const newValue = e.target.textContent.replace(/♡\s*$/, "").trim();
    const current = store.getItem(category, item);
    if (!current || current.name === newValue || !newValue) {
      patchOrRender(category, item); // snap back to the clean stored value either way
      return;
    }
    store.applyUpdate(category, item, "name", newValue);
    patchOrRender(category, item);
    sync.updateProduct(category, item, "name", newValue);
  });

  // Prevent Enter from adding a line break in the single-line name field.
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("[data-editable][data-field='name']") && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  });

  // Delegated commit of price/description/stock fields.
  document.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    if (field !== "price" && field !== "description" && field !== "stock") return;

    const { category, item } = e.target.dataset;

    if (field === "stock") {
      const current = store.getItem(category, item);
      const oldValue = current ? current.stock : 0;
      const newValue = Math.max(0, Number(e.target.value) || 0);
      store.applyUpdate(category, item, "stock", newValue);
      patchOrRender(category, item);
      sync.updateProduct(category, item, "stock", newValue);
      if (current && newValue < oldValue) {
        showSoldToast(current.name, oldValue - newValue, newValue === 0);
      }
      return;
    }

    const value = field === "price" ? Number(e.target.value) || 0 : e.target.value;
    store.applyUpdate(category, item, field, value);
    patchOrRender(category, item);
    sync.updateProduct(category, item, field, value);
  });
}

/* ===== SYNC HANDLERS ===== */
function wireSync() {
  sync.on("full-state", (msg) => {
    store.replaceState(msg.data);
    render();
  });

  sync.on("product-update", (msg) => {
    if (msg.field === "stock") {
      const current = store.getItem(msg.categoryId, msg.itemId);
      const oldValue = current ? current.stock : null;
      store.applyUpdate(msg.categoryId, msg.itemId, msg.field, msg.value);
      patchOrRender(msg.categoryId, msg.itemId);
      if (current && oldValue !== null && msg.value < oldValue) {
        showSoldToast(current.name, oldValue - msg.value, msg.value === 0);
      }
      return;
    }
    if (msg.field === "likes") {
      const current = store.getItem(msg.categoryId, msg.itemId);
      const oldValue = current ? current.likes : null;
      store.applyUpdate(msg.categoryId, msg.itemId, msg.field, msg.value);
      patchOrRender(msg.categoryId, msg.itemId);
      // Only celebrate someone ELSE's like arriving live — the person who
      // clicked already sees the button-burst animation locally, and the
      // server never echoes a like back to whoever sent it.
      if (current && oldValue !== null && msg.value > oldValue) {
        spawnAmbientHearts();
      }
      return;
    }
    store.applyUpdate(msg.categoryId, msg.itemId, msg.field, msg.value);
    patchOrRender(msg.categoryId, msg.itemId);
  });

  sync.on("category-toggle", (msg) => {
    store.applyCategoryToggle(msg.categoryId, msg.isOpen);
    const category = store.getCategory(msg.categoryId);
    if (category && category.id === "market") {
      renderMarketSection(category, isAdmin);
    } else {
      render();
    }
    if (msg.categoryId === "market") {
      showToast(msg.isOpen ? "📣 The market just opened!" : "The market has closed.");
    }
  });

  sync.on("product-add", (msg) => {
    store.applyAdd(msg.categoryId, msg.item);
    renderCategoryById(msg.categoryId);
    showToast("New item added.");
  });

  sync.on("product-remove", (msg) => {
    store.applyRemove(msg.categoryId, msg.itemId);
    renderCategoryById(msg.categoryId);
  });

  sync.on("auth-result", (msg) => {
    const submitBtn = document.querySelector("#login-form button[type='submit']");
    if (msg.success) {
      isAdmin = true;
      sessionStorage.setItem("khayaKosAdminPw", document.getElementById("login-password-input").value);
      closeLoginModal();
      updateLoginButton();
      render();
      showToast("Edit mode on — changes go live for everyone.");
    } else {
      const error = document.getElementById("login-error");
      if (error) error.textContent = "Incorrect password.";
      sessionStorage.removeItem("khayaKosAdminPw");
    }
    if (submitBtn) submitBtn.disabled = false;
  });

  sync.on("error", (msg) => {
    showToast(msg.message || "Something went wrong.");
  });

  sync.connect();
}

export const engine = {
  start() {
    render(); // paint instantly from the server-injected state
    wireEvents();
    wireSync();
    updateLoginButton();
  },
};
