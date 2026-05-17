import { DATA_VERSION, TRACKING_MODES } from "./constants.js";
import { normalizeNote } from "./note-model.js";
import { uniqueStrings } from "./utils.js";

export function defaultWorldState() {
  return {
    version: DATA_VERSION,
    actorTracking: {},
    customTags: [],
    orphanNotes: []
  };
}

function normalizeTrackingMode(value) {
  if (value === TRACKING_MODES.TRACKED || value === TRACKING_MODES.HIDDEN) return value;
  return TRACKING_MODES.AUTO;
}

export function normalizeOrphanRecord(record) {
  if (!record || typeof record !== "object") return null;
  const note = normalizeNote(record.note ?? record, {
    actorUuid: record.actorUuid ?? record.note?.actorUuid ?? "orphaned"
  });
  return {
    id: note.id,
    actorUuid: record.actorUuid ?? note.actorUuid,
    actorName: String(record.actorName ?? record.note?.actorName ?? "Missing Actor"),
    actorImg: String(record.actorImg ?? record.note?.actorImg ?? "icons/svg/mystery-man.svg"),
    orphanedAt: String(record.orphanedAt ?? note.updatedAt),
    note
  };
}

export function migrateActorNotes(rawNotes, actorUuid) {
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes
    .map((note) => normalizeNote(note, { actorUuid }))
    .filter((note) => typeof note.actorUuid === "string" && note.actorUuid.length > 0);
}

export function migrateWorldState(rawState) {
  const base = defaultWorldState();
  const source = rawState && typeof rawState === "object" ? rawState : base;
  const actorTracking = {};

  for (const [actorUuid, mode] of Object.entries(source.actorTracking ?? {})) {
    if (!String(actorUuid).trim()) continue;
    actorTracking[actorUuid] = normalizeTrackingMode(mode);
  }

  const orphanNotes = Array.isArray(source.orphanNotes)
    ? source.orphanNotes.map((record) => normalizeOrphanRecord(record)).filter(Boolean)
    : [];

  return {
    version: DATA_VERSION,
    actorTracking,
    customTags: uniqueStrings(source.customTags ?? []),
    orphanNotes
  };
}
