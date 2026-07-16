import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const notFoundHtml = await readFile(new URL("../public/404.html", import.meta.url), "utf8");
const engineSource = await readFile(new URL("../public/js/admin/engine.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../public/js/admin/renderer.js", import.meta.url), "utf8");
const cropperSource = await readFile(new URL("../public/js/admin/imageCropper.js", import.meta.url), "utf8");
const imageUtilsSource = await readFile(new URL("../public/js/admin/imageUtils.js", import.meta.url), "utf8");
const syncSource = await readFile(new URL("../public/js/admin/sync.js", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const mobileMenuSource = await readFile(new URL("../public/js/modules/mobileMenu.js", import.meta.url), "utf8");
const responsiveContract = stylesSource.slice(stylesSource.indexOf("RESPONSIVE CONTRACT"));
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

test("primary navigation and owner login expose complete keyboard semantics", () => {
  assert.match(indexHtml, /<nav id="main-nav" aria-label="Primary navigation">/);
  assert.match(indexHtml, /id="mobile-menu"[^>]*aria-controls="nav-list"/s);
  assert.match(indexHtml, /class="skip-link" href="#main-content"/);
  assert.match(indexHtml, /<main id="main-content" tabindex="-1">/);
  assert.match(indexHtml, /class="login-modal" role="dialog" aria-modal="true"/);
  assert.match(indexHtml, /id="login-error" aria-live="polite"/);
  assert.match(mobileMenuSource, /event\.key === 'Escape'/);
  assert.match(mobileMenuSource, /event\.key !== 'Tab'/);
  assert.match(mobileMenuSource, /function|const setMenuIsolation/);
  assert.match(mobileMenuSource, /element\.inert = true/);
  assert.match(engineSource, /document\.body\.classList\.add\("dialog-open"\)/);
});

test("landmarks, dialogs, and live controls remain accessible in every interaction mode", () => {
  assert.ok(indexHtml.indexOf('id="owner-login-btn"') < indexHtml.indexOf('<main id="main-content"'));
  assert.match(indexHtml, /<main id="main-content" tabindex="-1">[\s\S]*?<header class="hero" id="hero">/);
  assert.match(indexHtml, /id="owner-workspace-title" hidden>Owner edit mode<\/h1>/);
  assert.match(indexHtml, /id="login-password-input"[^>]*required[^>]*aria-invalid="false"/s);
  assert.match(engineSource, /function setModalIsolation/);
  assert.match(cropperSource, /function setModalIsolation/);
  assert.match(rendererSource, /data-stock-status aria-live="polite"/);
  assert.match(rendererSource, /sold-out-stamp" aria-hidden="true"/);
  assert.match(engineSource, /prefers-reduced-motion: reduce/);
});

test("the responsive contract is mobile-first and derives fixed geometry from shared tokens", () => {
  assert.notEqual(responsiveContract.length, 0);
  assert.match(indexHtml, /viewport-fit=cover/);
  assert.match(stylesSource, /--nav-safe-height:/);
  assert.match(stylesSource, /--page-gutter:/);
  assert.match(stylesSource, /--floating-size:/);
  assert.match(responsiveContract, /\.menu-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, min\(100%, 440px\)\)/s);
  assert.match(responsiveContract, /@media screen and \(min-width: 720px\)/);
  assert.match(responsiveContract, /@media screen and \(min-width: 1100px\)/);
  assert.match(responsiveContract, /@media screen and \(min-width: 860px\) and \(max-width: 1279px\)/);
  assert.match(responsiveContract, /@media screen and \(min-width: 1136px\)/);
  assert.match(responsiveContract, /body:not\(\.admin-mode\) \.menu-grid\s*\{[^}]*repeat\(3, minmax\(0, 384px\)\)/s);
  assert.match(responsiveContract, /body\.admin-mode \.menu-grid\s*\{[^}]*repeat\(2, minmax\(0, 520px\)\)/s);
  assert.match(responsiveContract, /--floating-size:\s*66px/);
  assert.match(responsiveContract, /\.whatsapp-float,\s*\.owner-login-btn\s*\{[^}]*height:\s*var\(--floating-size\)/s);
  assert.match(responsiveContract, /\.name-input,[\s\S]*\.login-modal input\[type="password"\][\s\S]*font-size:\s*16px/);
});

test("responsive edge cases cover display cutouts, short landscape, and the 404 page", () => {
  assert.match(responsiveContract, /padding-left:\s*max\(var\(--page-gutter\), env\(safe-area-inset-left\)\)/);
  assert.match(responsiveContract, /@media screen and \(max-width: 1099px\) and \(max-height: 560px\) and \(orientation: landscape\)/);
  assert.match(responsiveContract, /\.delete-modal\s*\{[^}]*overflow:\s*visible/s);
  assert.match(responsiveContract, /body\.admin-mode \.admin-photo-overlay\s*\{[^}]*align-items:\s*center[^}]*justify-content:\s*flex-end/s);
  assert.match(notFoundHtml, /viewport-fit=cover/);
  assert.doesNotMatch(notFoundHtml, /user-scalable=no|maximum-scale/);
  assert.match(notFoundHtml, /styles\.css\?v=3\.19/);
  assert.match(notFoundHtml, /href="\/styles\.css\?v=3\.19"/);
  assert.match(notFoundHtml, /src="\/images\/favicon\.svg"/);
});

test("owner login recovers immediately while live sync is still connecting", () => {
  assert.match(syncSource, /sendAuth\(password\)\s*\{\s*return this\.send/);
  assert.match(syncSource, /return false/);
  assert.match(engineSource, /const sent = sync\.sendAuth\(password\)/);
  assert.match(engineSource, /Live connection is still starting\. Please try again\./);
});

test("renaming a product updates every visible and assistive card label in place", () => {
  assert.match(engineSource, /if \(image\) image\.alt = newValue/);
  assert.match(engineSource, /likeButton\.dataset\.name = newValue/);
  assert.match(engineSource, /stockMinusLabel\.textContent = `Record one \$\{newValue\} sold`/);
  assert.match(engineSource, /stockPlusLabel\.textContent = `Add one \$\{newValue\} back`/);
  assert.match(engineSource, /Stock has not been set for \$\{newValue\}/);
});

test("static Afrikaans phrases declare their pronunciation language", () => {
  assert.match(indexHtml, /class="hero-badge" lang="af"/);
  assert.match(indexHtml, /<p lang="af">Dankie dat jy plaaslik ondersteun/);
});

test("dynamic sections start hidden and only expose valid navigation targets", () => {
  assert.match(indexHtml, /id="market-nav-link" hidden/);
  assert.match(indexHtml, /id="extras-nav-link" hidden/);
  assert.match(indexHtml, /id="market" hidden/);
  assert.match(indexHtml, /id="extras" hidden/);
  assert.match(rendererSource, /navLink\.hidden = !isOpen/);
});

test("square product media reserves square intrinsic space before images decode", () => {
  const squareImages = rendererSource.match(/width="900" height="900"/g) || [];
  assert.equal(squareImages.length, 2);
});

test("optional content moves to draft on a real edit, not merely on field focus", () => {
  assert.doesNotMatch(engineSource, /addEventListener\("focusin"/);
  assert.match(engineSource, /moveOptionalSectionToDraft\(categoryId, \{ renderSection: false \}\)/);
  assert.match(engineSource, /moveOptionalSectionToDraft\(category, \{ renderSection: false \}\)/);
});

test("owner text edits preserve the active card instead of rebuilding the grid", () => {
  assert.match(engineSource, /const ribbon = card\?\.querySelector\("\.card-ribbon"\)/);
  assert.match(engineSource, /if \(ribbon\) ribbon\.textContent = newValue/);
  assert.match(engineSource, /moveOptionalSectionToDraft\(category, \{ renderSection: false \}\)/);
  assert.match(engineSource, /if \(field === "price"\) e\.target\.value = String\(value\)/);
});

test("owner photos use an accessible square crop and zoom workflow", () => {
  assert.match(indexHtml, /id="photo-crop-overlay"[^>]*hidden/);
  assert.match(indexHtml, /aria-labelledby="photo-crop-title"/);
  assert.match(indexHtml, /id="photo-crop-canvas"[^>]*width="720"[^>]*height="720"[^>]*tabindex="0"/);
  assert.match(indexHtml, /id="photo-zoom-range"[^>]*type="range"|type="range"[^>]*id="photo-zoom-range"/);
  assert.match(indexHtml, /id="photo-crop-cancel"/);
  assert.match(indexHtml, /id="photo-crop-apply"/);
  assert.match(stylesSource, /\.card-img-wrap\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(stylesSource, /#photo-crop-canvas\s*\{[^}]*touch-action:\s*none/s);
  assert.match(cropperSource, /pointerdown/);
  assert.match(cropperSource, /pinchSnapshot/);
  assert.match(cropperSource, /ArrowLeft/);
});

test("accepted crops are compressed before the existing product update is sent", () => {
  assert.match(imageUtilsSource, /CROP_OUTPUT_SIZE = 900/);
  assert.match(imageUtilsSource, /MAX_OUTPUT_BYTES = 350 \* 1024/);
  assert.match(imageUtilsSource, /canvas\.toDataURL\("image\/jpeg", quality\)/);
  assert.match(engineSource, /onConfirm\(dataUrl\)/);
  assert.match(engineSource, /store\.applyUpdate\(categoryId, itemId, "image", dataUrl\)/);
  assert.match(engineSource, /sync\.updateProduct\(categoryId, itemId, "image", dataUrl\)/);
  assert.doesNotMatch(engineSource, /fileToCompressedDataUrl/);
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
