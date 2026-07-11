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

async function loadState() {
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const stored = await redisGet(REDIS_KEY);
      if (stored) {
        state = JSON.parse(stored);
        console.log("✅ Loaded product state from Upstash Redis");
        return;
      }
      console.log(
        "ℹ️  No product state in Redis yet — seeding it from data/products.json"
      );
    } catch (err) {
      console.error(
        "⚠️  Could not reach Upstash Redis, falling back to seed file:",
        err.message
      );
    }
  }

  try {
    const raw = await fs.readFile(SEED_FILE, "utf-8");
    state = JSON.parse(raw);
    // If Redis is configured but was empty, seed it immediately so it's
    // the source of truth from the very first request onward.
    if (REDIS_URL && REDIS_TOKEN) {
      await persistState();
    }
  } catch (err) {
    console.error(
      "⚠️  Could not load seed file either, starting empty:",
      err.message
    );
    state = { categories: [] };
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
          err.message
        );
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
  console.log("🔗 Client connected");

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
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." })
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
        ];
        const item = findItem(categoryId, itemId);
        if (!item || !allowedFields.includes(field)) return;

        item[field] = field === "price" ? Number(value) || 0 : value;
        persistState();
        broadcast(
          {
            type: "product-update",
            categoryId,
            itemId,
            field,
            value: item[field],
          },
          ws
        );
        break;
      }

      case "product-add": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." })
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
        category.items.push(newItem);
        persistState();
        broadcast({
          type: "product-add",
          categoryId: data.categoryId,
          item: newItem,
        });
        break;
      }

      case "product-remove": {
        if (!ws.isAdmin) {
          ws.send(
            JSON.stringify({ type: "error", message: "Not authorized." })
          );
          return;
        }
        const category = findCategory(data.categoryId);
        if (!category) return;

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

const PORT = process.env.PORT || 10000;
loadState().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Khaya Kos server running on port ${PORT}`);
  });
});
