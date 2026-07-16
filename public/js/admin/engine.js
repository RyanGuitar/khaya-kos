// js/admin/engine.js
import { store } from "./store.js?v=3.19";
import { sync } from "./sync.js?v=3.19";
import { renderAll, renderCategory, patchCard, patchLikeCount, patchStock, renderMarketSection } from "./renderer.js?v=3.19";
import { createImageCropper } from "./imageCropper.js?v=3.19";
import { createStockBatcher, normalizeStock } from "./stockLogic.js";
import { initMarketHashGuard } from "./marketRoute.js";

let isAdmin = false;
let pendingPhotoTarget = null; // { categoryId, itemId }
let pendingPhotoTrigger = null;
let photoCropper = null;
let pendingDeleteTarget = null; // { categoryId, itemId }
let deleteTrigger = null;
let loginTrigger = null;
let notificationTimer = null;
let marketHashGuard = null;

function isMarketRouteAvailable() {
  return isAdmin || Boolean(store.getCategory("market")?.isOpen);
}

function reconcileMarketHash() {
  marketHashGuard?.reconcile();
}

function render() {
  renderAll(store.state, isAdmin);
  reconcileMarketHash();
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
    reconcileMarketHash();
  } else {
    renderCategory(category, document.getElementById(`${category.id}-grid`), isAdmin);
  }
}

function clearNotifications() {
  const container = document.getElementById("sold-toast-container");
  if (!container) return;
  clearTimeout(notificationTimer);
  notificationTimer = null;
  container.querySelectorAll(".sold-toast").forEach((toast) => toast.remove());
}

function setModalIsolation(activeOverlay, isolate) {
  if (!activeOverlay) return;
  [...document.body.children].forEach((element) => {
    if (element === activeOverlay || ["SCRIPT", "STYLE"].includes(element.tagName)) return;
    if (isolate) {
      if (!element.inert) {
        element.inert = true;
        element.dataset.modalInertAdded = "true";
      }
      if (!element.hasAttribute("aria-hidden")) {
        element.setAttribute("aria-hidden", "true");
        element.dataset.modalAriaHiddenAdded = "true";
      }
      return;
    }
    if (element.dataset.modalInertAdded === "true") {
      element.inert = false;
      delete element.dataset.modalInertAdded;
    }
    if (element.dataset.modalAriaHiddenAdded === "true") {
      element.removeAttribute("aria-hidden");
      delete element.dataset.modalAriaHiddenAdded;
    }
  });
}

