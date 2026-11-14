import test from "node:test";
import assert from "node:assert/strict";

import { BADGE_RADIUS, drawBadgeCircle } from "../scripts/token-badge.js";

const style = { fill: 0xb93d46, fillAlpha: 0.95, lineColor: 0x111111, lineAlpha: 0.9, lineWidth: 1 };

// A Graphics that records its calls and only knows the given method names.
function fakeGraphics(...methods) {
  const calls = [];
  const graphics = { calls };
  for (const name of methods) {
    graphics[name] = (...args) => {
      calls.push([name, ...args]);
      return graphics;
    };
  }
  return graphics;
}

test("PIXI 7 gets the classic call sequence", () => {
  const graphics = fakeGraphics("beginFill", "lineStyle", "drawCircle", "endFill");
  assert.equal(drawBadgeCircle(graphics, style), graphics);
  assert.deepEqual(graphics.calls, [
    ["beginFill", 0xb93d46, 0.95],
    ["lineStyle", 1, 0x111111, 0.9],
    ["drawCircle", 0, 0, BADGE_RADIUS],
    ["endFill"]
  ]);
});

test("PIXI 8 gets circle, fill and stroke and no removed call", () => {
  const graphics = fakeGraphics("circle", "fill", "stroke");
  drawBadgeCircle(graphics, style);
  assert.deepEqual(graphics.calls, [
    ["circle", 0, 0, BADGE_RADIUS],
    ["fill", { color: 0xb93d46, alpha: 0.95 }],
    ["stroke", { width: 1, color: 0x111111, alpha: 0.9 }]
  ]);
});

test("a Graphics with both families (PIXI 8 keeps deprecated aliases) uses the new one", () => {
  const graphics = fakeGraphics("beginFill", "lineStyle", "drawCircle", "endFill", "circle", "fill", "stroke");
  drawBadgeCircle(graphics, style);
  assert.deepEqual(graphics.calls.map((call) => call[0]), ["circle", "fill", "stroke"]);
});

test("the radius can be set", () => {
  const graphics = fakeGraphics("circle", "fill", "stroke");
  drawBadgeCircle(graphics, { ...style, radius: 5 });
  assert.deepEqual(graphics.calls[0], ["circle", 0, 0, 5]);
});
