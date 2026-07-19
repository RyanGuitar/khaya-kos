// lib/imageStore.js
// Pure helpers for turning an owner-uploaded photo (a base64 data URL) into
// a content-addressed reference instead of a giant string sitting inline in
// product state. Every page load embeds full state in the HTML, and every
// WebSocket connection receives a full-state broadcast — before this,
// that meant re-sending every product photo's bytes on every single visit
// and every reconnect, which is what was burning through Render's free
// bandwidth allowance. Storing photos once under a hash and referencing
// them by URL means the browser fetches (and caches) each photo's bytes
// only once, no matter how many times state gets re-synced.
//
// Kept dependency-free (Node's built-in "crypto" only) and framework-free
// so it can be unit tested without a running server or Redis.

import crypto from "crypto";

const HASH_LENGTH = 32;
const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;
const HASH_PATTERN = new RegExp(`^[a-f0-9]{${HASH_LENGTH}}$`);

export function parseDataUrl(value) {
  if (typeof value !== "string") return null;
  const match = value.match(DATA_URL_PATTERN);
  if (!match) return null;
  return { mime: match[1], base64: match[2] };
}

export function hashImageContent(base64) {
  return crypto.createHash("sha256").update(base64).digest("hex").slice(0, HASH_LENGTH);
}

export function buildImageUrl(hash) {
  return `/uploads/${hash}.jpg`;
}

export function isValidImageHash(hash) {
  return typeof hash === "string" && HASH_PATTERN.test(hash);
}

export function imageRedisKey(hash) {
  return `khaya-kos:image:${hash}`;
}
