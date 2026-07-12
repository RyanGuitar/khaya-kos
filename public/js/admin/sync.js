// js/admin/sync.js
// Thin WebSocket wrapper. All real-time product sync and the password
// handshake flow through here. Reconnects automatically if the connection
// drops (e.g. Render free-tier server spinning back up).

class Sync {
  constructor() {
    this.socket = null;
    this.handlers = {};
    this.isAdmin = false;
  }

  on(type, handler) {
    this.handlers[type] = handler;
  }

  connect() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}`;
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log("✅ Connected to Khaya Kos live sync");
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
      console.log("⚠️ Sync connection closed. Retrying in 3s...");
      setTimeout(() => this.connect(), 3000);
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
}

export const sync = new Sync();
