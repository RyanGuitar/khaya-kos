// js/admin/imageUtils.js
// Keeps uploaded product photos small before they get embedded as base64 —
// a full-resolution phone photo can be 4-8MB, which is far too heavy to
// broadcast over the WebSocket and store per-product in the JSON file.

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.82;

export function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        if (width > height && width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        } else if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };

      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = event.target.result;
    };

    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}
