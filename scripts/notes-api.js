import { MODULE_ID, NOTE_PRIORITIES, NOTE_STATUSES, NOTE_VISIBILITY } from "./constants.js";
import { createNoteForActor, getActorNotes, updateNoteForActor } from "./note-repository.js";
import { isGM, localizeWithFallback, resolveActorUuid } from "./utils.js";

// Fields a caller may set. The id, the Actor UUID and the created/updated stamps stay with the repository.
const WRITABLE_NOTE_FIELDS = Object.freeze(["title", "body", "tags", "status", "priority", "visibility"]);
const ALLOWED_VALUES = Object.freeze({
  status: Object.values(NOTE_STATUSES),
  priority: Object.values(NOTE_PRIORITIES),
  visibility: Object.values(NOTE_VISIBILITY)
});
const ALL_STATUSES = "all";

function apiError(key, fallback, data = {}) {
  const message = Object.entries(data).reduce(
    (text, [field, value]) => text.replaceAll(`{${field}}`, String(value ?? "")),
    localizeWithFallback(key, fallback)
  );
  return new Error(`${MODULE_ID} | ${message}`);
}

function assertGM() {
  if (!isGM()) throw apiError("SPN.Notification.GMOnly", "Only GMs can use Player Notes.");
}

function assertAllowedValue(field, value) {
  const allowed = ALLOWED_VALUES[field];
  if (allowed.includes(value)) return;
  throw apiError("SPN.Api.InvalidValue", "Invalid {field} \"{value}\". Allowed: {allowed}.", {
    field,
    value,
    allowed: allowed.join(", ")
  });
}

// normalizeNote would quietly replace an unknown status or priority with the default, so the API rejects it first.
export function pickNoteFields(data) {
  const picked = {};
  if (!data || typeof data !== "object") return picked;
  for (const field of WRITABLE_NOTE_FIELDS) {
    if (data[field] === undefined) continue;
    if (field in ALLOWED_VALUES) assertAllowedValue(field, data[field]);
    picked[field] = data[field];
  }
  return picked;
}

async function resolveActorReference(value) {
  const reference = value.trim();
  if (!reference.includes(".")) return game?.actors?.get(reference) ?? null;
  try {
    return await resolveActorUuid(reference);
  } catch {
    return null;
  }
}

// Accepts an Actor, a Token or TokenDocument (their Actor, like the selected token shortcuts), an Actor UUID or a world Actor id.
export async function resolveNotesActor(actorOrUuid) {
  let target = typeof actorOrUuid === "string" ? await resolveActorReference(actorOrUuid) : actorOrUuid;
  if (target && target.documentName !== "Actor" && target.actor) target = target.actor;
  if (target?.documentName === "Actor") return target;

  const label = typeof actorOrUuid === "string" ? actorOrUuid : actorOrUuid?.uuid ?? actorOrUuid?.name ?? String(actorOrUuid);
  throw apiError("SPN.Api.ActorNotFound", "No Actor found for {actor}.", { actor: label });
}

export async function createNote(actorOrUuid, data = {}) {
  assertGM();
  const fields = pickNoteFields(data);
  const actor = await resolveNotesActor(actorOrUuid);
  return createNoteForActor(actor, fields);
}

export async function getNotes(actorOrUuid, { status } = {}) {
  assertGM();
  const filterStatus = status === undefined || status === null || status === ALL_STATUSES ? null : status;
  if (filterStatus) assertAllowedValue("status", filterStatus);
  const actor = await resolveNotesActor(actorOrUuid);
  const notes = getActorNotes(actor);
  return filterStatus ? notes.filter((note) => note.status === filterStatus) : notes;
}

// Resolves to null when the Actor has no note with this id, like the repository.
export async function updateNote(actorOrUuid, noteId, changes = {}) {
  assertGM();
  const fields = pickNoteFields(changes);
  const actor = await resolveNotesActor(actorOrUuid);
  return updateNoteForActor(actor, String(noteId ?? ""), fields);
}
