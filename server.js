import express from "express";
import compression from "compression";
import http from "http";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { applyStockDelta } from "./public/js/admin/stockLogic.js";
import {
  parseDataUrl,
  hashImageContent,
  buildImageUrl,
  isValidImageHash,
  imageRedisKey,
} from "./lib/imageStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_DIR = path.join(__dirname, "public");
const SEED_FILE = path.join(__dirname, "data", "products.json");
const INDEX_TEMPLATE = path.join(PUBLIC_DIR, "index.html");
const SITE_ORIGIN = "https://khaya-kos.onrender.com";
const PAGE_METADATA = {
  home: {
    title: "Khaya Kos | Cakes & Homemade Food to Order",
    description:
      "Order homemade cakes, comforting cooked meals and freshly baked favourites from Khaya Kos in Pearly Beach.",
    url: `${SITE_ORIGIN}/`,
    image: `${SITE_ORIGIN}/images/og-home.jpg?v=2`,
    imageAlt:
      "Homemade chocolate and carrot cakes with comforting cooked dishes from Khaya Kos",
  },
  market: {
    title: "Khaya Kos Saturday Market | Live Stock — Gazebo Valley",
    description:
      "See what Khaya Kos brought to Gazebo Valley this Saturday and follow the remaining market stock live.",
    url: `${SITE_ORIGIN}/market`,
    image: `${SITE_ORIGIN}/images/og-market.jpg?v=2`,
    imageAlt:
      "Fresh Khaya Kos muffins, pies, samosas, scones and vetkoek for the Saturday market",
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Set this in Render's environment variables (Settings -> Environment).
// This fallback ONLY applies to local development — never rely on it in production.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "khayakos-dev-2026";
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    "⚠️  ADMIN_PASSWORD is not set — using the local dev fallback password. " +
      "Set a real ADMIN_PASSWORD environment variable before deploying.",
  );
}

/* =====================================================
   PERSISTENCE — Upstash Redis (free tier, REST API).
   Chosen specifically because, unlike Render's local disk
   (wiped on every restart/spin-down) or MongoDB
   Atlas/Supabase free tiers (auto-pause after inactivity),
   Upstash's free databases never pause and are reachable
   over plain HTTPS — a perfect fit for a server that spins
   down between visitors on Render's free tier.
   ===================================================== */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "khaya-kos:products";