function showToast(message) {
  const container = document.getElementById("sold-toast-container");
  if (!container || (isAdmin && document.body.classList.contains("dialog-open"))) return;
  clearNotifications();
  const toast = document.createElement("div");
  toast.className = "sold-toast notice-toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  notificationTimer = setTimeout(() => {
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
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = button.getBoundingClientRect();
  const count = 5;
  for (let i = 0; i < count; i++) {
    const heart = document.createElement("span");
    heart.className = "floating-heart";
    heart.setAttribute("aria-hidden", "true");
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
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    heart.setAttribute("aria-hidden", "true");
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
  if (!container || (isAdmin && document.body.classList.contains("dialog-open"))) return;
  if (isAdmin) clearNotifications();

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

function moveOptionalSectionToDraft(categoryId, { renderSection = true } = {}) {
  if (categoryId !== "extras") return false;
  const category = store.getCategory(categoryId);
  if (!category || category.isVisible === false) return false;

  store.applyCategoryVisibility(categoryId, false);
  if (renderSection) {
    renderCategoryById(categoryId);
  } else {
    const button = document.querySelector(
      '.owner-state-btn[data-action="toggle-section-visibility"][data-category="extras"]'
    );
    if (button) {
      button.classList.remove("is-on");
      button.classList.add("is-off");
      button.setAttribute("aria-pressed", "false");
      const line = button.querySelector(".owner-state-line");
      const dot = line?.querySelector(".owner-state-dot");
      if (line && dot) line.replaceChildren(dot, document.createTextNode(" Draft — hidden from visitors"));
      const action = button.querySelector(".owner-state-action");
      if (action) action.textContent = "Publish section";
    }
  }
  sync.setCategoryVisibility(categoryId, false);
  return true;
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
  const submitButton = document.querySelector("#login-form button[type='submit']");
  if (!overlay) return;
  loginTrigger = document.activeElement;
  error.textContent = "";
  input.setAttribute("aria-invalid", "false");
  if (submitButton) submitButton.disabled = false;
  overlay.hidden = false;
  document.body.classList.add("dialog-open");
  input.value = "";
  input.focus();
  setModalIsolation(overlay, true);
}

function closeLoginModal({ restoreFocus = true } = {}) {
  const overlay = document.getElementById("login-modal-overlay");
  if (overlay) overlay.hidden = true;
  setModalIsolation(overlay, false);
  document.body.classList.remove("dialog-open");
  const trigger = loginTrigger;
  loginTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function openDeleteModal(categoryId, itemId, trigger) {
  const overlay = document.getElementById("delete-modal-overlay");
  const itemName = document.getElementById("delete-item-name");
  const cancelBtn = document.getElementById("delete-cancel-btn");
  const item = store.getItem(categoryId, itemId);
  if (!overlay || !item) return;

  pendingDeleteTarget = { categoryId, itemId };
  deleteTrigger = trigger;
  clearNotifications();
  if (itemName) itemName.textContent = item.name || "This item";
  overlay.hidden = false;
  document.body.classList.add("dialog-open");
  cancelBtn?.focus();
  setModalIsolation(overlay, true);
}

function closeDeleteModal({ restoreFocus = true } = {}) {
  const overlay = document.getElementById("delete-modal-overlay");
  if (overlay) overlay.hidden = true;
  setModalIsolation(overlay, false);
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
  moveOptionalSectionToDraft(categoryId);
  store.applyRemove(categoryId, itemId);
  renderCategoryById(categoryId);
  sync.removeProduct(categoryId, itemId);
  requestAnimationFrame(() => {
    document.getElementById(`add-item-${categoryId}`)?.focus();
  });
}

function leaveEditMode() {
  isAdmin = false;
  sessionStorage.removeItem("khayaKosAdminPw");
  updateLoginButton();
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => document.getElementById("owner-login-btn")?.focus());
}

function updateLoginButton() {
  const btn = document.getElementById("owner-login-btn");
  if (!btn) return;
  const icon = btn.querySelector(".btn-icon");
  const label = btn.querySelector(".btn-label");
  const iconImage = icon?.querySelector("img");
  if (iconImage) iconImage.src = isAdmin ? "images/unlock.svg" : "images/lock.svg";
  if (label) label.textContent = isAdmin ? "Exit Edit Mode" : "Owner Login";
  btn.classList.toggle("is-admin", isAdmin);
}

/* ===== EVENT WIRING (attached once, delegated) ===== */
function wireEvents() {
  photoCropper = createImageCropper({
    overlay: document.getElementById("photo-crop-overlay"),
    canvas: document.getElementById("photo-crop-canvas"),
    zoomRange: document.getElementById("photo-zoom-range"),
    zoomOutButton: document.getElementById("photo-zoom-out"),
    zoomInButton: document.getElementById("photo-zoom-in"),
    cancelButton: document.getElementById("photo-crop-cancel"),
    applyButton: document.getElementById("photo-crop-apply"),
    status: document.getElementById("photo-crop-status"),
    onConfirm(dataUrl) {
      if (!pendingPhotoTarget) return;
      const { categoryId, itemId } = pendingPhotoTarget;
      pendingPhotoTarget = null;
      pendingPhotoTrigger = null;
      moveOptionalSectionToDraft(categoryId);
      store.applyUpdate(categoryId, itemId, "image", dataUrl);
      patchOrRender(categoryId, itemId);
      sync.updateProduct(categoryId, itemId, "image", dataUrl);
      requestAnimationFrame(() => {
        document.querySelector(
          `.menu-card[data-item-id="${CSS.escape(itemId)}"] .admin-photo-overlay`
        )?.focus();
      });
    },
    onCancel() {
      pendingPhotoTarget = null;
      pendingPhotoTrigger = null;
    },
  });

  // Login button toggles modal open, or logs out if already admin.
  document.getElementById("owner-login-btn")?.addEventListener("click", () => {
    if (isAdmin) {
      leaveEditMode();
    } else {
      openLoginModal();
    }
  });

  document.getElementById("owner-exit-btn")?.addEventListener("click", leaveEditMode);

  document.querySelector("#main-nav .logo")?.addEventListener("click", (event) => {
    if (isAdmin) event.preventDefault();
  });

  document.getElementById("login-cancel-btn")?.addEventListener("click", closeLoginModal);
  document.getElementById("login-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLoginModal();
  });

  document.getElementById("delete-cancel-btn")?.addEventListener("click", () => closeDeleteModal());
  document.getElementById("delete-confirm-btn")?.addEventListener("click", confirmDelete);
  document.getElementById("delete-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  document.addEventListener("keydown", (e) => {
    const deleteOverlay = document.getElementById("delete-modal-overlay");
    const loginOverlay = document.getElementById("login-modal-overlay");
    const overlay = !deleteOverlay?.hidden
      ? deleteOverlay
      : !loginOverlay?.hidden
        ? loginOverlay
        : null;
    if (!overlay) return;

    if (e.key === "Escape") {
      e.preventDefault();
      if (overlay === deleteOverlay) closeDeleteModal();
      else closeLoginModal();
      return;
    }

    if (e.key === "Tab") {
      const focusable = [...overlay.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
      )];
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
    const input = document.getElementById("login-password-input");
    const error = document.getElementById("login-error");
    const password = input.value;
    if (!password.trim()) {
      if (error) error.textContent = "Enter the site password.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    if (error) error.textContent = "";
    input.setAttribute("aria-invalid", "false");
    const submitButton = e.currentTarget.querySelector("button[type='submit']");
    if (submitButton) submitButton.disabled = true;
    const sent = sync.sendAuth(password);
    if (!sent) {
      if (submitButton) submitButton.disabled = false;
      if (error) error.textContent = "Live connection is still starting. Please try again.";
      input.setAttribute("aria-invalid", "true");
      input.focus();
    }
  });

  document.getElementById("login-password-input")?.addEventListener("input", (e) => {
    if (!e.target.value) return;
    e.target.setAttribute("aria-invalid", "false");
    const error = document.getElementById("login-error");
    if (error) error.textContent = "";
  });

  // Hidden file input used for photo uploads.
  document.getElementById("admin-photo-input")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !pendingPhotoTarget || !photoCropper) {
      pendingPhotoTarget = null;
      pendingPhotoTrigger = null;
      return;
    }

    try {
      clearNotifications();
      await photoCropper.open(file, pendingPhotoTrigger);
    } catch (err) {
      showToast(err.message || "Could not process that photo.");
      pendingPhotoTarget = null;
      pendingPhotoTrigger = null;
    }
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
      section.querySelector(
        ".owner-state-btn, .owner-jump-btn, [data-field='category-eyebrow']"
      )?.focus({ preventScroll: true });
      return;
    }

    const visibilityBtn = e.target.closest('[data-action="toggle-section-visibility"]');
    if (visibilityBtn) {
      const categoryId = visibilityBtn.dataset.category;
      const category = store.getCategory(categoryId);
      if (!category || category.id !== "extras") return;
      const isVisible = category.isVisible === false;
      store.applyCategoryVisibility(categoryId, isVisible);
      renderCategoryById(categoryId);
      sync.setCategoryVisibility(categoryId, isVisible);
      if (isVisible) showToast("The optional section is now live for visitors.");
      requestAnimationFrame(() => {
        document.querySelector(
          `.owner-state-btn[data-action="toggle-section-visibility"][data-category="${CSS.escape(categoryId)}"]`
        )?.focus();
      });
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
      moveOptionalSectionToDraft(addBtn.dataset.category);
      sync.addProduct(addBtn.dataset.category);
      return;
    }

    const photoBtn = e.target.closest('[data-action="change-photo"]');
    if (photoBtn) {
      pendingPhotoTarget = { categoryId: photoBtn.dataset.category, itemId: photoBtn.dataset.item };
      pendingPhotoTrigger = photoBtn;
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
      reconcileMarketHash();
      sync.toggleCategory(categoryId);
      showToast(newIsOpen ? "📣 Market is now open — live for everyone." : "Market closed.");
      if (newIsOpen) celebrateMarketOpen();
      requestAnimationFrame(() => {
        document.querySelector(
          `.owner-state-btn[data-action="toggle-market"][data-category="${CSS.escape(categoryId)}"]`
        )?.focus();
      });
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

  // Delegated commit of price/description/stock/name fields.
  document.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    if (["category-eyebrow", "category-title", "category-subtitle"].includes(field)) {
      const categoryId = e.target.dataset.category;
      const category = store.getCategory(categoryId);
      const categoryField = field.replace("category-", "");
      const value = e.target.value.trim();
      if (!category || category.id !== "extras" || !value) {
        if (category) e.target.value = category[categoryField] || "";
        return;
      }
      moveOptionalSectionToDraft(categoryId, { renderSection: false });
      store.applyCategoryUpdate(categoryId, categoryField, value);
      sync.updateCategory(categoryId, categoryField, value);
      return;
    }

    if (field !== "price" && field !== "description" && field !== "stock" && field !== "name") return;

    const { category, item } = e.target.dataset;

    if (field === "stock") {
      const current = store.getItem(category, item);
      const newValue = normalizeStock(e.target.value);
      if (current) queueStockChange(category, item, newValue);
      return;
    }

    if (field === "name") {
      const newValue = e.target.value.trim();
      if (!newValue) {
        e.target.value = store.getItem(category, item)?.name || "";
        return;
      }
      moveOptionalSectionToDraft(category, { renderSection: false });
      store.applyUpdate(category, item, "name", newValue);
      const card = e.target.closest(".menu-card");
      const ribbon = card?.querySelector(".card-ribbon");
      const image = card?.querySelector(".card-img-wrap img");
      const photoButton = card?.querySelector(".admin-photo-overlay");
      const deleteLabel = card?.querySelector(".admin-delete-btn .sr-only");
      const likeButton = card?.querySelector(".like-btn");
      const likeLabel = likeButton?.querySelector(".sr-only");
      const likeCount = Number(likeButton?.querySelector(".like-count")?.textContent) || 0;
      const stockMinusLabel = card?.querySelector('[data-action="stock-minus"] .sr-only');
      const stockPlusLabel = card?.querySelector('[data-action="stock-plus"] .sr-only');
      const stockStatus = card?.querySelector("[data-stock-status]");
      const updatedItem = store.getItem(category, item);
      if (ribbon) ribbon.textContent = newValue;
      if (image) image.alt = newValue;
      if (photoButton) photoButton.setAttribute("aria-label", `Change photo for ${newValue}`);
      if (deleteLabel) deleteLabel.textContent = `Delete ${newValue}`;
      if (likeButton) likeButton.dataset.name = newValue;
      if (likeLabel) {
        likeLabel.textContent = likeButton.matches("button")
          ? `${likeButton.getAttribute("aria-pressed") === "true" ? "Unlike" : "Like"} ${newValue}, ${likeCount} ${likeCount === 1 ? "like" : "likes"}`
          : ` ${likeCount === 1 ? "like" : "likes"} for ${newValue}`;
      }
      if (stockMinusLabel) stockMinusLabel.textContent = `Record one ${newValue} sold`;
      if (stockPlusLabel) stockPlusLabel.textContent = `Add one ${newValue} back`;
      if (stockStatus) {
        stockStatus.textContent = typeof updatedItem?.stock === "number"
          ? `${updatedItem.stock} ${newValue} in stock`
          : `Stock has not been set for ${newValue}`;
      }
      sync.updateProduct(category, item, "name", newValue);
      return;
    }

    if (field === "price") {
      const raw = e.target.value.trim();
      const parsed = Number(raw);
      const isValid = raw !== "" && Number.isFinite(parsed) && parsed >= 0;
      if (!isValid) {
        // Empty/negative/non-numeric price reverts to the last saved value,
        // matching the name field, instead of silently coercing to R0.
        e.target.value = String(store.getItem(category, item)?.price ?? 0);
        return;
      }
      moveOptionalSectionToDraft(category, { renderSection: false });
      store.applyUpdate(category, item, "price", parsed);
      e.target.value = String(parsed);
      sync.updateProduct(category, item, "price", parsed);
      return;
    }

    const value = e.target.value;
    moveOptionalSectionToDraft(category, { renderSection: false });
    store.applyUpdate(category, item, field, value);
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
      reconcileMarketHash();
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
    if (msg.isVisible) showToast("The optional section is now live for visitors.");
  });

  sync.on("category-update", (msg) => {
    store.applyCategoryUpdate(msg.categoryId, msg.field, msg.value);
    renderCategoryById(msg.categoryId);
  });

  sync.on("product-add", (msg) => {
    store.applyAdd(msg.categoryId, msg.item);
    renderCategoryById(msg.categoryId);
    if (isAdmin) {
      requestAnimationFrame(() => {
        document.querySelector(
          `.menu-card[data-item-id="${CSS.escape(msg.item.id)}"] .name-input`
        )?.focus();
      });
    }
  });

  sync.on("product-remove", (msg) => {
    store.applyRemove(msg.categoryId, msg.itemId);
    renderCategoryById(msg.categoryId);
    if (isAdmin) {
      requestAnimationFrame(() => {
        document.getElementById(`add-item-${msg.categoryId}`)?.focus();
      });
    }
  });

  sync.on("auth-result", (msg) => {
    const submitBtn = document.querySelector("#login-form button[type='submit']");
    if (msg.success) {
      isAdmin = true;
      sessionStorage.setItem("khayaKosAdminPw", document.getElementById("login-password-input").value);
      closeLoginModal({ restoreFocus: false });
      updateLoginButton();
      render();
      window.scrollTo({ top: 0, behavior: "auto" });
      requestAnimationFrame(() => document.getElementById("owner-exit-btn")?.focus());
    } else {
      const error = document.getElementById("login-error");
      if (error) error.textContent = "Incorrect password.";
      const input = document.getElementById("login-password-input");
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      sessionStorage.removeItem("khayaKosAdminPw");
    }
    if (submitBtn) submitBtn.disabled = false;
  });

  sync.on("error", (msg) => {
    const loginOverlay = document.getElementById("login-modal-overlay");
    if (loginOverlay && !loginOverlay.hidden) {
      const error = document.getElementById("login-error");
      const input = document.getElementById("login-password-input");
      const submitButton = document.querySelector("#login-form button[type='submit']");
      if (error) error.textContent = msg.message || "Could not sign in. Please try again.";
      if (submitButton) submitButton.disabled = false;
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      return;
    }
    showToast(msg.message || "Something went wrong.");
  });

  sync.connect();
}

export const engine = {
  start() {
    render(); // paint instantly from the server-injected state
    marketHashGuard = initMarketHashGuard({
      getMarketAvailable: isMarketRouteAvailable,
    });
    wireEvents();
    wireSync();
    updateLoginButton();
  },
};
