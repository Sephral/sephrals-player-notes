import test from "node:test";
import assert from "node:assert/strict";

import { resolveElement } from "../scripts/utils.js";

const element = (extra = {}) => ({ nodeType: 1, ...extra });

test("a form element is returned as is, not its first control", () => {
  const input = element();
  const form = element({ 0: input, length: 1 });
  assert.equal(resolveElement(form), form);
});

test("a jQuery object is unwrapped, anything else gives null", () => {
  const root = element();
  assert.equal(resolveElement({ jquery: "3.7.1", 0: root, length: 1 }), root);
  assert.equal(resolveElement({ jquery: "3.7.1", length: 0 }), null);
  assert.equal(resolveElement({ 0: root }), null);
  assert.equal(resolveElement({ nodeType: 3 }), null);
  assert.equal(resolveElement(null), null);
  assert.equal(resolveElement(undefined), null);
});
