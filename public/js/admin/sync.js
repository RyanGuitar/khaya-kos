// js/admin/sync.js
// Thin WebSocket wrapper. All real-time product sync and the password
// handshake flow through here. Reconnects automatically if the connection
// drops (e.g. Render free-tier server spinning back up, or a network-level
// timeout silently killing an idle-looking connection).

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 20000;

class Sync {
  constructor() {
    this.socket = null;
    this.handlers = {};
    this.isAdmin = false;
    this.reconnectDelay = BASE_RECONNECT_DELAY;
    this.reconnectTimer = null;
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  connect() {
    // Guard against ever having two live sockets at once (e.g. connect()
    // firing again while a previous connection attempt is still pending).
    clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log("✅ Connected to Khaya Kos live sync");
      this.reconnectDelay = BASE_RECONNECT_DELAY; // reset backoff on success
      // If the owner logged in earlier this session, re-authenticate
      // automatically so a reconnect doesn't boot them out of edit mode.
      const storedPassword = sessionStorage.getItem("khayaKosAdminPw");
      if (storedPassword) {
        this.sendAuth(storedPassword);
      }
    };

    this.socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const handler = this.handlers[data.type];
      if (handler) handler(data);
    };

    this.socket.onclose = () => {
      const delaySeconds = Math.round(this.reconnectDelay / 1000);
      console.log(`⚠️ Sync connection closed. Retrying in ${delaySeconds}s...`);
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
      // Exponential backoff — matches Render's documented guidance so a
      // degraded connection doesn't hammer the server with retries.
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
    };

    this.socket.onerror = () => {
      this.socket.close();
    };
  }

  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  sendAuth(password) {
    this.send({ type: "auth", password });
  }

  updateProduct(categoryId, itemId, field, value) {
    this.send({ type: "product-update", categoryId, itemId, field, value });
  }

  addProduct(categoryId) {
    this.send({ type: "product-add", categoryId });
  }

  removeProduct(categoryId, itemId) {
    this.send({ type: "product-remove", categoryId, itemId });
  }

  adjustStock(categoryId, itemId, delta) {
    this.send({ type: "product-stock-delta", categoryId, itemId, delta });
  }

  toggleCategory(categoryId) {
    this.send({ type: "category-toggle", categoryId });
  }

  setCategoryVisibility(categoryId, isVisible) {
    this.send({ type: "category-visibility", categoryId, isVisible });
  }

  updateCategory(categoryId, field, value) {
    this.send({ type: "category-update", categoryId, field, value });
  }

  addCategory() {
    this.send({ type: "category-add" });
  }

  removeCategory(categoryId) {
    this.send({ type: "category-remove", categoryId });
  }

  likeProduct(categoryId, itemId, delta) {
    this.send({ type: "product-like", categoryId, itemId, delta });
  }
}

export const sync = new Sync();
