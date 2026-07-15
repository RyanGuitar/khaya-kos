// Shared stock rules used by both the browser and server. Keeping these
// decisions free of DOM and WebSocket concerns makes the market's critical
// stock behaviour straightforward to verify with Node's built-in test runner.

export const STOCK_BATCH_DELAY = 1300;

export function normalizeStock(value) {
  return Math.max(0, Number(value) || 0);
}

export function applyStockDelta(currentStock, delta) {
  const current = typeof currentStock === "number" ? currentStock : 0;
  return Math.max(0, current + Number(delta));
}

export function createStockBatcher({
  delay = STOCK_BATCH_DELAY,
  schedule = setTimeout,
  cancel = clearTimeout,
  onChange,
  onFlush,
} = {}) {
  const pendingBatches = new Map();

  function flush(key) {
    const pending = pendingBatches.get(key);
    if (!pending) return;

    pendingBatches.delete(key);
    onFlush?.({
      key,
      categoryId: pending.categoryId,
      itemId: pending.itemId,
      originalStock: pending.originalStock,
      currentStock: pending.currentStock,
    });
  }

  function queue({ key, categoryId, itemId, originalStock, nextStock }) {
    let pending = pendingBatches.get(key);

    if (!pending) {
      pending = {
        categoryId,
        itemId,
        originalStock,
        currentStock: nextStock,
        timer: null,
      };
      pendingBatches.set(key, pending);
    } else {
      pending.currentStock = nextStock;
    }

    onChange?.({ key, categoryId, itemId, nextStock });

    cancel(pending.timer);
    pending.timer = schedule(() => flush(key), delay);
  }

  return {
    queue,
    flush,
    hasPending(key) {
      return pendingBatches.has(key);
    },
  };
}
