/* =====================================================
   Khaya Kos — Share Module
   Wires up every button carrying data-share-url/-title/-text
   to the native share sheet on supporting devices, falling
   back to copying the link with a toast confirmation.
   ===================================================== */

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

async function handleShareClick(button) {
  const { shareUrl, shareTitle, shareText } = button.dataset;
  if (!shareUrl) return;

  if (navigator.share) {
    try {
      await navigator.share({ url: shareUrl, title: shareTitle, text: shareText });
    } catch (err) {
      // AbortError fires when the person just closes the native share
      // sheet without picking anything — not a real failure, stay quiet.
      if (err?.name !== "AbortError") {
        await copyShareLink(shareUrl);
      }
    }
    return;
  }

  await copyShareLink(shareUrl);
}

async function copyShareLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    showShareToast("Link copied!");
  } catch {
    showShareToast(url);
  }
}

export function initShareButtons() {
  document.addEventListener("click", (e) => {
    const button = e.target.closest("[data-share-url]");
    if (!button) return;
    handleShareClick(button);
  });
}
