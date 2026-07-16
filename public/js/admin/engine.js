// js/admin/engine.js
import { store } from "./store.js?v=3.11";
import { sync } from "./sync.js?v=3.11";
import { renderAll, renderCategory, patchCard, patchLikeCount, patchStock, renderMarketSection } from "./renderer.js?v=3.11";
import { fileToCompressedDataUrl } from "./imageUtils.js";
import { createStockBatcher, normalizeStock } from "./stockLogic.js";

let isAdmin = false;
let pendingPhotoTarget = null; // { categoryId, itemId }
let pendingDeleteTarget = null; // { categoryId, itemId }
let deleteTrigger = null;
let pendingSectionDeleteId = null;
let sectionDeleteTrigger = null;

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
  const container = document.getElementById("sold-toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "sold-toast notice-toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

function celebrateMarketOpen() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const colours = ["#d99a2b", "#a63a2e", "#4f7a3d", "#2f6f73", "#70486f", "#f7f2e6"];
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 70; i++) {
    const piece = document.createElement("span");
    piece.className = "market-confetti";
    piece.style.setProperty("--confetti-left", `${Math.random() * 100}vw`);
    piece.style.setProperty("--confetti-colour", colours[i % colours.length]);
    piece.style.setProperty("--confetti-delay", `${Math.random() * 0.8}s`);
    piece.style.setProperty("--confetti-duration", `${2.5 + Math.random() * 1.8}s`);
    piece.style.setProperty("--confetti-drift", `${Math.random() * 160 - 80}px`);
    piece.style.setProperty("--confetti-turn", `${360 + Math.random() * 720}deg`);
    fragment.appendChild(piece);
    setTimeout(() => piece.remove(), 5200);
  }

  document.body.appendChild(fragment);
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
let lastAmbientBurst = 0;
const AMBIENT_MIN_INTERVAL = 1200; // ms — caps how often this can fire even
                                     // if someone rapidly toggles likes

