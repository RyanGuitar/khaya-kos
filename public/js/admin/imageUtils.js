// Lightweight image preparation and crop geometry for owner uploads.
// Phone photos are decoded locally, reduced before interactive editing, then
// exported as a compact square JPEG before entering the WebSocket state.

export const CROP_OUTPUT_SIZE = 900;
export const MAX_SOURCE_DIMENSION = 3600;
export const MAX_OUTPUT_BYTES = 350 * 1024;

const JPEG_QUALITIES = [0.84, 0.78, 0.72, 0.66];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateCoverScale(imageWidth, imageHeight, frameSize) {
  if (imageWidth <= 0 || imageHeight <= 0 || frameSize <= 0) return 1;
  return Math.max(frameSize / imageWidth, frameSize / imageHeight);
}

export function clampCropOffset({
  offsetX,
  offsetY,
  imageWidth,
  imageHeight,
  scale,
  frameSize,
}) {
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const minimumX = Math.min(0, frameSize - renderedWidth);
  const minimumY = Math.min(0, frameSize - renderedHeight);

  return {
    offsetX: clamp(offsetX, minimumX, 0),
    offsetY: clamp(offsetY, minimumY, 0),
  };
}

export function zoomCropAtPoint({
  offsetX,
  offsetY,
  oldScale,
  newScale,
  focalX,
  focalY,
  imageWidth,
  imageHeight,
  frameSize,
}) {
  if (oldScale <= 0 || newScale <= 0) return { offsetX, offsetY };

  const imageX = (focalX - offsetX) / oldScale;
  const imageY = (focalY - offsetY) / oldScale;

  return clampCropOffset({
    offsetX: focalX - imageX * newScale,
    offsetY: focalY - imageY * newScale,
    imageWidth,
    imageHeight,
    scale: newScale,
    frameSize,
  });
}

export function estimateDataUrlBytes(dataUrl) {
  const encoded = dataUrl.split(",")[1] || "";
  return Math.ceil((encoded.length * 3) / 4);
}

function loadImageFromObjectUrl(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that image. Try a JPEG or PNG photo."));
    };
    image.src = objectUrl;
  });
}

export async function prepareImageForCrop(file) {
  if (!file || (file.type && !file.type.startsWith("image/"))) {
    throw new Error("Please choose an image file.");
  }

  const image = await loadImageFromObjectUrl(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("That image has no readable dimensions.");

  const reduction = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  if (reduction === 1) return image;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * reduction);
  canvas.height = Math.round(sourceHeight * reduction);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not prepare the photo.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function exportSquareCrop(source, crop, {
  outputSize = CROP_OUTPUT_SIZE,
  maxBytes = MAX_OUTPUT_BYTES,
} = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not crop the photo.");

  const outputScale = outputSize / crop.frameSize;
  context.fillStyle = "#f7f2e6";
  context.fillRect(0, 0, outputSize, outputSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    crop.offsetX * outputScale,
    crop.offsetY * outputScale,
    crop.imageWidth * crop.scale * outputScale,
    crop.imageHeight * crop.scale * outputScale
  );

  let result = "";
  for (const quality of JPEG_QUALITIES) {
    result = canvas.toDataURL("image/jpeg", quality);
    if (estimateDataUrlBytes(result) <= maxBytes) break;
  }
  return result;
}
