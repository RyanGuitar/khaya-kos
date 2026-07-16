import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../public/js/admin/engine.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../public/js/admin/renderer.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../public/js/admin/sync.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const seedState = JSON.parse(await readFile(new URL("../data/products.json", import.meta.url), "utf8"));

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

test("ordering uses one accessible floating WhatsApp action instead of card-level links", () => {
  assert.match(indexHtml, /class="whatsapp-float"[^>]*aria-label="Order on WhatsApp"/);
  assert.doesNotMatch(rendererSource, /card-cta|Order on WhatsApp/);
});

test("the logo uses its complete visible text as its accessible name", () => {
  assert.match(indexHtml, /<a href="index\.html" class="logo">/);
  assert.doesNotMatch(indexHtml, /class="logo"[^>]*aria-label=/);
});

test("landing banner focuses exclusively on all-week made-to-order food", () => {
  const banner = indexHtml.match(
    /<div class="hero-sign">([\s\S]*?)<\/div>\s*<div id="hero-market-status"/
  )?.[1] || "";

  assert.match(indexHtml, /<span class="logo-sub">Gazebo Valley<\/span>/);
  assert.match(banner, /Available to order all week/);
  assert.match(banner, /Freshly made,<br>just for you/);
  assert.match(banner, /Browse the full menu below, then order your favourites on WhatsApp\./);
  assert.match(banner, /Browse the Full Menu/);
  assert.doesNotMatch(banner, /class="btn-primary"/);
  assert.doesNotMatch(banner, /Saturday|market|stall/i);
  assert.match(indexHtml, /<div id="hero-market-status" class="hero-market-status">/);
  assert.doesNotMatch(indexHtml, /<a href="#market" id="hero-market-status"/);
  assert.match(indexHtml, /<span class="status-kicker">Gazebo Valley · Closed<\/span>/);
  assert.match(indexHtml, /Saturday market availability goes live here/);
  assert.match(indexHtml, /remaining stock update in real time/);
  assert.match(indexHtml, /<p class="section-eyebrow">Available to order all week<\/p>/);
  assert.match(indexHtml, /<h2 class="section-title">The Full Menu<\/h2>/);
  assert.match(indexHtml, /Tap the heart to like it\. Likes update live/);
  assert.doesNotMatch(indexHtml, /Choose your favourites below, then order on WhatsApp/);
  assert.doesNotMatch(indexHtml, />💬 Order on WhatsApp</);
  assert.doesNotMatch(indexHtml, /Saterdag Market Stall|Saterdag Menu/);
});

test("legacy saved menu headings are refreshed without touching optional section names", () => {
  const start = serverSource.indexOf("function syncFixedMenuCopy(seed)");
  const end = serverSource.indexOf("\n}\n", start) + 3;
  const migration = serverSource.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(migration, /category\.id === "menu"/);
  assert.match(migration, /\["eyebrow", "title", "subtitle"\]/);
  assert.doesNotMatch(migration, /extras|optional/);
  assert.match(serverSource, /syncFixedMenuCopy\(seed\)/);
});

test("the decorative quote strip is removed from the route to the full menu", () => {
  assert.doesNotMatch(indexHtml, /class="chalk-strip"/);
  assert.doesNotMatch(indexHtml, /Vars gemaak met die beste bestandele/);
});

test("live product likes replace the removed generic trust section", () => {
  assert.doesNotMatch(indexHtml, /trust-section|Why Everyone Comes Back/);
  assert.match(rendererSource, /data-action="like"/);
});

test("the map does not repeat location details already stated in its heading", () => {
  assert.doesNotMatch(indexHtml, /class="map-details"/);
  assert.doesNotMatch(indexHtml, /🗓️ Saturdays/);
});

test("the live market links to the map and provides a state-controlled return path", () => {
  assert.match(indexHtml, /id="map-market-return"[^>]*hidden/);
  assert.match(indexHtml, /href="#market"[^>]*class="[^"]*map-market-return[^"]*"/);
  assert.match(rendererSource, /href="#find-us" class="market-live-banner market-route-link"/);
  assert.match(rendererSource, /mapReturn\.hidden = !isOpen/);
  assert.match(indexHtml, /class="market-live-banner market-route-link map-market-return"/);
  assert.match(indexHtml, /<span class="live-dot" aria-hidden="true"><\/span>\s*<strong>Back to the Live Market<\/strong>/);
});

test("optional section visibility remains an authenticated server mutation", () => {
  assert.match(syncSource, /type: "category-visibility", categoryId, isVisible/);
  assert.match(serverSource, /case "category-visibility"/);
  assert.match(serverSource, /if \(!ws\.isAdmin\)/);
  assert.match(serverSource, /category\?\.id !== "extras"/);
  assert.match(serverSource, /typeof data\.isVisible !== "boolean"/);
});

test("the free editor supports one hidden-by-default optional section", () => {
  const extras = seedState.categories.find((category) => category.id === "extras");

  assert.equal(extras.isVisible, false);
  assert.equal(extras.eyebrow, "Also at the Stall");
  assert.doesNotMatch(indexHtml, /custom-sections|owner-section-manager|Add another section/);
  assert.doesNotMatch(indexHtml, /section-delete-modal-overlay/);
  assert.doesNotMatch(serverSource, /case "category-add"|case "category-remove"/);
  assert.doesNotMatch(syncSource, /addCategory\(|removeCategory\(/);
  assert.match(serverSource, /consolidateOptionalSections\(\)/);
  assert.match(serverSource, /extras\.isVisible = false/);
});

test("all optional-section copy is owner-authorized and live-synchronized", () => {
  assert.match(serverSource, /case "category-update"/);
  assert.match(syncSource, /type: "category-update", categoryId, field, value/);
  assert.match(serverSource, /limits = \{ eyebrow: 80, title: 80, subtitle: 320 \}/);
  assert.match(rendererSource, /data-field="category-\$\{field\}"/);
  assert.match(rendererSource, /"Small heading"/);
  assert.match(rendererSource, /"Main heading"/);
  assert.match(rendererSource, /"Description"/);
  assert.match(rendererSource, /Draft — hidden from visitors/);
  assert.match(rendererSource, /Publish section/);
});

test("edit mode exposes a focused owner shell and accessible exit control", () => {
  assert.match(indexHtml, /id="edit-mode-label"[^>]*hidden>Owner edit mode/);
  assert.match(indexHtml, /id="owner-exit-btn"[^>]*hidden>Exit edit mode/);
  assert.doesNotMatch(indexHtml, /data-action="add-section"/);
  assert.doesNotMatch(indexHtml, /section-delete-modal-overlay/);
});

test("editing optional content moves it back to draft without routine popup noise", () => {
  assert.match(engineSource, /function moveOptionalSectionToDraft/);
  assert.match(engineSource, /sync\.setCategoryVisibility\(categoryId, false\)/);
  assert.match(serverSource, /function moveExtrasToDraft/);
  assert.match(serverSource, /moveExtrasToDraft\(category, ws\)/);
  assert.match(engineSource, /clearNotifications\(\)/);
  assert.match(engineSource, /if \(isAdmin\) clearNotifications\(\)/);
  assert.doesNotMatch(engineSource, /Adding new item|New item added|Section heading updated|Edit mode on|Logged out/);
  assert.match(engineSource, /optional section is now live for visitors/);
});

test("owner section controls use plain labels without arrow decoration", () => {
  assert.match(indexHtml, /id="menu-owner-controls"/);
  assert.match(indexHtml, /id="extras-owner-controls"/);
  assert.doesNotMatch(engineSource, /Show fewer ↑|menu items ↓/);
});
