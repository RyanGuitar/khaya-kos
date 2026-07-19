import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDataUrl,
  hashImageContent,
  buildImageUrl,
  isValidImageHash,
  imageRedisKey,
} from "../lib/imageStore.js";

test("parseDataUrl extracts mime and base64 from a data URL", () => {
  assert.deepEqual(parseDataUrl("data:image/jpeg;base64,AAAA"), {
    mime: "image/jpeg",
    base64: "AAAA",
  });
});

test("parseDataUrl returns null for anything that isn't a data URL", () => {
  assert.equal(parseDataUrl("/uploads/abc123.jpg"), null);
  assert.equal(parseDataUrl("/images/placeholder.svg"), null);
  assert.equal(parseDataUrl(undefined), null);
  assert.equal(parseDataUrl(42), null);
});

test("hashImageContent is deterministic and content-addressed", () => {
  const hashA = hashImageContent("AAAA");
  const hashB = hashImageContent("AAAA");
  const hashC = hashImageContent("BBBB");

  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
  assert.equal(hashA.length, 32);
});

test("buildImageUrl and isValidImageHash round-trip for real hashes", () => {
  const hash = hashImageContent("some-photo-bytes");
  assert.equal(buildImageUrl(hash), `/uploads/${hash}.jpg`);
  assert.equal(isValidImageHash(hash), true);
});

test("isValidImageHash rejects malformed input", () => {
  assert.equal(isValidImageHash("not-a-hash"), false);
  assert.equal(isValidImageHash(""), false);
  assert.equal(isValidImageHash(null), false);
  assert.equal(isValidImageHash("../../etc/passwd"), false);
});

test("imageRedisKey namespaces hashes under the app's key prefix", () => {
  const hash = hashImageContent("photo-bytes");
  assert.equal(imageRedisKey(hash), `khaya-kos:image:${hash}`);
});
