import test from "node:test";
import assert from "node:assert/strict";

import { shouldShowMarketItems } from "../public/js/admin/marketLogic.js";

test("visitors see market items only while the market is open", () => {
  assert.equal(shouldShowMarketItems(false, false), false);
  assert.equal(shouldShowMarketItems(true, false), true);
});

test("the owner can prepare market items while it is closed", () => {
  assert.equal(shouldShowMarketItems(false, true), true);
  assert.equal(shouldShowMarketItems(true, true), true);
});
