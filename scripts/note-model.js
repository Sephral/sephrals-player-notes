import {
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  NOTE_VISIBILITY
} from "./constants.js";
import { isoNow, normalizeText, parseTagsInput, uniqueStrings } from "./utils.js";

const VALID_STATUSES = new Set(Object.values(NOTE_STATUSES));
const VALID_PRIORITIES = new Set(Object.values(NOTE_PRIORITIES));
const VALID_VISIBILITY = new Set(Object.values(NOTE_VISIBILITY));

export function generateNoteId() {
  if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID();
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `spn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeNote(input = {}, options = {}) {
  const now = options.now ?? isoNow();
  const actorUuid = options.actorUuid ?? input.actorUuid ?? "";
  const createdAt = input.createdAt || now;
  const updatedAt = input.updatedAt || createdAt || now;
  const createdBy = input.createdBy || options.userId || null;
  const updatedBy = input.updatedBy || options.userId || createdBy;
  const title = String(input.title ?? "").trim() || String(input.body ?? "").trim().split(/\n/)[0]?.slice(0, 72) || "Untitled Note";
  const body = String(input.body ?? "").trim();
  const tags = uniqueStrings(parseTagsInput(input.tags));
  const status = VALID_STATUSES.has(input.status) ? input.status : (options.defaultStatus ?? NOTE_STATUSES.OPEN);
  const priority = VALID_PRIORITIES.has(input.priority) ? input.priority : NOTE_PRIORITIES.NORMAL;
  const visibility = VALID_VISIBILITY.has(input.visibility) ? input.visibility : NOTE_VISIBILITY.GM_ONLY;

  return {
    id: String(input.id ?? generateNoteId()),
    actorUuid,
    title,
    body,
    tags,
    status,
    priority,
    visibility,
    createdAt,
    updatedAt,
    createdBy,
    updatedBy
  };
}

export function createNoteData(input = {}, options = {}) {
  const now = options.now ?? isoNow();
  return normalizeNote({
    ...input,
    id: input.id ?? generateNoteId(),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    createdBy: input.createdBy ?? options.userId ?? null,
    updatedBy: input.updatedBy ?? options.userId ?? null
  }, options);
}

export function duplicateNoteData(note, options = {}) {
  return createNoteData({
    ...note,
    id: null,
    title: `${note.title} (Copy)`,
    status: options.defaultStatus ?? note.status ?? NOTE_STATUSES.OPEN,
    createdAt: null,
    updatedAt: null,
    createdBy: null,
    updatedBy: null
  }, options);
}

export function validateNote(note) {
  const errors = [];
  if (!note || typeof note !== "object") errors.push("Note must be an object.");
  if (!String(note?.id ?? "").trim()) errors.push("Note id is required.");
  if (!String(note?.actorUuid ?? "").trim()) errors.push("Actor UUID is required.");
  if (!String(note?.title ?? "").trim()) errors.push("Note title is required.");
  if (!VALID_STATUSES.has(note?.status)) errors.push(`Invalid note status: ${note?.status}`);
  if (!VALID_PRIORITIES.has(note?.priority)) errors.push(`Invalid note priority: ${note?.priority}`);
  if (!VALID_VISIBILITY.has(note?.visibility)) errors.push(`Invalid note visibility: ${note?.visibility}`);
  if (!Array.isArray(note?.tags)) errors.push("Note tags must be an array.");
  return {
    valid: errors.length === 0,
    errors
  };
}

export function notesLikelyDuplicate(left, right) {
  return normalizeText(left?.actorUuid) === normalizeText(right?.actorUuid)
    && normalizeText(left?.title) === normalizeText(right?.title)
    && normalizeText(left?.body) === normalizeText(right?.body);
}

export function duplicateSignature(note) {
  return [normalizeText(note?.actorUuid), normalizeText(note?.title), normalizeText(note?.body)].join("::");
}
