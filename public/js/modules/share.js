/* =====================================================
   Khaya Kos — Share Module
   Opens the native share sheet where available, falls back
   to copying the link, and keeps the public share counters
   synchronized through the existing WebSocket transport.
   ===================================================== */

import { sync } from "../admin/sync.js?v=3.23";

const SHARE_TARGETS = new Set(["site", "market"]);
const THANK_YOU_MESSAGE = "Thank you for sharing the love!";

function showShareToast(message) {
  const container = document.getElementById("sold-toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "sold-toast notice-toast";
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

export function formatShareCount(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count < 1000) return String(count);
  if (count < 10000) return `${Math.floor(count / 100) / 10}K`;
  if (count < 1000000) return `${Math.floor(count / 1000)}K`;
  return `${Math.floor(count / 100000) / 10}M`;
}

export function renderShareCount(target, value) {
  if (!SHARE_TARGETS.has(target)) return;
  const count = Math.max(0, Math.floor(Number(value) || 0));
  const displayCount = formatShareCount(count);

  document.querySelectorAll(`[data-share-target="${target}"]`).forEach((button) => {
    const counter = button.querySelector(".share-count");
    if (counter) counter.textContent = displayCount;
    const label = button.dataset.shareLabel || "Share";
    button.setAttribute("aria-label", `${label} — shared ${count} ${count === 1 ? "time" : "times"}`);
  });
}

export function renderShareCounts(counts = {}) {
  SHARE_TARGETS.forEach((target) => renderShareCount(target, counts[target]));
}

// Kept dependency-injected so the success, cancellation, and clipboard
// fallback paths can be tested without opening a real operating-system sheet.
export async function performShare(payload, { share, copy }) {
  if (share) {
    try {
      await share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  try {
    await copy(payload.url);
    return "copied";
  } catch {
    return "failed";
  }
}

async function handleShareClick(button) {
  const { shareUrl, shareTitle, shareText, shareTarget } = button.dataset;
  if (!shareUrl || !SHARE_TARGETS.has(shareTarget) || button.disabled) return;

  button.disabled = true;
  const result = await performShare(
    { url: shareUrl, title: shareTitle, text: shareText },
    {
      share: typeof navigator.share === "function" ? navigator.share.bind(navigator) : null,
      copy: (url) => navigator.clipboard.writeText(url),
    }
  );
  button.disabled = false;

  if (result === "shared" || result === "copied") {
    sync.recordShare(shareTarget);
    showShareToast(THANK_YOU_MESSAGE);
  } else if (result === "failed") {
    showShareToast(`Copy this link: ${shareUrl}`);
  }
}

export function initShareButtons() {
  renderShareCounts(window.__INITIAL_STATE__?.shareCounts);

  sync.on("full-state", (message) => renderShareCounts(message.data?.shareCounts));
  sync.on("share-count", (message) => renderShareCount(message.target, message.count));

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-share-url]");
    if (!button) return;
    handleShareClick(button);
  });
}
