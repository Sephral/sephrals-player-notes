import {
  DATA_VERSION,
  FLAG_KEYS,
  MODULE_ID,
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  SETTINGS,
  TRACKING_MODES
} from "./constants.js";
import { shouldTrackActor } from "./actor-detection.js";
import { defaultWorldState, migrateActorNotes, migrateWorldState, normalizeOrphanRecord } from "./migration.js";
import { createNoteData, duplicateNoteData, normalizeNote, notesLikelyDuplicate, validateNote } from "./note-model.js";
import { getSetting, setSetting } from "./settings.js";
import {
  cloneData,
  debugLog,
  getActorImage,
  normalizeText,
  prepareNoteForDisplay,
  resolveActorUuidSync,
  sortNotes,
  summarizeCounts,
  uniqueStrings
} from "./utils.js";

function getActorFlagNotes(actor) {
  if (!actor) return [];
  let raw = null;
  try {
    raw = actor.getFlag?.(MODULE_ID, FLAG_KEYS.NOTES);
  } catch {
    raw = globalThis.foundry?.utils?.getProperty?.(actor, `flags.${MODULE_ID}.${FLAG_KEYS.NOTES}`) ?? [];
  }
  return migrateActorNotes(raw, actor.uuid);
}

export function getWorldStateSync() {
  return migrateWorldState(getSetting(SETTINGS.WORLD_STATE, defaultWorldState()));
}

export async function getWorldState() {
  const current = getWorldStateSync();
  if ((getSetting(SETTINGS.WORLD_STATE, null)?.version ?? 0) !== current.version) {
    await setSetting(SETTINGS.WORLD_STATE, current);
  }
  return current;
}

async function updateWorldState(mutator) {
  const state = cloneData(await getWorldState());
  await mutator(state);
  state.version = DATA_VERSION;
  state.customTags = uniqueStrings(state.customTags);
  await setSetting(SETTINGS.WORLD_STATE, state);
  return state;
}

export function getActorNotes(actor) {
  return getActorFlagNotes(actor);
}

export function getNoteById(actor, noteId) {
  return getActorNotes(actor).find((note) => note.id === noteId) ?? null;
}

export async function setActorNotes(actor, notes) {
  const normalized = [];
  for (const note of notes ?? []) {
    const candidate = normalizeNote(note, { actorUuid: actor.uuid, userId: game?.user?.id });
    const validation = validateNote(candidate);
    if (!validation.valid) {
      debugLog("Ignoring malformed note", candidate, validation.errors);
      continue;
    }
    normalized.push(candidate);
  }

  await actor.setFlag(MODULE_ID, FLAG_KEYS.NOTES, normalized);
  await addCustomTags(normalized.flatMap((note) => note.tags));
  return normalized;
}

export async function createNoteForActor(actor, data) {
  const notes = getActorNotes(actor);
  const note = createNoteData({ ...data, actorUuid: actor.uuid }, {
    userId: game?.user?.id,
    defaultStatus: getSetting(SETTINGS.DEFAULT_STATUS, NOTE_STATUSES.OPEN)
  });
  notes.unshift(note);
  await setActorNotes(actor, notes);
  return note;
}

export async function updateNoteForActor(actor, noteId, changes) {
  const notes = getActorNotes(actor);
  const index = notes.findIndex((note) => note.id === noteId);
  if (index === -1) return null;
  const updated = normalizeNote({
    ...notes[index],
    ...changes,
    updatedAt: new Date().toISOString(),
    updatedBy: game?.user?.id ?? notes[index].updatedBy
  }, { actorUuid: actor.uuid, userId: game?.user?.id });
  notes.splice(index, 1, updated);
  await setActorNotes(actor, notes);
  return updated;
}

export async function deleteNoteForActor(actor, noteId) {
  const notes = getActorNotes(actor).filter((note) => note.id !== noteId);
  await setActorNotes(actor, notes);
}

export async function archiveNoteForActor(actor, noteId) {
  return updateNoteForActor(actor, noteId, { status: NOTE_STATUSES.ARCHIVED });
}

export async function resolveNoteForActor(actor, noteId) {
  return updateNoteForActor(actor, noteId, { status: NOTE_STATUSES.RESOLVED });
}

