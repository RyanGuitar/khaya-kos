import {
  CROP_OUTPUT_SIZE,
  calculateCoverScale,
  clampCropOffset,
  exportSquareCrop,
  prepareImageForCrop,
  zoomCropAtPoint,
} from "./imageUtils.js?v=3.16";

const MAX_ZOOM_RATIO = 3;
const ZOOM_STEP = 0.1;

function sourceDimensions(source) {
  return {
    width: source.naturalWidth || source.width,
    height: source.naturalHeight || source.height,
  };
}

function pointerPosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function pinchSnapshot(pointers) {
  const points = [...pointers.values()];
  if (points.length < 2) return null;
  const [first, second] = points;
  return {
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

export function createImageCropper({
  overlay,
  canvas,
  zoomRange,
  zoomOutButton,
  zoomInButton,
  cancelButton,
  applyButton,
  status,
  onConfirm,
  onCancel,
}) {
  if (!overlay || !canvas) return null;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  const pointers = new Map();
  let source = null;
  let crop = null;
  let maximumZoom = 1;
  let previousPinch = null;
  let restoreFocusTo = null;
  let drawFrame = null;
  let busy = false;
  let openSequence = 0;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function updateZoomControls() {
    if (!crop || !zoomRange) return;
    const ratio = crop.scale / crop.minimumScale;
    zoomRange.max = maximumZoom.toFixed(2);
    zoomRange.value = ratio.toFixed(2);
    zoomRange.disabled = false;
    zoomRange.setAttribute("aria-valuetext", `${Math.round(ratio * 100)}%`);
    if (zoomOutButton) zoomOutButton.disabled = ratio <= 1.001;
    if (zoomInButton) zoomInButton.disabled = ratio >= maximumZoom - 0.001;
  }

  function draw() {
    drawFrame = null;
    if (!source || !crop || !context) return;
    context.fillStyle = "#102d45";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      crop.offsetX,
      crop.offsetY,
      crop.imageWidth * crop.scale,
      crop.imageHeight * crop.scale
    );
  }

  function requestDraw() {
    if (drawFrame !== null) return;
    drawFrame = requestAnimationFrame(draw);
  }

  function clampPosition() {
    if (!crop) return;
    const clamped = clampCropOffset(crop);
    crop.offsetX = clamped.offsetX;
    crop.offsetY = clamped.offsetY;
  }

  function moveBy(deltaX, deltaY) {
    if (!crop) return;
    crop.offsetX += deltaX;
    crop.offsetY += deltaY;
    clampPosition();
    requestDraw();
  }

  function setScale(nextScale, focalX = canvas.width / 2, focalY = canvas.height / 2) {
    if (!crop) return;
    const minimum = crop.minimumScale;
    const maximum = minimum * maximumZoom;
    const scale = Math.min(maximum, Math.max(minimum, nextScale));
    const nextOffset = zoomCropAtPoint({
      ...crop,
      oldScale: crop.scale,
      newScale: scale,
      focalX,
      focalY,
    });
    crop.scale = scale;
    crop.offsetX = nextOffset.offsetX;
    crop.offsetY = nextOffset.offsetY;
    updateZoomControls();
    requestDraw();
  }

  function setZoomRatio(ratio, focalX, focalY) {
    if (!crop) return;
    setScale(crop.minimumScale * ratio, focalX, focalY);
  }

  function close({ restoreFocus = true } = {}) {
    openSequence += 1;
    if (drawFrame !== null) cancelAnimationFrame(drawFrame);
    drawFrame = null;
    pointers.clear();
    previousPinch = null;
    source = null;
    crop = null;
    busy = false;
    overlay.hidden = true;
    document.body.classList.remove("dialog-open");
    canvas.removeAttribute("aria-busy");
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.textContent = "Use this photo";
    }
    if (cancelButton) cancelButton.disabled = false;
    const focusTarget = restoreFocusTo;
    restoreFocusTo = null;
    if (restoreFocus && focusTarget?.isConnected) focusTarget.focus();
  }

  function cancel() {
    if (busy) return;
    close();
    onCancel?.();
  }

  async function confirm() {
    if (!source || !crop || busy) return;
    busy = true;
    if (applyButton) {
      applyButton.disabled = true;
      applyButton.textContent = "Preparing photo…";
    }
    if (cancelButton) cancelButton.disabled = true;
    setStatus("Cropping and compressing your photo.");

    // Allow the busy state to paint before the small synchronous canvas export.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    try {
      const dataUrl = exportSquareCrop(source, crop);
      close({ restoreFocus: false });
      onConfirm?.(dataUrl);
    } catch (error) {
      busy = false;
      if (applyButton) {
        applyButton.disabled = false;
        applyButton.textContent = "Use this photo";
      }
      if (cancelButton) cancelButton.disabled = false;
      setStatus(error.message || "The photo could not be prepared. Please try another image.");
    }
  }

  async function open(file, trigger) {
    const sequence = ++openSequence;
    restoreFocusTo = trigger || document.activeElement;
    overlay.hidden = false;
    document.body.classList.add("dialog-open");
    canvas.setAttribute("aria-busy", "true");
    context.fillStyle = "#102d45";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (zoomRange) {
      zoomRange.value = "1";
      zoomRange.disabled = true;
    }
    if (zoomOutButton) zoomOutButton.disabled = true;
    if (zoomInButton) zoomInButton.disabled = true;
    if (applyButton) applyButton.disabled = true;
    if (cancelButton) cancelButton.disabled = false;
    setStatus("Preparing your photo…");
    canvas.focus();

    try {
      const preparedSource = await prepareImageForCrop(file);
      if (sequence !== openSequence) return;
      source = preparedSource;
      const dimensions = sourceDimensions(source);
      const minimumScale = calculateCoverScale(dimensions.width, dimensions.height, canvas.width);
      maximumZoom = Math.max(
        1,
        Math.min(MAX_ZOOM_RATIO, Math.min(dimensions.width, dimensions.height) / CROP_OUTPUT_SIZE)
      );
      crop = {
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
        frameSize: canvas.width,
        minimumScale,
        scale: minimumScale,
        offsetX: (canvas.width - dimensions.width * minimumScale) / 2,
        offsetY: (canvas.height - dimensions.height * minimumScale) / 2,
      };
      clampPosition();
      updateZoomControls();
      canvas.removeAttribute("aria-busy");
      if (applyButton) applyButton.disabled = false;
      setStatus("Drag to reposition. Pinch or use the zoom control to resize.");
      draw();
    } catch (error) {
      close();
      throw error;
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!crop || busy) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, pointerPosition(canvas, event));
    previousPinch = pinchSnapshot(pointers);
    canvas.classList.add("is-dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !crop || busy) return;
    event.preventDefault();
    const previousPoint = pointers.get(event.pointerId);
    const nextPoint = pointerPosition(canvas, event);

    if (pointers.size === 1) {
      pointers.set(event.pointerId, nextPoint);
      moveBy(nextPoint.x - previousPoint.x, nextPoint.y - previousPoint.y);
      return;
    }

    const before = previousPinch;
    pointers.set(event.pointerId, nextPoint);
    const after = pinchSnapshot(pointers);
    if (before && after && before.distance > 0) {
      moveBy(after.midpoint.x - before.midpoint.x, after.midpoint.y - before.midpoint.y);
      setScale(crop.scale * (after.distance / before.distance), after.midpoint.x, after.midpoint.y);
    }
    previousPinch = after;
  });

  function releasePointer(event) {
    pointers.delete(event.pointerId);
    previousPinch = pinchSnapshot(pointers);
    if (pointers.size === 0) canvas.classList.remove("is-dragging");
  }

  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("lostpointercapture", releasePointer);

  canvas.addEventListener("wheel", (event) => {
    if (!crop || busy) return;
    event.preventDefault();
    const focal = pointerPosition(canvas, event);
    setScale(crop.scale * Math.exp(-event.deltaY * 0.0015), focal.x, focal.y);
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    if (!crop || busy) return;
    const distance = event.shiftKey ? 30 : 10;
    const movement = {
      ArrowLeft: [distance, 0],
      ArrowRight: [-distance, 0],
      ArrowUp: [0, distance],
      ArrowDown: [0, -distance],
    }[event.key];
    if (movement) {
      event.preventDefault();
      moveBy(...movement);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setZoomRatio(Number(zoomRange.value) + ZOOM_STEP);
    } else if (event.key === "-") {
      event.preventDefault();
      setZoomRatio(Number(zoomRange.value) - ZOOM_STEP);
    }
  });

  zoomRange?.addEventListener("input", () => setZoomRatio(Number(zoomRange.value)));
  zoomOutButton?.addEventListener("click", () => setZoomRatio(Number(zoomRange.value) - ZOOM_STEP));
  zoomInButton?.addEventListener("click", () => setZoomRatio(Number(zoomRange.value) + ZOOM_STEP));
  cancelButton?.addEventListener("click", cancel);
  applyButton?.addEventListener("click", confirm);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) cancel();
  });
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...overlay.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), canvas[tabindex="0"]'
    )];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return { open, cancel, isOpen: () => !overlay.hidden };
}
