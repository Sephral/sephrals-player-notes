import { DATA_VERSION, MODULE_ID, SETTINGS } from "./constants.js";
import { registerDebugProvider } from "./debug-file.mjs";
import { getActorNotes, getWorldStateSync } from "./note-repository.js";
import { getSetting } from "./settings.js";
import { format, localize } from "./utils.js";

function countBy(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

// Player Notes' part of the debug file of Sephral's modules: the stored notes in numbers, never their text.
export function describeDebugState() {
  const details = { dataVersion: DATA_VERSION, worldState: null, notes: null };
  try {
    const state = getWorldStateSync();
    const trackingModes = {};
    for (const mode of Object.values(state.actorTracking ?? {})) countBy(trackingModes, mode);
    details.worldState = {
      storedVersion: getSetting(SETTINGS.WORLD_STATE, null)?.version ?? null,
      version: state.version,
      trackingModes,
      customTags: state.customTags?.length ?? 0,
      orphans: state.orphanNotes?.length ?? 0
    };
  } catch (error) {
    details.worldState = { error: String(error?.message ?? error) };
  }
  try {
    const actors = globalThis.game?.actors?.contents ?? Array.from(globalThis.game?.actors?.values?.() ?? []);
    const notes = { actors: 0, notes: 0, byStatus: {}, byVisibility: {} };
    for (const actor of actors) {
      const list = getActorNotes(actor);
      if (!list.length) continue;
      notes.actors++;
      notes.notes += list.length;
      for (const note of list) {
        countBy(notes.byStatus, note.status);
        countBy(notes.byVisibility, note.visibility);
      }
    }
    details.notes = notes;
  } catch (error) {
    details.notes = { error: String(error?.message ?? error) };
  }
  return { details };
}

// The world state setting holds the text of orphaned notes, so it stays out of the settings part.
export function registerDebug() {
  registerDebugProvider({
    moduleId: MODULE_ID,
    label: () => localize("SPN.Debug.Entry"),
    notice: (file) => format("SPN.Debug.Saved", { file }),
    recent: describeDebugState,
    omitSettings: [SETTINGS.WORLD_STATE]
  });
}
