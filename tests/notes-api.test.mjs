import test from "node:test";
import assert from "node:assert/strict";

import { MODULE_ID, NOTE_STATUSES, SETTINGS } from "../scripts/constants.js";

function createActor(id, name) {
  return {
    id,
    name,
    uuid: `Actor.${id}`,
    documentName: "Actor",
    type: "character",
    flags: {},
    getFlag(scope, key) {
      return this.flags[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope][key] = structuredClone(value);
      return this;
    }
  };
}

const hero = createActor("hero", "Hero");
const settingsValues = new Map([[SETTINGS.DEFAULT_STATUS, NOTE_STATUSES.OPEN]]);

globalThis.game = {
  user: { id: "gm-1", isGM: true },
  i18n: { lang: "en", localize: (key) => key },
  actors: new Map([[hero.id, hero]]),
  settings: {
    settings: new Map([SETTINGS.WORLD_STATE, SETTINGS.DEFAULT_STATUS].map((key) => [`${MODULE_ID}.${key}`, {}])),
    get: (_moduleId, key) => settingsValues.get(key),
    set: async (_moduleId, key, value) => {
      settingsValues.set(key, value);
      return value;
    }
  }
};
globalThis.fromUuid = async (uuid) => {
  if (uuid === "broken.uuid") throw new Error("Invalid UUID");
  return uuid === hero.uuid ? hero : null;
};

const { createNote, getNotes, pickNoteFields, resolveNotesActor, updateNote } = await import("../scripts/notes-api.js");

function storedNotes() {
  return hero.flags[MODULE_ID]?.notes ?? [];
}

test("the notes API is GM only", async () => {
  game.user.isGM = false;
  try {
    await assert.rejects(() => createNote(hero, { title: "Hook" }), /Only GMs can use Player Notes/);
    await assert.rejects(() => getNotes(hero), /Only GMs can use Player Notes/);
    await assert.rejects(() => updateNote(hero, "note", { status: NOTE_STATUSES.RESOLVED }), /Only GMs can use Player Notes/);
    assert.equal(storedNotes().length, 0);
  } finally {
    game.user.isGM = true;
  }
});

test("actors resolve from documents, tokens, UUIDs and world ids", async () => {
  assert.equal(await resolveNotesActor(hero), hero);
  assert.equal(await resolveNotesActor({ documentName: "Token", actor: hero }), hero);
  assert.equal(await resolveNotesActor("Actor.hero"), hero);
  assert.equal(await resolveNotesActor(" hero "), hero);
  await assert.rejects(() => resolveNotesActor("Actor.ghost"), /No Actor found for Actor\.ghost/);
  await assert.rejects(() => resolveNotesActor("broken.uuid"), /No Actor found for broken\.uuid/);
  await assert.rejects(() => resolveNotesActor({ name: "Plain object" }), /No Actor found for Plain object/);
  await assert.rejects(() => resolveNotesActor(null), /No Actor found for null/);
});

test("createNote, getNotes and updateNote wrap the repository", async () => {
  const debt = await createNote(hero, {
    title: "Debt",
    body: "Owes the smith 50 gp",
    tags: "debt, npc",
    priority: "high",
    id: "forced-id",
    actorUuid: "Actor.other",
    createdBy: "someone"
  });
  assert.notEqual(debt.id, "forced-id");
  assert.equal(debt.actorUuid, hero.uuid);
  assert.equal(debt.status, NOTE_STATUSES.OPEN);
  assert.equal(debt.priority, "high");
  assert.deepEqual(debt.tags, ["debt", "npc"]);
  assert.equal(debt.createdBy, "gm-1");
  assert.equal(storedNotes().length, 1);
  assert.equal(settingsValues.get(SETTINGS.WORLD_STATE).customTags.includes("debt"), true);

  await createNote("Actor.hero", { title: "Spotlight", status: NOTE_STATUSES.NEXT_SESSION });
  await createNote("hero", { title: "Secret", visibility: "gm-only" });
  await createNote({ documentName: "Token", actor: hero }, { body: "From a token" });

  assert.equal((await getNotes(hero)).length, 4);
  assert.equal((await getNotes(hero, { status: "all" })).length, 4);
  const nextSession = await getNotes("Actor.hero", { status: NOTE_STATUSES.NEXT_SESSION });
  assert.deepEqual(nextSession.map((note) => note.title), ["Spotlight"]);

  const updated = await updateNote(hero, debt.id, {
    status: NOTE_STATUSES.RESOLVED,
    priority: "urgent",
    id: "hijack",
    createdAt: "1999-01-01T00:00:00.000Z"
  });
  assert.equal(updated.id, debt.id);
  assert.equal(updated.status, NOTE_STATUSES.RESOLVED);
  assert.equal(updated.priority, "urgent");
  assert.equal(updated.createdAt, debt.createdAt);
  assert.deepEqual((await getNotes(hero, { status: NOTE_STATUSES.RESOLVED })).map((note) => note.id), [debt.id]);

  assert.equal(await updateNote(hero, "missing-note", { status: NOTE_STATUSES.OPEN }), null);
});

test("invalid status, priority and visibility values are rejected before anything is written", async () => {
  const before = structuredClone(storedNotes());

  await assert.rejects(() => createNote(hero, { status: "done" }), /Invalid status "done"\. Allowed: open, next-session, resolved, archived\./);
  await assert.rejects(() => createNote(hero, { priority: "critical" }), /Invalid priority "critical"\. Allowed: low, normal, high, urgent\./);
  await assert.rejects(() => createNote(hero, { visibility: "public" }), /Invalid visibility "public"/);
  await assert.rejects(() => getNotes(hero, { status: "closed" }), /Invalid status "closed"/);
  await assert.rejects(() => updateNote(hero, before[0]?.id, { priority: "max" }), /Invalid priority "max"/);
  await assert.rejects(() => createNote("Actor.ghost", { title: "Lost" }), /No Actor found for Actor\.ghost/);

  assert.deepEqual(storedNotes(), before);
  assert.deepEqual(pickNoteFields({ title: "Only", foo: "bar", status: undefined }), { title: "Only" });
  assert.deepEqual(pickNoteFields(null), {});
});
