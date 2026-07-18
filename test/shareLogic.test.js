import test from "node:test";
import assert from "node:assert/strict";
import { formatShareCount, performShare } from "../public/js/modules/share.js";

const payload = { url: "https://example.com/", title: "Example", text: "Share this" };

test("a completed native share is counted without copying", async () => {
  let copies = 0;
  const result = await performShare(payload, {
    share: async () => {},
    copy: async () => { copies += 1; },
  });

  assert.equal(result, "shared");
  assert.equal(copies, 0);
});

test("closing the native share sheet is not counted and does not copy", async () => {
  let copies = 0;
  const abortError = new Error("cancelled");
  abortError.name = "AbortError";
  const result = await performShare(payload, {
    share: async () => { throw abortError; },
    copy: async () => { copies += 1; },
  });

  assert.equal(result, "cancelled");
  assert.equal(copies, 0);
});

test("an unavailable or failed native share falls back to copying", async () => {
  let copiedUrl = null;
  const result = await performShare(payload, {
    share: async () => { throw new Error("unsupported"); },
    copy: async (url) => { copiedUrl = url; },
  });

  assert.equal(result, "copied");
  assert.equal(copiedUrl, payload.url);
});

test("share counters stay compact without changing button width", () => {
  assert.equal(formatShareCount(0), "0");
  assert.equal(formatShareCount(999), "999");
  assert.equal(formatShareCount(1284), "1.2K");
  assert.equal(formatShareCount(15420), "15K");
});