function spawnAmbientHearts() {
  const now = Date.now();
  if (now - lastAmbientBurst < AMBIENT_MIN_INTERVAL) return;
  lastAmbientBurst = now;

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

// The stepper buttons update the visible number instantly on every tap
// (so it still feels responsive), but the actual network send — and the
// "sold" toast everyone else sees — is batched: rapid taps within the
// debounce window collapse into ONE combined delta and ONE toast, instead
// of a stack of individual toasts piling up for every viewer on the site
// (which is exactly what happened selling several items in quick succession).
const stockBatcher = createStockBatcher({
  onChange({ categoryId, itemId, nextStock }) {
    store.applyUpdate(categoryId, itemId, "stock", nextStock);
    patchStock(itemId, nextStock, isAdmin, { deferSoldOut: nextStock === 0 });
  },
  onFlush: flushStockDelta,
});

function queueStockChange(categoryId, itemId, newValue) {
  const item = store.getItem(categoryId, itemId);
  if (!item) return;

  const oldValue = typeof item.stock === "number" ? item.stock : 0;
  const nextValue = normalizeStock(newValue);
  const key = `${categoryId}:${itemId}`;
  stockBatcher.queue({
    key,
    categoryId,
    itemId,
    originalStock: oldValue,
    nextStock: nextValue,
  });
}

function adjustStock(categoryId, itemId, delta) {
  const item = store.getItem(categoryId, itemId);
  if (!item) return;
  const oldValue = typeof item.stock === "number" ? item.stock : 0;
  queueStockChange(categoryId, itemId, oldValue + delta);
}

function flushStockDelta(pending) {
  const item = store.getItem(pending.categoryId, pending.itemId);
  if (!item) return;
  const currentStock = typeof item.stock === "number" ? item.stock : 0;
  const delta = currentStock - pending.originalStock;

  // Finalise the visual state only after the correction window has elapsed.
  patchStock(pending.itemId, currentStock, isAdmin);
  if (delta === 0) return; // e.g. one tap down then one tap back up

  sync.adjustStock(pending.categoryId, pending.itemId, delta);

  // "Sold" only means something once the market is actually live for
  // customers — while she's setting up stock with the market closed,
  // nothing is really selling, so no toast should fire for anyone.
  const category = store.getCategory(pending.categoryId);
  if (category?.isOpen && delta < 0) {
    showSoldToast(item.name, Math.abs(delta), currentStock === 0);
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

function openDeleteModal(categoryId, itemId, trigger) {
  const overlay = document.getElementById("delete-modal-overlay");
  const itemName = document.getElementById("delete-item-name");
  const cancelBtn = document.getElementById("delete-cancel-btn");
  const item = store.getItem(categoryId, itemId);
  if (!overlay || !item) return;

  pendingDeleteTarget = { categoryId, itemId };
  deleteTrigger = trigger;
  if (itemName) itemName.textContent = item.name || "This item";
  overlay.hidden = false;
  document.body.classList.add("dialog-open");
  cancelBtn?.focus();
}

function closeDeleteModal({ restoreFocus = true } = {}) {
  const overlay = document.getElementById("delete-modal-overlay");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("dialog-open");

  const trigger = deleteTrigger;
  pendingDeleteTarget = null;
  deleteTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function confirmDelete() {
  if (!pendingDeleteTarget) return;
  const { categoryId, itemId } = pendingDeleteTarget;

  closeDeleteModal({ restoreFocus: false });
  store.applyRemove(categoryId, itemId);
  renderCategoryById(categoryId);
  sync.removeProduct(categoryId, itemId);
  showToast("Item removed.");
}

function openSectionDeleteModal(categoryId, trigger) {
  const category = store.getCategory(categoryId);
  const overlay = document.getElementById("section-delete-modal-overlay");
  if (!category || !overlay || category.id === "extras") return;

  pendingSectionDeleteId = categoryId;
  sectionDeleteTrigger = trigger;
  const name = document.getElementById("delete-section-name");
  if (name) name.textContent = category.title || "This section";
  overlay.hidden = false;
  document.body.classList.add("dialog-open");
  document.getElementById("section-delete-cancel-btn")?.focus();
}

function closeSectionDeleteModal({ restoreFocus = true } = {}) {
  const overlay = document.getElementById("section-delete-modal-overlay");
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("dialog-open");

  const trigger = sectionDeleteTrigger;
  pendingSectionDeleteId = null;
  sectionDeleteTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function confirmSectionDelete() {
  if (!pendingSectionDeleteId) return;
  const categoryId = pendingSectionDeleteId;
  closeSectionDeleteModal({ restoreFocus: false });
  store.applyCategoryRemove(categoryId);
  render();
  sync.removeCategory(categoryId);
  showToast("Section removed.");
}

function leaveEditMode() {
  isAdmin = false;
  sessionStorage.removeItem("khayaKosAdminPw");
  updateLoginButton();
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
  showToast("Logged out of edit mode.");
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
      leaveEditMode();
    } else {
      openLoginModal();
    }
  });

  document.getElementById("owner-exit-btn")?.addEventListener("click", leaveEditMode);

  document.getElementById("login-cancel-btn")?.addEventListener("click", closeLoginModal);

  document.getElementById("delete-cancel-btn")?.addEventListener("click", () => closeDeleteModal());
  document.getElementById("delete-confirm-btn")?.addEventListener("click", confirmDelete);
  document.getElementById("delete-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  document.getElementById("section-delete-cancel-btn")?.addEventListener("click", () => closeSectionDeleteModal());
  document.getElementById("section-delete-confirm-btn")?.addEventListener("click", confirmSectionDelete);
  document.getElementById("section-delete-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeSectionDeleteModal();
  });

  document.addEventListener("keydown", (e) => {
    const itemOverlay = document.getElementById("delete-modal-overlay");
    const sectionOverlay = document.getElementById("section-delete-modal-overlay");
    const overlay = !itemOverlay?.hidden ? itemOverlay : !sectionOverlay?.hidden ? sectionOverlay : null;
    if (!overlay) return;

    if (e.key === "Escape") {
      e.preventDefault();
      if (overlay === itemOverlay) closeDeleteModal();
      else closeSectionDeleteModal();
      return;
    }

    if (e.key === "Tab") {
      const focusable = [...overlay.querySelectorAll("button:not([disabled])")];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

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
    const menuDisclosureBtn = e.target.closest('[data-action="toggle-weekly-menu"]');
    if (menuDisclosureBtn) {
      const grid = document.getElementById("menu-grid");
      if (!grid) return;

      const isExpanded = grid.dataset.expanded === "true";
      const nextExpanded = !isExpanded;
      const totalItems = Number(menuDisclosureBtn.dataset.total) || 0;

      grid.dataset.expanded = String(nextExpanded);
      grid.classList.toggle("is-collapsed", !nextExpanded);
      grid.classList.toggle("is-expanded", nextExpanded);
      menuDisclosureBtn.setAttribute("aria-expanded", String(nextExpanded));
      menuDisclosureBtn.textContent = nextExpanded
        ? "Show fewer"
        : `See all ${totalItems} menu items`;

      if (!nextExpanded) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(() => {
          document.getElementById("menu")?.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start",
          });
        });
      }
      return;
    }

    const jumpToAddBtn = e.target.closest('[data-action="jump-to-add"]');
    if (jumpToAddBtn) {
      const target = document.getElementById(`add-item-${jumpToAddBtn.dataset.category}`);
      if (!target) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      return;
    }

    const returnToSectionBtn = e.target.closest('[data-action="return-to-section"]');
    if (returnToSectionBtn) {
      const section = document.getElementById(returnToSectionBtn.dataset.category);
      if (!section) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      section.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      section.querySelector(".owner-section-title, .owner-section-name-field input")?.focus({ preventScroll: true });
      return;
    }

    const visibilityBtn = e.target.closest('[data-action="toggle-section-visibility"]');
    if (visibilityBtn) {
      const categoryId = visibilityBtn.dataset.category;
      const category = store.getCategory(categoryId);
      if (!category || (category.kind !== "optional" && category.id !== "extras")) return;
      const isVisible = category.isVisible === false;
      store.applyCategoryVisibility(categoryId, isVisible);
      renderCategoryById(categoryId);
      sync.setCategoryVisibility(categoryId, isVisible);
      showToast(isVisible ? "Section is now visible." : "Section is now hidden.");
      return;
    }

    const addSectionBtn = e.target.closest('[data-action="add-section"]');
    if (addSectionBtn) {
      sync.addCategory();
      showToast("Adding a new section…");
      return;
    }

    const removeSectionBtn = e.target.closest('[data-action="remove-section"]');
    if (removeSectionBtn) {
      openSectionDeleteModal(removeSectionBtn.dataset.category, removeSectionBtn);
      return;
    }

    const deleteBtn = e.target.closest('[data-action="delete"]');
    if (deleteBtn) {
      const { category, item } = deleteBtn.dataset;
      openDeleteModal(category, item, deleteBtn);
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
      if (newIsOpen) celebrateMarketOpen();
      return;
    }

    const likeBtn = e.target.closest('[data-action="like"]');
    if (likeBtn) {
      // Brief cooldown stops a rapid mash from firing a dozen requests (and
      // a dozen ambient-heart bursts on everyone else's screen) in a row —
      // the button still toggles normally, just not faster than this.
      if (likeBtn.dataset.cooling === "true") return;
      likeBtn.dataset.cooling = "true";
      setTimeout(() => { likeBtn.dataset.cooling = "false"; }, 500);

      const { category, item } = likeBtn.dataset;
      const liked = getLikedItems();
      const alreadyLiked = liked.has(item);
      const delta = alreadyLiked ? -1 : 1;
      const nowLiked = !alreadyLiked;

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
        patchLikeCount(item, current.likes, nowLiked);
      }
      sync.likeProduct(category, item, delta);
      return;
    }
  });

  // Start each text/price edit with a clean field. Stock deliberately keeps
  // its value visible so the owner never loses track of the live count.
  document.addEventListener("focusin", (e) => {
    const field = e.target.dataset.field;
    if (!isAdmin || !["name", "description", "price"].includes(field)) return;
    e.target.dataset.editOriginal = e.target.value;
    e.target.dataset.editTyped = "false";
    e.target.value = "";
  });

  document.addEventListener("input", (e) => {
    if (e.target.dataset.editTyped !== undefined) {
      e.target.dataset.editTyped = "true";
    }
  });

  // Delegated commit of price/description/stock/name fields.
  document.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    if (field === "category-title") {
      const categoryId = e.target.dataset.category;
      const category = store.getCategory(categoryId);
      const value = e.target.value.trim();
      if (!category || (category.kind !== "optional" && category.id !== "extras") || !value) {
        if (category) e.target.value = category.title;
        return;
      }
      store.applyCategoryUpdate(categoryId, "title", value);
      renderCategoryById(categoryId);
      sync.updateCategory(categoryId, "title", value);
      showToast("Section heading updated.");
      return;
    }

    if (field !== "price" && field !== "description" && field !== "stock" && field !== "name") return;

    const { category, item } = e.target.dataset;

    if (field !== "stock" && e.target.dataset.editTyped === "false") {
      e.target.value = e.target.dataset.editOriginal ?? "";
      return;
    }

    if (field === "stock") {
      const current = store.getItem(category, item);
      const newValue = normalizeStock(e.target.value);
      if (current) queueStockChange(category, item, newValue);
      return;
    }

    if (field === "name") {
      const newValue = e.target.value.trim();
      if (!newValue) {
        patchOrRender(category, item); // snap back to the clean stored value
        return;
      }
      store.applyUpdate(category, item, "name", newValue);
      patchOrRender(category, item);
      sync.updateProduct(category, item, "name", newValue);
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
      patchStock(msg.itemId, msg.value, isAdmin);
      const category = store.getCategory(msg.categoryId);
      if (current && oldValue !== null && category?.isOpen && msg.value < oldValue) {
        showSoldToast(current.name, oldValue - msg.value, msg.value === 0);
      }
      return;
    }
    if (msg.field === "likes") {
      const current = store.getItem(msg.categoryId, msg.itemId);
      const oldValue = current ? current.likes : null;
      store.applyUpdate(msg.categoryId, msg.itemId, msg.field, msg.value);
      patchLikeCount(msg.itemId, msg.value, getLikedItems().has(msg.itemId));
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
      if (msg.isOpen) celebrateMarketOpen();
    }
  });

  sync.on("category-visibility", (msg) => {
    store.applyCategoryVisibility(msg.categoryId, msg.isVisible);
    renderCategoryById(msg.categoryId);
    showToast(msg.isVisible ? "Section is now visible." : "Section is now hidden.");
  });

  sync.on("category-update", (msg) => {
    store.applyCategoryUpdate(msg.categoryId, msg.field, msg.value);
    renderCategoryById(msg.categoryId);
  });

  sync.on("category-add", (msg) => {
    store.applyCategoryAdd(msg.category);
    render();
    const section = document.getElementById(msg.category.id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    section?.querySelector('[data-field="category-title"]')?.focus({ preventScroll: true });
    showToast("New section added.");
  });

  sync.on("category-remove", (msg) => {
    store.applyCategoryRemove(msg.categoryId);
    render();
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
      window.scrollTo({ top: 0, behavior: "auto" });
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
