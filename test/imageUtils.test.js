import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCoverScale,
  clampCropOffset,
  estimateDataUrlBytes,
  exportSquareCrop,
  zoomCropAtPoint,
} from "../public/js/admin/imageUtils.js";

test("cover scale fills a square with landscape and portrait photos", () => {
  assert.equal(calculateCoverScale(4000, 3000, 600), 0.2);
  assert.equal(calculateCoverScale(3000, 4000, 600), 0.2);
  assert.equal(calculateCoverScale(1200, 1200, 600), 0.5);
});

test("crop offsets never expose empty space around the square", () => {
  const landscape = clampCropOffset({
    offsetX: -999,
    offsetY: 80,
    imageWidth: 4000,
    imageHeight: 3000,
    scale: 0.2,
    frameSize: 600,
  });
  assert.deepEqual(landscape, { offsetX: -200, offsetY: 0 });

  const portrait = clampCropOffset({
    offsetX: 40,
    offsetY: -999,
    imageWidth: 3000,
    imageHeight: 4000,
    scale: 0.2,
    frameSize: 600,
  });
  assert.deepEqual(portrait, { offsetX: 0, offsetY: -200 });
});

test("zooming keeps the selected focal point anchored and clamped", () => {
  const result = zoomCropAtPoint({
    offsetX: -100,
    offsetY: 0,
    oldScale: 0.2,
    newScale: 0.4,
    focalX: 300,
    focalY: 300,
    imageWidth: 4000,
    imageHeight: 3000,
    frameSize: 600,
  });

  assert.deepEqual(result, { offsetX: -500, offsetY: -300 });
});

test("data URL size estimates ignore the MIME prefix", () => {
  assert.equal(estimateDataUrlBytes("data:image/jpeg;base64,AAAA"), 3);
});

test("accepted crops render to a compressed 900 by 900 canvas", () => {
  const previousDocument = globalThis.document;
  const drawCalls = [];
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillRect: (...args) => drawCalls.push(["fillRect", ...args]),
    drawImage: (...args) => drawCalls.push(["drawImage", ...args]),
  };
  const outputCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: (type, quality) => `data:${type};quality=${quality};base64,AAAA`,
  };
  globalThis.document = { createElement: () => outputCanvas };

  try {
    const source = { width: 1200, height: 900 };
    const result = exportSquareCrop(source, {
      frameSize: 600,
      imageWidth: 1200,
      imageHeight: 900,
      scale: 2 / 3,
      offsetX: -100,
      offsetY: 0,
    });

    assert.equal(outputCanvas.width, 900);
    assert.equal(outputCanvas.height, 900);
    assert.match(result, /^data:image\/jpeg;quality=0\.84/);
    assert.deepEqual(drawCalls[0], ["fillRect", 0, 0, 900, 900]);
    assert.deepEqual(drawCalls[1], ["drawImage", source, -150, 0, 1200, 900]);
    assert.equal(context.imageSmoothingQuality, "high");
  } finally {
    globalThis.document = previousDocument;
  }
});
