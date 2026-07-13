import express from "express";
import http from "http";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_DIR = path.join(__dirname, "public");
const SEED_FILE = path.join(__dirname, "data", "products.json");
const INDEX_TEMPLATE = path.join(PUBLIC_DIR, "index.html");

// Set this in Render's environment variables (Settings -> Environment).
// This fallback ONLY applies to local development — never rely on it in production.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "khayakos-dev-2026";
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    "⚠️  ADMIN_PASSWORD is not set — using the local dev fallback password. " +
      "Set a real ADMIN_PASSWORD environment variable before deploying."
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

if (!REDIS_URL || !REDIS_TOKEN) {
  console.warn(
    "⚠️  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set. " +
      "Falling back to the bundled seed file with NO persistence between restarts. " +
      "See README.md to set up the free Upstash database."
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
    const alreadyExists = state.categories.some((c) => c.id === seedCategory.id);
    if (!alreadyExists) {
      console.log(`ℹ️  Adding new "${seedCategory.id}" category (present in seed, missing from saved state)`);
      state.categories.push(seedCategory);
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
        backfillMissingCategories(seed);
        return;
      }
      console.log("ℹ️  No product state in Redis yet — seeding it from data/products.json");
    } catch (err) {
      console.error("⚠️  Could not reach Upstash Redis, falling back to seed file:", err.message);
    }
  }

  state = seed;
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
        console.error("❌ Failed to persist product state to Redis:", err.message);
      }
      resolve();
    }, 250);
  });
}

function findCategory(categoryId) {
  return state.categories.find((c) => c.id === categoryId);
}

function findItem(categoryId, itemId) {
  const category = findCategory(categoryId);
  if (!category) return null;
  return category.items.find((i) => i.id === itemId) || null;
}

/* =====================================================
   APP + STATIC FILES
   Only the /public folder is ever served — server.js,
   package.json, and data/products.json stay private.
   ===================================================== */
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

async function renderIndex(req, res) {
  try {
    const template = await fs.readFile(INDEX_TEMPLATE, "utf-8");
    const html = template.replace(
      "INITIAL_STATE_PLACEHOLDER",
      JSON.stringify(state).replace(/</g, "\\u003c")
    );
    res.set("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    console.error("Failed to render index.html:", err.message);
    res.status(500).send("Something went wrong loading the page.");
  }
}

// Both paths need the dynamic handler — express.static would otherwise
// serve the raw, unprocessed template for anyone who lands on /index.html
// directly (a bookmark, a shared link, or just typing the full URL).
app.get(["/", "/index.html"], renderIndex);

// index:false stops this from auto-serving public/index.html for "/" —
// that route is handled above so the live state can be injected first.
app.use(express.static(PUBLIC_DIR, { index: false }));

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

wss.on("connection", (ws) => {
  ws.isAdmin = false;
  ws.isAlive = true;
  console.log("🔗 Client connected");

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  // Every new visitor gets the current live state immediately.
  ws.send(JSON.stringify({ type: "full-state", data: state }));

  ws.on("message", (raw) => {
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
          ws.send(JSON.stringify({ type: "error", message: "Not authorized." }));
          return;
        }
        const { categoryId, itemId, field, value } = data;
        const allowedFields = ["name", "description", "price", "image", "ribbon", "stock"];
        const item = findItem(categoryId, itemId);
        if (!item || !allowedFields.includes(field)) return;

        item[field] = field === "price" || field === "stock" ? Number(value) || 0 : value;
        persistState();
        broadcast({ type: "product-update", categoryId, itemId, field, value: item[field] }, ws);
        break;
      }

      // Atomic +/- stock adjustment for fast tapping during a busy market —
      // the server (not the client) computes the new value so rapid taps
      // from a phone with a shaky connection can't drift out of sync.
      case "product-stock-delta": {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "error", message: "Not authorized." }));
          return;
        }
        const { categoryId, itemId, delta } = data;
        const item = findItem(categoryId, itemId);
        if (!item || typeof item.stock !== "number") return;

        item.stock = Math.max(0, item.stock + Number(delta));
        persistState();
        broadcast({ type: "product-update", categoryId, itemId, field: "stock", value: item.stock }, ws);
        break;
      }

      // Opens/closes a category's "live" state — currently only the market
      // category uses this, but it's written generically.
      case "category-toggle": {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "error", message: "Not authorized." }));
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

        category.isOpen = !category.isOpen;
        persistState();
        broadcast({ type: "category-toggle", categoryId: data.categoryId, isOpen: category.isOpen }, ws);
        break;
      }

      case "product-add": {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "error", message: "Not authorized." }));
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
        if (category.id === "market") newItem.stock = 0;
        category.items.push(newItem);
        persistState();
        broadcast({ type: "product-add", categoryId: data.categoryId, item: newItem });
        break;
      }

      // Anyone can like an item — deliberately NOT admin-gated. The client
      // sends delta:1 or delta:-1 (toggling), and the server does the
      // atomic math so simultaneous likes from different visitors can't
      // clobber each other.
      case "product-like": {
        const { categoryId, itemId, delta } = data;
        const item = findItem(categoryId, itemId);
        if (!item) return;

        item.likes = Math.max(0, (item.likes || 0) + (delta === -1 ? -1 : 1));
        persistState();
        broadcast({ type: "product-update", categoryId, itemId, field: "likes", value: item.likes }, ws);
        break;
      }

      case "product-remove": {
        if (!ws.isAdmin) {
          ws.send(JSON.stringify({ type: "error", message: "Not authorized." }));
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

        category.items = category.items.filter((i) => i.id !== data.itemId);
        persistState();
        broadcast({ type: "product-remove", categoryId: data.categoryId, itemId: data.itemId });
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
loadState().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Khaya Kos server running on port ${PORT}`);
  });
});
