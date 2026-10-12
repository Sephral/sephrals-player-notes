import test from "node:test";
import assert from "node:assert/strict";

import { NOTE_PRIORITIES, NOTE_STATUSES, TRACKING_MODES } from "../scripts/constants.js";
import { migrateActorNotes, migrateWorldState, normalizeOrphanRecord } from "../scripts/migration.js";
import { createNoteData, duplicateNoteData, duplicateSignature, normalizeNote, notesLikelyDuplicate } from "../scripts/note-model.js";

test("createNoteData applies defaults and normalizes tags", () => {
  const note = createNoteData({
    actorUuid: "Actor.test",
    title: " Remember this ",
    body: "Important body",
    tags: ["secret", "Secret", " reward "]
  }, { now: "2026-01-01T00:00:00.000Z", userId: "gm-1" });

  assert.equal(note.actorUuid, "Actor.test");
  assert.equal(note.title, "Remember this");
  assert.equal(note.status, NOTE_STATUSES.OPEN);
  assert.equal(note.priority, NOTE_PRIORITIES.NORMAL);
  assert.deepEqual(note.tags, ["secret", "reward"]);
  assert.equal(note.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(note.updatedBy, "gm-1");
});

test("untitled and copy titles fall back to English without Foundry", () => {
  const note = createNoteData({ actorUuid: "Actor.test" });
  assert.equal(note.title, "Untitled Note");

  const copy = duplicateNoteData({ ...note, title: "Repay $& debt" }, { actorUuid: "Actor.test" });
  assert.equal(copy.title, "Repay $& debt (Copy)");
  assert.notEqual(copy.id, note.id);

  assert.equal(normalizeOrphanRecord({ actorUuid: "Actor.gone", note: { id: "n1", title: "Hook" } }).actorName, "Missing Actor");
});

test("untitled, copy and missing actor texts use Foundry's translation", () => {
  const translations = {
    "SPN.Note.Untitled": "Unbenannte Notiz",
    "SPN.Note.CopyTitle": "{title} (Kopie)",
    "SPN.Orphans.MissingActor": "Fehlender Actor"
  };
  globalThis.game = { i18n: { localize: (key) => translations[key] ?? key } };
  try {
    const note = createNoteData({ actorUuid: "Actor.test", body: "  " });
    assert.equal(note.title, "Unbenannte Notiz");
    assert.equal(duplicateNoteData({ ...note, title: "Hook" }, { actorUuid: "Actor.test" }).title, "Hook (Kopie)");
    assert.equal(normalizeOrphanRecord({ actorUuid: "Actor.gone", note: { id: "n1", title: "Hook" } }).actorName, "Fehlender Actor");

    // Translations not loaded yet: Foundry returns the key, the model keeps the English text.
    delete translations["SPN.Note.Untitled"];
    assert.equal(createNoteData({ actorUuid: "Actor.test" }).title, "Untitled Note");
  } finally {
    delete globalThis.game;
  }
});

test("notesLikelyDuplicate compares actor, title, and body", () => {
  const left = normalizeNote({ actorUuid: "Actor.test", title: "Hook", body: "Keep this in mind" });
  const right = normalizeNote({ actorUuid: "Actor.test", title: " hook ", body: " keep this in mind " });
  const other = normalizeNote({ actorUuid: "Actor.test", title: "Different", body: "Keep this in mind" });

  assert.equal(notesLikelyDuplicate(left, right), true);
  assert.equal(duplicateSignature(left), duplicateSignature(right));
  assert.equal(notesLikelyDuplicate(left, other), false);
});

test("migrateActorNotes normalizes malformed notes", () => {
  const notes = migrateActorNotes([
    {
      id: "note-1",
      title: "",
      body: "First line becomes title\nSecond line",
      tags: "secret, promise"
    }
  ], "Actor.player");

  assert.equal(notes.length, 1);
  assert.equal(notes[0].actorUuid, "Actor.player");
  assert.equal(notes[0].title, "First line becomes title");
  assert.deepEqual(notes[0].tags, ["secret", "promise"]);
});

test("migrateWorldState normalizes tracking modes, tags, and orphan records", () => {
  const state = migrateWorldState({
    actorTracking: {
      "Actor.one": TRACKING_MODES.TRACKED,
      "Actor.two": "invalid-mode"
    },
    customTags: ["promise", "Promise", " spotlight "],
    orphanNotes: [
      {
        actorUuid: "Actor.missing",
        actorName: "Missing Hero",
        note: {
          id: "missing-note",
          title: "Missing link",
          body: "Still important"
        }
      }
    ]
  });

  assert.equal(state.actorTracking["Actor.one"], TRACKING_MODES.TRACKED);
  assert.equal(state.actorTracking["Actor.two"], TRACKING_MODES.AUTO);
  assert.deepEqual(state.customTags, ["promise", "spotlight"]);
  assert.equal(state.orphanNotes.length, 1);
  assert.equal(state.orphanNotes[0].note.actorUuid, "Actor.missing");
});

test("normalizeOrphanRecord keeps missing actor metadata", () => {
  const orphan = normalizeOrphanRecord({
    actorUuid: "Actor.missing",
    actorName: "Gone Hero",
    actorImg: "icons/svg/mystery-man.svg",
    note: {
      id: "gone-note",
      title: "Follow up",
      body: "Do not forget"
    }
  });

  assert.equal(orphan.actorName, "Gone Hero");
  assert.equal(orphan.note.id, "gone-note");
  assert.equal(orphan.note.actorUuid, "Actor.missing");
});
