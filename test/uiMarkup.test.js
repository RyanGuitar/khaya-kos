import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../public/js/admin/engine.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../public/js/admin/sync.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");

test("delete confirmation uses an accessible custom dialog", () => {
  assert.match(indexHtml, /id="delete-modal-overlay"[^>]*hidden/);
  assert.match(indexHtml, /role="dialog"/);
  assert.match(indexHtml, /aria-modal="true"/);
  assert.match(indexHtml, /aria-labelledby="delete-modal-title"/);
  assert.match(indexHtml, /id="delete-cancel-btn"/);
  assert.match(indexHtml, /id="delete-confirm-btn"/);
});

test("product deletion no longer invokes the browser-native confirm dialog", () => {
  assert.doesNotMatch(engineSource, /\bconfirm\s*\(/);
  assert.match(engineSource, /openDeleteModal\(category, item, deleteBtn\)/);
  assert.match(engineSource, /sync\.removeProduct\(categoryId, itemId\)/);
});

test("owner login and upload controls have accessible names", () => {
  assert.match(indexHtml, /<label class="login-field-label" for="login-password-input">Site password<\/label>/);
  assert.match(indexHtml, /id="admin-photo-input"[^>]*aria-label="Choose a new product photo"/);
});

test("the logo uses its complete visible text as its accessible name", () => {
  assert.match(indexHtml, /<a href="index\.html" class="logo">/);
  assert.doesNotMatch(indexHtml, /class="logo"[^>]*aria-label=/);
});

test("landing copy prioritizes all-week ordering and keeps the Saturday stall secondary", () => {
  assert.match(indexHtml, /<span class="logo-sub">Gazebo Valley<\/span>/);
  assert.match(indexHtml, /Available to order all week/);
  assert.match(indexHtml, /Freshly made,<br>just for you/);
  assert.match(indexHtml, /Browse the Full Menu/);
  assert.match(indexHtml, /Saturday stall closed/);
  assert.match(indexHtml, /Gazebo Valley opens on Saturdays\./);
  assert.doesNotMatch(indexHtml, />💬 Order on WhatsApp</);
  assert.doesNotMatch(indexHtml, /Saterdag Market Stall|Saterdag Menu/);
});

test("the decorative quote strip is removed from the route to the full menu", () => {
  assert.doesNotMatch(indexHtml, /class="chalk-strip"/);
  assert.doesNotMatch(indexHtml, /Vars gemaak met die beste bestandele/);
});

test("optional section visibility remains an authenticated server mutation", () => {
  assert.match(syncSource, /type: "category-visibility", categoryId, isVisible/);
  assert.match(serverSource, /case "category-visibility"/);
  assert.match(serverSource, /if \(!ws\.isAdmin\)/);
  assert.match(serverSource, /isOptionalCategory\(category\)/);
  assert.match(serverSource, /typeof data\.isVisible !== "boolean"/);
});

test("custom section lifecycle remains owner-authorized and live-synchronized", () => {
  for (const type of ["category-update", "category-add", "category-remove"]) {
    assert.match(serverSource, new RegExp(`case "${type}"`));
  }
  assert.match(syncSource, /type: "category-update", categoryId, field, value/);
  assert.match(syncSource, /type: "category-add"/);
  assert.match(syncSource, /type: "category-remove", categoryId/);
  assert.match(serverSource, /optionalCount >= 8/);
  assert.match(serverSource, /category\.id === "extras"/);
});

test("edit mode exposes a focused owner shell and accessible exit control", () => {
  assert.match(indexHtml, /id="edit-mode-label"[^>]*hidden>Owner edit mode/);
  assert.match(indexHtml, /id="owner-exit-btn"[^>]*hidden>Exit edit mode/);
  assert.match(indexHtml, /id="owner-section-manager"[^>]*hidden/);
  assert.match(indexHtml, /data-action="add-section"/);
  assert.match(indexHtml, /id="section-delete-modal-overlay"[^>]*hidden/);
});

test("owner section controls use plain labels without arrow decoration", () => {
  assert.match(indexHtml, /id="menu-owner-controls"/);
  assert.match(indexHtml, /id="extras-owner-controls"/);
  assert.doesNotMatch(engineSource, /Show fewer ↑|menu items ↓/);
});
