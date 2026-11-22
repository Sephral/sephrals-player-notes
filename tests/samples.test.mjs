import test from "node:test";
import assert from "node:assert/strict";

globalThis.Hooks = { on() {}, once() {} };
globalThis.foundry = { applications: { api: { ApplicationV2: class {}, DialogV2: class {} } }, utils: { escapeHTML: (value) => String(value) } };
let lang = "en";
globalThis.game = {
  i18n: { get lang() { return lang; }, localize: (key) => key },
  settings: { settings: new Map(), get: () => undefined }
};

const { sampleNotesFor, sampleOrphans, __test__ } = await import("../scripts/sample-windows.js");
const { NOTE_PRIORITIES, NOTE_STATUSES } = await import("../scripts/constants.js");
const { normalizeNote, validateNote } = await import("../scripts/note-model.js");

const NOW = Date.UTC(2026, 10, 22, 12);

test("the sample party has notes in every state and Sela none", () => {
  const ari = sampleNotesFor("ari", NOW, "u1");
  assert.equal(sampleNotesFor("sela", NOW).length, 0);
  for (const status of Object.values(NOTE_STATUSES)) assert.ok(ari.some((note) => note.status === status), status);
  for (const priority of Object.values(NOTE_PRIORITIES)) assert.ok(ari.some((note) => note.priority === priority), priority);
  assert.ok(ari.some((note) => note.body.split("\n").length > 5), "one long note folds");
  assert.ok(ari.some((note) => note.body.includes("@UUID[ChatMessage.")), "one note links a chat message");
});

test("every sample note is valid and keeps its data when normalized", () => {
  for (const id of ["ari", "mira", "tovin"]) {
    for (const note of sampleNotesFor(id, NOW, "u1")) {
      assert.equal(validateNote(normalizeNote(note, { actorUuid: note.actorUuid })).valid, true, note.id);
      assert.ok(note.actorUuid.startsWith("Actor.spnsample"));
      assert.ok(Date.parse(note.createdAt) <= Date.parse(note.updatedAt));
    }
  }
});

test("note ids are unique and the actor ids have the length of a Foundry id", () => {
  const ids = ["ari", "mira", "tovin"].flatMap((id) => sampleNotesFor(id, NOW).map((note) => note.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["ari", "mira", "tovin", "sela"]) assert.equal(__test__.actorId(id).length, 16);
});

test("the texts exist in both languages with the same keys", () => {
  assert.deepEqual(Object.keys(__test__.TEXTS.de).sort(), Object.keys(__test__.TEXTS.en).sort());
  lang = "de";
  assert.equal(sampleNotesFor("ari", NOW)[0].title, __test__.TEXTS.de.ferrymanT);
  lang = "en";
});

test("the orphan records name the missing character and carry a note", () => {
  const orphans = sampleOrphans(NOW);
  assert.equal(orphans.length, 2);
  for (const record of orphans) {
    assert.ok(record.actorName);
    assert.equal(record.note.id, record.id);
  }
});
