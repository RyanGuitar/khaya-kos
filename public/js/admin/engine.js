// js/admin/engine.js
import { store } from "./store.js";
import { sync } from "./sync.js";
import { renderAll } from "./renderer.js";
import { fileToCompressedDataUrl } from "./imageUtils.js";

let isAdmin = false;
let pendingPhotoTarget = null; // { categoryId, itemId }

function render() {
  renderAll(store.state, isAdmin);
}

function showToast(message) {
  const toast = document.getElementById("admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
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
      render();
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
        render();
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
  });

  // Delegated commit of contentEditable name fields (focusout bubbles, unlike blur).
  document.addEventListener("focusout", (e) => {
    if (!e.target.matches("[data-editable][data-field='name']")) return;
    const { category, item } = e.target.dataset;
    const newValue = e.target.textContent.replace(/♡\s*$/, "").trim();
    const current = store.getItem(category, item);
    if (!current || current.name === newValue || !newValue) {
      render(); // snap back to the clean stored value either way
      return;
    }
    store.applyUpdate(category, item, "name", newValue);
    render();
    sync.updateProduct(category, item, "name", newValue);
  });

  // Prevent Enter from adding a line break in the single-line name field.
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("[data-editable][data-field='name']") && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
    }
  });

  // Delegated commit of price/description fields.
  document.addEventListener("change", (e) => {
    const field = e.target.dataset.field;
    if (field !== "price" && field !== "description") return;

    const { category, item } = e.target.dataset;
    const value = field === "price" ? Number(e.target.value) || 0 : e.target.value;

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
    store.applyUpdate(msg.categoryId, msg.itemId, msg.field, msg.value);
    render();
  });

  sync.on("product-add", (msg) => {
    store.applyAdd(msg.categoryId, msg.item);
    render();
    showToast("New item added.");
  });

  sync.on("product-remove", (msg) => {
    store.applyRemove(msg.categoryId, msg.itemId);
    render();
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
