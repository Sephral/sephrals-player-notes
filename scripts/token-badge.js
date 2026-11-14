// Drawing of the token badge circle, for PIXI v7 (beginFill, lineStyle, drawCircle, endFill) and PIXI v8
// (circle, fill, stroke). Foundry 13 and 14 ship PIXI 7, a later Foundry may ship PIXI 8, so the call set is picked
// from what the Graphics object offers. Kept free of globals so it can be tested with a fake Graphics.

export const BADGE_RADIUS = 11;

/**
 * Draws a filled circle with an outline at the origin of a PIXI.Graphics.
 * @param {object} graphics    A PIXI.Graphics
 * @param {object} style       {fill, fillAlpha, lineColor, lineAlpha, lineWidth, radius}
 * @returns {object}           The same Graphics
 */
export function drawBadgeCircle(graphics, { fill, fillAlpha = 1, lineColor = 0x000000, lineAlpha = 1, lineWidth = 1, radius = BADGE_RADIUS } = {}) {
  // PIXI v8 renamed the shape calls, and its drawCircle only exists as a deprecated alias, so look for circle first.
  if (typeof graphics.circle === "function") {
    graphics.circle(0, 0, radius);
    graphics.fill({ color: fill, alpha: fillAlpha });
    graphics.stroke({ width: lineWidth, color: lineColor, alpha: lineAlpha });
    return graphics;
  }

  graphics.beginFill(fill, fillAlpha);
  graphics.lineStyle(lineWidth, lineColor, lineAlpha);
  graphics.drawCircle(0, 0, radius);
  graphics.endFill();
  return graphics;
}
