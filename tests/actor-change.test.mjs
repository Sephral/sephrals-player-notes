import test from "node:test";
import assert from "node:assert/strict";

import { MODULE_ID } from "../scripts/constants.js";
import { actorChangeAffectsNotes } from "../scripts/utils.js";

test("actor updates outside the notes flags, name, image and ownership are ignored", () => {
  assert.equal(actorChangeAffectsNotes({ _id: "a1", system: { attributes: { hp: { value: 3 } } } }), false);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", flags: { dnd5e: { concentration: true } } }), false);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", prototypeToken: { name: "Renamed token" } }), false);
  assert.equal(actorChangeAffectsNotes({}), false);
  assert.equal(actorChangeAffectsNotes(undefined), false);
});

test("notes flags, name, image and ownership changes trigger a refresh", () => {
  assert.equal(actorChangeAffectsNotes({ _id: "a1", flags: { [MODULE_ID]: { notes: [] } } }), true);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", flags: { [MODULE_ID]: { "-=notes": null } } }), true);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", flags: { [`-=${MODULE_ID}`]: null } }), true);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", name: "New name" }), true);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", img: "icons/svg/hero.svg" }), true);
  assert.equal(actorChangeAffectsNotes({ _id: "a1", ownership: { player1: 3 } }), true);
});
