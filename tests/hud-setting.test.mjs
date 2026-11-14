import test from "node:test";
import assert from "node:assert/strict";

import { hudButtonStartValue } from "../scripts/settings.js";

test("a world that switched the token indicators off starts with the HUD button off", () => {
  assert.equal(hudButtonStartValue(false, undefined), false);
});

test("an untouched world keeps the default, nothing is written", () => {
  assert.equal(hudButtonStartValue(undefined, undefined), undefined);
  assert.equal(hudButtonStartValue(true, undefined), undefined);
});

test("a stored HUD choice is never overwritten", () => {
  assert.equal(hudButtonStartValue(false, true), undefined);
  assert.equal(hudButtonStartValue(false, false), undefined);
  assert.equal(hudButtonStartValue(true, false), undefined);
});