export async function toggleResolvedNoteForActor(actor, noteId) {
  const note = getNoteById(actor, noteId);
  if (!note) return null;
  const status = note.status === NOTE_STATUSES.RESOLVED ? NOTE_STATUSES.OPEN : NOTE_STATUSES.RESOLVED;
  return updateNoteForActor(actor, noteId, { status });
}

export async function duplicateNoteForActor(actor, noteId) {
  const source = getNoteById(actor, noteId);
  if (!source) return null;
  const notes = getActorNotes(actor);
  const duplicate = duplicateNoteData(source, {
    actorUuid: actor.uuid,
    userId: game?.user?.id,
    defaultStatus: getSetting(SETTINGS.DEFAULT_STATUS, NOTE_STATUSES.OPEN)
  });
  notes.unshift(duplicate);
  await setActorNotes(actor, notes);
  return duplicate;
}

export async function addCustomTags(tags) {
  const nextTags = uniqueStrings(tags ?? []);
  if (!nextTags.length) return getWorldState();
  return updateWorldState((state) => {
    state.customTags = uniqueStrings([...(state.customTags ?? []), ...nextTags]);
  });
}

export async function setActorTrackingMode(actorUuid, mode) {
  return updateWorldState((state) => {
    if (mode === TRACKING_MODES.AUTO) delete state.actorTracking[actorUuid];
    else state.actorTracking[actorUuid] = mode;
  });
}

export async function getAvailableTags() {
  return getWorldStateSync().customTags ?? [];
}

