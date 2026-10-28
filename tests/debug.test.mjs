import test from "node:test";
import assert from "node:assert/strict";

import { MODULE_ID, NOTE_STATUSES, NOTE_VISIBILITY, SETTINGS } from "../scripts/constants.js";

function createActor(id, notes = []) {
  return {
    id,
    name: id,
    uuid: `Actor.${id}`,
    documentName: "Actor",
    type: "character",
    flags: { [MODULE_ID]: { notes } },
    getFlag(scope, key) {
      return this.flags[scope]?.[key];
    }
  };
}

const note = (id, status, visibility) => ({ id, title: `Secret ${id}`, body: "Owes the smith 50 gp", status, visibility });
const hero = createActor("hero", [note("a", NOTE_STATUSES.OPEN, NOTE_VISIBILITY.GM_ONLY), note("b", NOTE_STATUSES.RESOLVED, NOTE_VISIBILITY.PLAYER_VISIBLE)]);
const rogue = createActor("rogue", [note("c", NOTE_STATUSES.OPEN, NOTE_VISIBILITY.GM_ONLY)]);
const empty = createActor("empty");
const worldState = { version: 1, actorTracking: { "Actor.hero": "tracked", "Actor.npc": "hidden" }, customTags: ["debt"], orphanNotes: [{ id: "o", note: note("o", NOTE_STATUSES.OPEN, NOTE_VISIBILITY.GM_ONLY) }] };

globalThis.game = {
  user: { id: "gm-1", isGM: true },
  i18n: { lang: "en", localize: (key) => key, format: (key) => key },
  actors: { contents: [hero, rogue, empty] },
  settings: {
    settings: new Map([SETTINGS.WORLD_STATE].map((key) => [`${MODULE_ID}.${key}`, {}])),
    get: (_moduleId, key) => (key === SETTINGS.WORLD_STATE ? worldState : undefined)
  }
};

const { describeDebugState, registerDebug } = await import("../scripts/debug.js");

test("the debug file holds the notes in numbers, never their text", () => {
  const { details } = describeDebugState();
  assert.deepEqual(details.notes, {
    actors: 2,
    notes: 3,
    byStatus: { [NOTE_STATUSES.OPEN]: 2, [NOTE_STATUSES.RESOLVED]: 1 },
    byVisibility: { [NOTE_VISIBILITY.GM_ONLY]: 2, [NOTE_VISIBILITY.PLAYER_VISIBLE]: 1 }
  });
  assert.deepEqual(details.worldState, { storedVersion: 1, version: 1, trackingModes: { tracked: 1, hidden: 1 }, customTags: 1, orphans: 1 });
  assert.equal(JSON.stringify(details).includes("smith"), false);
});

test("the provider leaves the world state with the orphaned notes out of the settings", () => {
  registerDebug();
  const provider = globalThis.sephralsDebugFiles.providers.get(MODULE_ID);
  assert.deepEqual(provider.omitSettings, [SETTINGS.WORLD_STATE]);
  assert.equal(provider.message, undefined);
  assert.equal(provider.label(), "SPN.Debug.Entry");
});
