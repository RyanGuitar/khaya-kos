import test from "node:test";
import assert from "node:assert/strict";

import {
  STOCK_BATCH_DELAY,
  applyStockDelta,
  createStockBatcher,
  normalizeStock,
} from "../public/js/admin/stockLogic.js";

function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map();

  function schedule(callback, delay) {
    const id = nextId++;
    tasks.set(id, { callback, runAt: now + delay });
    return id;
  }

  function cancel(id) {
    tasks.delete(id);
  }

  function advance(milliseconds) {
    const target = now + milliseconds;

    while (true) {
      const due = [...tasks.entries()]
        .filter(([, task]) => task.runAt <= target)
        .sort((a, b) => a[1].runAt - b[1].runAt || a[0] - b[0])[0];

      if (!due) break;
      const [id, task] = due;
      tasks.delete(id);
      now = task.runAt;
      task.callback();
    }

    now = target;
  }

  return { schedule, cancel, advance };
}

test("normalizes direct stock input and clamps it at zero", () => {
  assert.equal(normalizeStock("7"), 7);
  assert.equal(normalizeStock(-3), 0);
  assert.equal(normalizeStock("not-a-number"), 0);
  assert.equal(normalizeStock(""), 0);
});

test("applies stock deltas atomically without crossing below zero", () => {
  assert.equal(applyStockDelta(5, -2), 3);
  assert.equal(applyStockDelta(2, -10), 0);
  assert.equal(applyStockDelta(null, 4), 4);
});

test("rapid changes become one batch and restart the 1.3-second window", () => {
  const clock = createFakeClock();
  const changes = [];
  const flushes = [];
  const batcher = createStockBatcher({
    schedule: clock.schedule,
    cancel: clock.cancel,
    onChange: (change) => changes.push(change.nextStock),
    onFlush: (batch) => flushes.push(batch),
  });

  batcher.queue({
    key: "market:pies",
    categoryId: "market",
    itemId: "pies",
    originalStock: 5,
    nextStock: 4,
  });
  clock.advance(1000);
  batcher.queue({
    key: "market:pies",
    categoryId: "market",
    itemId: "pies",
    originalStock: 4,
    nextStock: 3,
  });

  clock.advance(STOCK_BATCH_DELAY - 1);
  assert.deepEqual(flushes, []);
  assert.equal(batcher.hasPending("market:pies"), true);

  clock.advance(1);
  assert.deepEqual(changes, [4, 3]);
  assert.equal(flushes.length, 1);
  assert.equal(flushes[0].originalStock, 5);
  assert.equal(flushes[0].currentStock, 3);
  assert.equal(flushes[0].currentStock - flushes[0].originalStock, -2);
  assert.equal(batcher.hasPending("market:pies"), false);
});

test("zero is not finalized as sold out before the correction window", () => {
  const clock = createFakeClock();
  let displayedSoldOut = false;
  const batcher = createStockBatcher({
    schedule: clock.schedule,
    cancel: clock.cancel,
    onChange({ nextStock }) {
      if (nextStock > 0) displayedSoldOut = false;
      // At zero the engine defers the sold-out presentation.
    },
    onFlush({ currentStock }) {
      displayedSoldOut = currentStock === 0;
    },
  });

  batcher.queue({
    key: "market:last-pie",
    categoryId: "market",
    itemId: "last-pie",
    originalStock: 1,
    nextStock: 0,
  });

  clock.advance(STOCK_BATCH_DELAY - 1);
  assert.equal(displayedSoldOut, false);

  clock.advance(1);
  assert.equal(displayedSoldOut, true);
});

test("correcting zero before the window expires avoids sold-out", () => {
  const clock = createFakeClock();
  let displayedSoldOut = false;
  const flushes = [];
  const batcher = createStockBatcher({
    schedule: clock.schedule,
    cancel: clock.cancel,
    onChange({ nextStock }) {
      if (nextStock > 0) displayedSoldOut = false;
    },
    onFlush(batch) {
      displayedSoldOut = batch.currentStock === 0;
      flushes.push(batch);
    },
  });

  batcher.queue({
    key: "market:last-pie",
    categoryId: "market",
    itemId: "last-pie",
    originalStock: 1,
    nextStock: 0,
  });
  clock.advance(800);
  batcher.queue({
    key: "market:last-pie",
    categoryId: "market",
    itemId: "last-pie",
    originalStock: 0,
    nextStock: 1,
  });

  clock.advance(STOCK_BATCH_DELAY);
  assert.equal(flushes.length, 1);
  assert.equal(flushes[0].originalStock, 1);
  assert.equal(flushes[0].currentStock, 1);
  assert.equal(displayedSoldOut, false);
});
