# Khaya Kos Development Guide

## Architecture

- `server.js` owns the authoritative in-memory product state, serves `public/`, handles owner authentication, persists edits to Upstash Redis, and broadcasts accepted changes over WebSockets.
- `data/products.json` is seed data. It is used when Redis is unavailable or empty; new seed categories are backfilled without overwriting saved categories.
- `public/index.html` is the page shell. The server replaces `INITIAL_STATE_PLACEHOLDER` with current state before sending it.
- `public/js/main.js` initializes page modules and then starts the admin engine.
- `public/js/admin/store.js` holds the browser's local product state.
- `public/js/admin/sync.js` is the WebSocket transport and reconnect layer.
- `public/js/admin/engine.js` coordinates optimistic changes, owner controls, stock batching, sync events, and notifications.
- `public/js/admin/renderer.js` builds category/card markup and performs targeted DOM patches.
- `public/js/admin/imageCropper.js` provides the dependency-free pointer, pinch, keyboard, and zoom UI for square owner photo crops.
- `public/js/admin/imageUtils.js` prepares large source photos, owns crop geometry, and exports compressed 900×900 JPEG data URLs.
- `public/js/admin/stockLogic.js` contains dependency-free stock rules and batching.
- `public/js/admin/marketLogic.js` contains the market visibility rule.
- `public/styles.css` owns the rustic visual system and responsive/admin states.

## State and synchronisation

The server state is authoritative. The browser paints immediately from `window.__INITIAL_STATE__`, then replaces it with the `full-state` WebSocket message. Normal owner edits update the local store optimistically and are sent to the server. The server validates them, persists state, and broadcasts accepted changes.

Do not change existing WebSocket message names or payload shapes without an explicit compatibility plan. Owner-only mutations must remain server-authorized; hiding controls in the browser is not security.

Market stock uses atomic deltas. Rapid changes for one item are debounced for 1.3 seconds, retain the stock value from the start of the batch, and send one combined delta. Reaching zero uses the same window so the owner can correct an accidental tap before the sold-out treatment is finalized. Stock must never fall below zero.

The market item grid is visible to visitors only while `market.isOpen` is true. The owner must always be able to see it for setup.

The built-in `extras` category is the one supported optional product section. Its eyebrow, heading, description, items, and authoritative `isVisible` setting are owner-editable, persisted, and broadcast over WebSockets. It starts as a hidden draft, remains visible to the owner in edit mode, and must be explicitly published before visitors see it or its navigation link. Editing its copy or products automatically moves a published section back to draft. Legacy saved optional sections are consolidated into `extras` without dropping their products.

## Development conventions

- Use native ES modules and browser APIs; this project has no bundler or transpiler.
- Prefer small dependency-free functions for business rules.
- Preserve optimistic UI behavior and targeted DOM patching. Likes and stock should not trigger full-grid renders.
- Escape owner-editable text before inserting it into HTML.
- Keep uploaded images compressed before WebSocket transmission and persistence.
- Keep product media square. Owner uploads must pass through the crop editor; cancelling must not mutate product state.
- Preserve the distinction between `stock: null` (not configured) and `stock: 0` (sold out).
- Keep visitor likes public but owner mutations password-gated on the server.
- Avoid new runtime or development dependencies unless the value clearly outweighs the maintenance cost.

## Design constraints

Preserve the responsive rustic design, existing typography, colors, card styling, and mobile behavior. Test changes at the existing responsive breakpoints when touching markup or CSS. Respect `prefers-reduced-motion`, focus visibility, accessible labels, and the market's open/closed presentation.

Edit mode is intentionally a focused inventory workspace: retain the compact owner header and inventory sections, while hiding public-only landing, navigation menu, WhatsApp, trust, map, and footer content. Keep the market-opening confetti unless the user requests otherwise.

Do not make broad HTML or CSS rewrites as part of logic-only work.

## Verification

The local development preview is `http://localhost:10000/`. When the server is running, use this URL for browser-based visual and interaction checks.

Run these before handing off code changes:

```sh
npm run check
git diff --check
git status --short
```

- `npm test` runs the Node built-in unit tests.
- `npm run check:js` runs `node --check` over server, browser, script, and test JavaScript.
- `npm run check` runs both syntax checks and tests.

When behavior changes, add or update a focused test. Stock batching, correction timing, boundaries, product state mutations, and market visibility are high-priority regression areas.

## Operational constraints

- Do not deploy, commit, or push unless the user explicitly asks.
- Do not expose `ADMIN_PASSWORD`, Redis credentials, or other environment secrets.
- Do not edit generated dependencies or commit `node_modules`.
- Preserve the Redis fallback behavior and the current WebSocket architecture unless a task explicitly requires an architectural change.