function noteMatchesFilters(note, filters) {
  if (filters.statusFilter && filters.statusFilter !== "all" && note.status !== filters.statusFilter) return false;
  if (filters.priorityFilter && filters.priorityFilter !== "all" && note.priority !== filters.priorityFilter) return false;
  if (filters.tagFilter && filters.tagFilter !== "all" && !(note.tags ?? []).some((tag) => normalizeText(tag) === normalizeText(filters.tagFilter))) return false;
  if (filters.search) {
    const haystack = [note.title, note.body, ...(note.tags ?? [])].join(" ").toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  if (filters.hideArchived && note.status === NOTE_STATUSES.ARCHIVED) return false;
  if (filters.prepOnly) {
    const needsPrep = note.status === NOTE_STATUSES.NEXT_SESSION || note.priority === NOTE_PRIORITIES.HIGH || note.priority === NOTE_PRIORITIES.URGENT;
    if (!needsPrep) return false;
  }
  return true;
}

export function summarizeActor(actor) {
  const notes = getActorNotes(actor);
  const counts = summarizeCounts(notes);
  return {
    actorUuid: actor.uuid,
    actorName: actor.name,
    actorImg: getActorImage(actor),
    notes,
    counts,
    hasVisibleIndicator: counts.open > 0 || counts.nextSession > 0,
    hasTokenIndicator: counts.nextSession > 0 || counts.urgent > 0
  };
}

export async function getTrackedActorSummaries(filters = {}) {
  const state = await getWorldState();
  const actors = game?.actors?.contents ?? [];
  const summaries = [];

  for (const actor of actors) {
    const notes = getActorNotes(actor);
    const hidden = state.actorTracking?.[actor.uuid] === TRACKING_MODES.HIDDEN;
    if (!filters.includeHiddenActors && !shouldTrackActor(actor, state, notes.length)) continue;
    if (filters.includeHiddenActors && !shouldTrackActor(actor, state, notes.length) && !hidden) continue;
    if (filters.actorFilter && filters.actorFilter !== "all" && actor.uuid !== filters.actorFilter) continue;
    const filteredNotes = sortNotes(notes.filter((note) => noteMatchesFilters(note, filters)));
    summaries.push({
      actor,
      actorUuid: actor.uuid,
      actorName: actor.name,
      actorImg: getActorImage(actor),
      hidden,
      counts: summarizeCounts(notes),
      filteredNotes
    });
  }

  summaries.sort((left, right) => left.actorName.localeCompare(right.actorName, game?.i18n?.lang ?? "en"));
  return summaries;
}

export async function getActorRecoverySummaries(filters = {}) {
  return getTrackedActorSummaries({ ...filters, actorFilter: "all", includeHiddenActors: true });
}

export async function getFlatFilteredNotes(filters = {}) {
  const summaries = await getTrackedActorSummaries(filters);
  const notes = [];

  for (const summary of summaries) {
    for (const note of summary.filteredNotes) {
      notes.push({
        ...note,
        actorUuid: summary.actorUuid,
        actorName: summary.actorName,
        actorImg: summary.actorImg
      });
    }
  }

  return sortNotes(notes);
}

export async function getDashboardSummary(filters = {}) {
  const summaries = await getTrackedActorSummaries(filters);
  const notes = summaries.flatMap((entry) => entry.filteredNotes);
  const counts = summarizeCounts(notes);
  return {
    actors: summaries.length,
    notes: notes.length,
    nextSession: counts.nextSession,
    urgent: counts.urgent
  };
}

export async function getPreparedDashboardGroups(filters = {}) {
  const groups = await getTrackedActorSummaries(filters);
  return Promise.all(groups.map(async (group) => ({
    actorUuid: group.actorUuid,
    actorName: group.actorName,
    actorImg: group.actorImg,
    counts: group.counts,
    notes: await Promise.all(group.filteredNotes.map((note) => prepareNoteForDisplay(note, { ...group, expandedBodyKeys: filters.expandedBodyKeys })))
  })));
}

export async function getPreparedFlatNotes(filters = {}) {
  const notes = await getFlatFilteredNotes(filters);
  return Promise.all(notes.map((note) => prepareNoteForDisplay(note, { ...note, expandedBodyKeys: filters.expandedBodyKeys })));
}

export async function stashActorNotesAsOrphans(actor) {
  const notes = getActorNotes(actor);
  if (!notes.length) return 0;

  await updateWorldState((state) => {
    const orphans = state.orphanNotes.map((entry) => normalizeOrphanRecord(entry)).filter(Boolean);
    for (const note of notes) {
      orphans.push({
        id: note.id,
        actorUuid: actor.uuid,
        actorName: actor.name,
        actorImg: getActorImage(actor),
        orphanedAt: new Date().toISOString(),
        note
      });
    }
    state.orphanNotes = orphans;
  });

  return notes.length;
}

export function getOrphanedNotes() {
  return getWorldStateSync().orphanNotes ?? [];
}

export async function addOrphanedImportNotes(records) {
  return updateWorldState((state) => {
    const merged = [...(state.orphanNotes ?? [])];
    for (const record of records) {
      const normalized = normalizeOrphanRecord(record);
      if (!normalized) continue;
      merged.push(normalized);
    }
    state.orphanNotes = merged;
  });
}

export async function remapOrphanedNotes(orphanIds, actor) {
  const orphanSet = new Set(orphanIds);
  const orphans = getOrphanedNotes();
  const remaining = [];
  const actorNotes = getActorNotes(actor);

  for (const orphan of orphans) {
    if (!orphanSet.has(orphan.id)) {
      remaining.push(orphan);
      continue;
    }

    const imported = normalizeNote(orphan.note, { actorUuid: actor.uuid, userId: game?.user?.id });
    const existingIndex = actorNotes.findIndex((note) => note.id === imported.id || notesLikelyDuplicate(note, imported));
    if (existingIndex >= 0) actorNotes.splice(existingIndex, 1, imported);
    else actorNotes.unshift(imported);
  }

  await setActorNotes(actor, actorNotes);
  await updateWorldState((state) => {
    state.orphanNotes = remaining;
  });
}

export async function archiveOrphanedNotes(orphanIds) {
  const orphanSet = new Set(orphanIds);
  return updateWorldState((state) => {
    state.orphanNotes = (state.orphanNotes ?? []).map((record) => {
      if (!orphanSet.has(record.id)) return record;
      return {
        ...record,
        note: {
          ...record.note,
          status: NOTE_STATUSES.ARCHIVED,
          updatedAt: new Date().toISOString(),
          updatedBy: game?.user?.id ?? record.note.updatedBy
        }
      };
    });
  });
}

export async function deleteOrphanedNotes(orphanIds) {
  const orphanSet = new Set(orphanIds);
  return updateWorldState((state) => {
    state.orphanNotes = (state.orphanNotes ?? []).filter((record) => !orphanSet.has(record.id));
  });
}

export function getActorIndicatorSummary(actor) {
  return summarizeActor(actor);
}