// Per-connection rate limit for likes — generous enough that no real
// visitor would ever notice it, tight enough to stop a scripted spam loop.
const LIKE_RATE_LIMIT = 10;
const LIKE_RATE_WINDOW_MS = 5000;
const SHARE_TARGETS = new Set(["site", "market"]);
const SHARE_RATE_LIMIT = 6;
const SHARE_RATE_WINDOW_MS = 60000;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.warn(
    "⚠️  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. " +
      "Falling back to the bundled seed file with NO persistence between restarts. " +
      "See README.md to set up the free Upstash database.",
  );
}

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Redis GET failed: ${res.status}`);
  const { result } = await res.json();
  return result; // null if the key has never been set
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: value, // raw body avoids URL length/encoding limits for larger payloads
  });
  if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
}

/* =====================================================
   STATE — loaded once on boot (from Redis if configured,
   otherwise the bundled seed file), kept in memory as the
   live source of truth, written back to Redis on every edit.
   ===================================================== */
let state = { categories: [] };

async function loadSeed() {
  try {
    const raw = await fs.readFile(SEED_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("⚠️  Could not load seed file:", err.message);
    return { categories: [] };
  }
}

// If a brand-new category (e.g. "market") gets added to the seed file after
// the site has already been live and saving real edits to Redis, a plain
// Redis load would never see it — Redis is already non-empty, so the seed
// file is skipped entirely. This adds any category that exists in the seed
// but not in the saved state, without touching anything the owner has
// already edited.
function backfillMissingCategories(seed) {
  let changed = false;
  for (const seedCategory of seed.categories) {
    const alreadyExists = state.categories.some(
      (c) => c.id === seedCategory.id,
    );
    if (!alreadyExists) {
      console.log(
        `ℹ️  Adding new "${seedCategory.id}" category (present in seed, missing from saved state)`,
      );
      state.categories.push(seedCategory);
      changed = true;
    }
  }
  if (changed) persistState();
}

// New category-level settings must also reach sites whose product state was
// saved before the setting existed. Only missing settings are copied so an
// owner's saved choice is never overwritten during startup.
function backfillMissingCategorySettings(seed) {
  let changed = false;
  for (const seedCategory of seed.categories) {
    const savedCategory = state.categories.find(
      (category) => category.id === seedCategory.id,
    );
    if (!savedCategory) continue;

    for (const setting of [
      "isVisible",
      "kind",
      "eyebrow",
      "title",
      "subtitle",
    ]) {
      if (
        Object.hasOwn(seedCategory, setting) &&
        !Object.hasOwn(savedCategory, setting)
      ) {
        savedCategory[setting] = seedCategory[setting];
        changed = true;
      }
    }
  }
  if (changed) persistState();
}

// Share counts were added after the original persisted product schema. Keep
// existing Redis data compatible and sanitize any malformed legacy values.
function ensureShareCounts() {
  let changed = false;
  if (
    !state.shareCounts ||
    typeof state.shareCounts !== "object" ||
    Array.isArray(state.shareCounts)
  ) {
    state.shareCounts = {};
    changed = true;
  }
  for (const target of SHARE_TARGETS) {
    const value = Number(state.shareCounts[target]);
    const normalized = Number.isFinite(value)
      ? Math.max(0, Math.floor(value))
      : 0;
    if (state.shareCounts[target] !== normalized) {
      state.shareCounts[target] = normalized;
      changed = true;
    }
  }
  return changed;
}

// Menu headings are fixed visitor copy rather than owner-editable content.
// Refresh only this fixed category from the seed so legacy wording stored in
// Redis cannot reappear; optional section names remain entirely owner-managed.
function syncFixedMenuCopy(seed) {
  const seedMenu = seed.categories.find((category) => category.id === "menu");
  const savedMenu = state.categories.find((category) => category.id === "menu");
  if (!seedMenu || !savedMenu) return;

  let changed = false;
  for (const field of ["eyebrow", "title", "subtitle"]) {
    if (savedMenu[field] !== seedMenu[field]) {
      savedMenu[field] = seedMenu[field];
      changed = true;
    }
  }
  if (changed) persistState();
}

async function loadState() {
  const seed = await loadSeed();

  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const stored = await redisGet(REDIS_KEY);
      if (stored) {
        state = JSON.parse(stored);
        console.log("✅ Loaded product state from Upstash Redis");
        if (ensureShareCounts()) persistState();
        backfillMissingCategories(seed);
        backfillMissingCategorySettings(seed);
        syncFixedMenuCopy(seed);
        consolidateOptionalSections();
        return;
      }
      console.log(
        "ℹ️  No product state in Redis yet — seeding it from data/products.json",
      );
    } catch (err) {
      console.error(
        "⚠️  Could not reach Upstash Redis, falling back to seed file:",
        err.message,
      );
    }
  }

  state = seed;
  ensureShareCounts();
  consolidateOptionalSections();
  // If Redis is configured but was empty, seed it immediately so it's
  // the source of truth from the very first request onward.
  if (REDIS_URL && REDIS_TOKEN) {
    await persistState();
  }
}

let saveTimer = null;
function persistState() {
  return new Promise((resolve) => {
    // Small debounce so rapid successive edits don't burn Redis commands.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!REDIS_URL || !REDIS_TOKEN) {
        resolve();
        return;
      }
      try {
        await redisSet(REDIS_KEY, JSON.stringify(state));
      } catch (err) {
        console.error(
          "❌ Failed to persist product state to Redis:",
          err.message,
        );
      }
      resolve();
    }, 250);
  });
}

/* =====================================================
   IMAGE STORE — owner photos are stored once under a
   content hash (Redis key khaya-kos:image:<hash>) instead
   of inline in product state. State and broadcasts only
   ever carry the small /uploads/<hash>.jpg URL. A small
   in-memory cache avoids a Redis round trip for photos
   this instance has already seen.
   ===================================================== */
const imageMemoryCache = new Map(); // hash -> base64
const knownImageHashes = new Set(); // hashes confirmed persisted in Redis

async function ensureImageStored(hash, base64) {
  imageMemoryCache.set(hash, base64);
  if (knownImageHashes.has(hash)) return;
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      await redisSet(imageRedisKey(hash), base64);
    } catch (err) {
      console.error(
        `❌ Failed to persist image ${hash} to Redis:`,
        err.message,
      );
      return; // leave it out of knownImageHashes so a later save can retry
    }
  }
  knownImageHashes.add(hash);
}

// Converts a data URL to its stored /uploads/<hash>.jpg URL. Anything that
// isn't a data URL (already a URL, a placeholder path, etc.) passes through
// unchanged, so this is safe to call speculatively.
async function convertImageToUrl(value) {
  const parsed = parseDataUrl(value);
  if (!parsed) return value;
  const hash = hashImageContent(parsed.base64);
  await ensureImageStored(hash, parsed.base64);
  return buildImageUrl(hash);
}

async function loadImageBase64(hash) {
  if (imageMemoryCache.has(hash)) return imageMemoryCache.get(hash);
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const stored = await redisGet(imageRedisKey(hash));
    if (stored) {
      imageMemoryCache.set(hash, stored);
      knownImageHashes.add(hash);
    }
    return stored;
  } catch (err) {
    console.error(`❌ Failed to load image ${hash} from Redis:`, err.message);
    return null;
  }
}

// Photos uploaded before this change are still raw base64 data URLs sitting
// inline in saved state. Convert any that remain so every page load and
// full-state broadcast stops re-sending their bytes.
async function migrateInlineImages() {
  let changed = false;
  for (const category of state.categories) {
    for (const item of category.items || []) {
      if (typeof item.image === "string" && item.image.startsWith("data:")) {
        item.image = await convertImageToUrl(item.image);
        changed = true;
      }
    }
  }
  if (changed) {
    console.log(
      "✅ Migrated inline owner photo(s) to content-addressed image URLs",
    );
    await persistState();
  }
}

function findCategory(categoryId) {
  return state.categories.find((c) => c.id === categoryId);
}

function findItem(categoryId, itemId) {
  const category = findCategory(categoryId);
  if (!category) return null;
  return category.items.find((i) => i.id === itemId) || null;
}

function isOptionalCategory(category) {
  return category?.kind === "optional" || category?.id === "extras";
}

// Older saved state may contain several optional sections from the previous
// editor. Preserve every product by folding those items into the one supported
// optional section, then keep it hidden until the owner has reviewed the
// consolidated draft and explicitly publishes it.
function consolidateOptionalSections() {
  const extras = findCategory("extras");
  if (!extras) return false;

  const additionalSections = state.categories.filter(
    (category) => category.id !== "extras" && isOptionalCategory(category),
  );
  if (additionalSections.length === 0) return false;

  const extrasItems = Array.isArray(extras.items)
    ? extras.items
    : (extras.items = []);
  const itemIds = new Set(extrasItems.map((item) => item.id));
  for (const category of additionalSections) {
    for (const item of category.items || []) {
      if (itemIds.has(item.id)) item.id = crypto.randomUUID();
      itemIds.add(item.id);
      extrasItems.push(item);
    }
  }

  state.categories = state.categories.filter(
    (category) => category.id === "extras" || !isOptionalCategory(category),
  );
  extras.isVisible = false;
  console.log(
    "ℹ️  Consolidated legacy optional sections into the hidden extras draft",
  );
  persistState();
  return true;
}

/* =====================================================
   APP + STATIC FILES
   Only the /public folder is ever served — server.js,
   package.json, and data/products.json stay private.
   ===================================================== */
const app = express();
const server = http.createServer(app);
app.use(compression());

// perMessageDeflate compresses every WS frame (full-state, product-update,
// etc.) in transit — free bandwidth savings on the JSON payloads, no new
// dependency since it ships with the "ws" package.
const wss = new WebSocketServer({ server, perMessageDeflate: true });

async function renderIndex(req, res) {
  try {
    const template = await fs.readFile(INDEX_TEMPLATE, "utf-8");
    ensureShareCounts();
    const metadata =
      req.path === "/market" ? PAGE_METADATA.market : PAGE_METADATA.home;
    const html = template
      .replaceAll("PAGE_TITLE_PLACEHOLDER", escapeHtml(metadata.title))
      .replaceAll(
        "PAGE_DESCRIPTION_PLACEHOLDER",
        escapeHtml(metadata.description),
      )
      .replaceAll("PAGE_URL_PLACEHOLDER", escapeHtml(metadata.url))
      .replaceAll("PAGE_IMAGE_PLACEHOLDER", escapeHtml(metadata.image))
      .replaceAll("PAGE_IMAGE_ALT_PLACEHOLDER", escapeHtml(metadata.imageAlt))
      .replace("SITE_SHARE_COUNT_PLACEHOLDER", String(state.shareCounts.site))
      .replace(
        "MARKET_SHARE_COUNT_PLACEHOLDER",
        String(state.shareCounts.market),
      )
      .replace(
        "INITIAL_STATE_PLACEHOLDER",
        JSON.stringify(state).replace(/</g, "\\u003c"),
      );
    res.set("Content-Type", "text/html");
    // The page contains live state and server-rendered share counts. Never
    // reuse an old HTML response; long-lived caching remains limited to the
    // versioned static assets below.
    res.set("Cache-Control", "no-store");
    res.send(html);
  } catch (err) {
    console.error("Failed to render index.html:", err.message);
    res.status(500).send("Something went wrong loading the page.");
  }
}

// Both paths need the dynamic handler — express.static would otherwise
// serve the raw, unprocessed template for anyone who lands on /index.html
// directly (a bookmark, a shared link, or just typing the full URL).
app.get(["/", "/index.html", "/market"], renderIndex);

// index:false stops this from auto-serving public/index.html for "/" —
// that route is handled above so the live state can be injected first.
// maxAge caches static assets (SVGs, favicons, the seed placeholder
// photos) in the visitor's browser for a week — without this, recreating
// a card's <img> tag on every update can trigger a fresh network request
// for an image that hasn't changed at all, which costs real data on a
// mobile connection. Photos the owner uploads are embedded directly as
// base64 in the product data, not served as files, so they're unaffected
// by this either way. CSS and JavaScript must revalidate: the HTML and its
// behaviour/styles are deployed together, and serving a week-old script or
// stylesheet with fresh markup can leave controls unstyled or inert.
// Content-addressed owner photos. The hash IS the cache key: identical
// bytes always produce the same URL and different bytes always produce a
// new one, so this can be cached by every browser and CDN for a year with
// zero risk of ever serving stale content under an unchanged URL.
app.get("/uploads/:hash([a-f0-9]{32}).jpg", async (req, res) => {
  const { hash } = req.params;
  if (!isValidImageHash(hash)) {
    res.status(404).end();
    return;
  }
  const base64 = await loadImageBase64(hash);
  if (!base64) {
    res.status(404).end();
    return;
  }
  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(base64, "base64"));
});

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    maxAge: "7d",
    setHeaders(res, filePath) {
      if ([".css", ".js"].includes(path.extname(filePath))) {
        res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      }
    },
  }),
);

// Catch-all: anything that didn't match a route or a static file gets the
// branded 404 page instead of Express's raw default error text.
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, "404.html"));
});

/* =====================================================
   WEBSOCKET — real-time sync + password-gated editing
   ===================================================== */
function broadcast(message, exclude = null) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload);
    }
  });
}

function moveExtrasToDraft(category, exclude = null) {
  if (category?.id !== "extras" || category.isVisible === false) return false;
  category.isVisible = false;
  broadcast(
    { type: "category-visibility", categoryId: "extras", isVisible: false },
    exclude,
  );
  return true;
}

wss.on("connection", (ws) => {
  ws.isAdmin = false;
  ws.isAlive = true;
  console.log("🔗 Client connected");

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Every new visitor gets the current live state immediately.
  ws.send(JSON.stringify({ type: "full-state", data: state }));

  ws.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.type) {
      case "auth": {
        const success = data.password === ADMIN_PASSWORD;
        ws.isAdmin = success;
        ws.send(JSON.stringify({ type: "auth-result", success }));
        break;
      }

      case "product-update": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const { categoryId, itemId, field, value } = data;
        const allowedFields = [
          "name",
          "description",
          "price",
          "image",
          "ribbon",
          "stock",
        ];
        const category = findCategory(categoryId);
        const item = findItem(categoryId, itemId);
        if (!item || !allowedFields.includes(field)) return;

        moveExtrasToDraft(category, ws);
        let nextValue;
        if (field === "price" || field === "stock") {
          nextValue = Number(value) || 0;
        } else if (field === "image") {
          // The owner's browser already compressed this to a 900x900 JPEG
          // data URL. Store the bytes once under a content hash so state
          // and every future broadcast carry only a small URL, not the
          // photo itself.
          nextValue = await convertImageToUrl(value);
        } else {
          nextValue = value;
        }
        item[field] = nextValue;
        persistState();
        broadcast(
          {
            type: "product-update",
            categoryId,
            itemId,
            field,
            value: item[field],
          },
          ws,
        );
        break;
      }

      // Atomic +/- stock adjustment for fast tapping during a busy market —
      // the server (not the client) computes the new value so rapid taps
      // from a phone with a shaky connection can't drift out of sync.
      case "product-stock-delta": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const { categoryId, itemId, delta } = data;
        const item = findItem(categoryId, itemId);
        if (!item) return;

        item.stock = applyStockDelta(item.stock, delta);
        persistState();
        broadcast(
          {
            type: "product-update",
            categoryId,
            itemId,
            field: "stock",
            value: item.stock,
          },
          ws,
        );
        break;
      }

      // Opens/closes a category's "live" state — currently only the market
      // category uses this, but it's written generically.
      case "category-toggle": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

        category.isOpen = !category.isOpen;
        persistState();
        broadcast(
          {
            type: "category-toggle",
            categoryId: data.categoryId,
            isOpen: category.isOpen,
          },
          ws,
        );
        break;
      }

      case "category-visibility": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const category = findCategory(data.categoryId);
        if (category?.id !== "extras" || typeof data.isVisible !== "boolean")
          return;

        category.isVisible = data.isVisible;
        persistState();
        broadcast(
          {
            type: "category-visibility",
            categoryId: category.id,
            isVisible: category.isVisible,
          },
          ws,
        );
        break;
      }

      case "category-update": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const category = findCategory(data.categoryId);
        const limits = { eyebrow: 80, title: 80, subtitle: 320 };
        if (
          category?.id !== "extras" ||
          !Object.hasOwn(limits, data.field) ||
          typeof data.value !== "string"
        )
          return;
        const value = data.value.trim().slice(0, limits[data.field]);
        if (!value) return;

        moveExtrasToDraft(category, ws);
        category[data.field] = value;
        persistState();
        broadcast(
          {
            type: "category-update",
            categoryId: category.id,
            field: data.field,
            value,
          },
          ws,
        );
        break;
      }

      case "product-add": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

        const newItem = {
          id: crypto.randomUUID(),
          name: "New Item",
          description: "Add a short description here.",
          price: 0,
          image: "/images/placeholder.svg",
          ribbon: "navy",
        };
        if (category.id === "market") newItem.stock = null; // "not set up yet" — distinct from 0 ("sold out")
        moveExtrasToDraft(category, ws);
        category.items.push(newItem);
        persistState();
        broadcast({
          type: "product-add",
          categoryId: data.categoryId,
          item: newItem,
        });
        break;
      }

      // Anyone can like an item — deliberately NOT admin-gated. The client
      // sends delta:1 or delta:-1 (toggling), and the server does the
      // atomic math so simultaneous likes from different visitors can't
      // clobber each other.
      case "product-like": {
        // The client already has a cooldown on the button, but that's UX,
        // not security — this is the real backstop against a script just
        // hammering the socket directly.
        const now = Date.now();
        if (!ws.likeTimestamps) ws.likeTimestamps = [];
        ws.likeTimestamps = ws.likeTimestamps.filter(
          (t) => now - t < LIKE_RATE_WINDOW_MS,
        );
        if (ws.likeTimestamps.length >= LIKE_RATE_LIMIT) return;
        ws.likeTimestamps.push(now);

        const { categoryId, itemId, delta } = data;
        const item = findItem(categoryId, itemId);
        if (!item) return;

        item.likes = Math.max(0, (item.likes || 0) + (delta === -1 ? -1 : 1));
        persistState();
        broadcast(
          {
            type: "product-update",
            categoryId,
            itemId,
            field: "likes",
            value: item.likes,
          },
          ws,
        );
        break;
      }

      // Successful shares are public interactions, like likes. The client
      // sends this only after the native share promise resolves or the link
      // is copied. The server performs the authoritative increment and sends
      // the new value to every connected visitor, including the sharer.
      case "share-record": {
        if (!SHARE_TARGETS.has(data.target)) return;

        const now = Date.now();
        if (!ws.shareTimestamps) ws.shareTimestamps = [];
        ws.shareTimestamps = ws.shareTimestamps.filter(
          (timestamp) => now - timestamp < SHARE_RATE_WINDOW_MS,
        );
        if (ws.shareTimestamps.length >= SHARE_RATE_LIMIT) return;
        ws.shareTimestamps.push(now);

        ensureShareCounts();
        state.shareCounts[data.target] += 1;
        persistState();
        broadcast({
          type: "share-count",
          target: data.target,
          count: state.shareCounts[data.target],
        });
        break;
      }

      case "product-remove": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." }),
          );
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

        moveExtrasToDraft(category, ws);
        category.items = category.items.filter((i) => i.id !== data.itemId);
        persistState();
        broadcast({
          type: "product-remove",
          categoryId: data.categoryId,
          itemId: data.itemId,
        });
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

// Render's infrastructure (and mobile networks, corporate proxies, etc.)
// can silently drop a WebSocket connection that looks "idle" from the
// outside even though the app itself is fine — Render's own docs recommend
// this exact ping/pong pattern to detect that early and clean it up, rather
// than leaving a zombie connection that never gets real-time updates again.
const HEARTBEAT_INTERVAL = 30000;
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log("💔 Terminating unresponsive connection");
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on("close", () => clearInterval(heartbeatTimer));

const PORT = process.env.PORT || 10000;
loadState()
  .then(() => migrateInlineImages())
  .then(() => {
    server.listen(PORT, () => {
      console.log(`🚀 Khaya Kos server running on port ${PORT}`);
    });
  });
