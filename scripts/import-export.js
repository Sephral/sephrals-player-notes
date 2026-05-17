import {
  EXPORT_FORMAT_VERSION,
  EXPORT_STATUS_FILTERS,
  IMPORT_MODES,
  MODULE_ID,
  NOTE_PRIORITIES,
  NOTE_STATUSES
} from "./constants.js";
import {
  addOrphanedImportNotes,
  createNoteForActor,
  getActorNotes,
  getAvailableTags,
  getOrphanedNotes,
  getTrackedActorSummaries,
  remapOrphanedNotes,
  setActorNotes,
  archiveOrphanedNotes,
  deleteOrphanedNotes
} from "./note-repository.js";
import { duplicateSignature, normalizeNote, notesLikelyDuplicate } from "./note-model.js";
import {
  cloneData,
  downloadData,
  format,
  formatDateTime,
  getActorImage,
  getPriorityLabel,
  getStatusLabel,
  getUserDisplayName,
  localize,
  normalizeText,
  parseTagsInput,
  resolveActorUuidSync,
  uniqueStrings
} from "./utils.js";
import { getSavedWindowPosition, saveDialogGeometryFromButton } from "./window-state.js";

function buildMetadata() {
  return {
    moduleId: MODULE_ID,
    moduleVersion: game.modules.get(MODULE_ID)?.version ?? "0.0.0",
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    foundryVersion: game.version,
    systemId: game.system?.id ?? "unknown",
    systemVersion: game.system?.version ?? "unknown",
    worldTitle: game.world?.title ?? game.world?.id ?? "Unknown World",
    exportDate: new Date().toISOString(),
    author: game.user?.name ?? null
  };
}

function exportFilename(extension) {
  const worldSlug = String(game.world?.id ?? "world").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  return `${MODULE_ID}-${worldSlug}.${extension}`;
}

function filterByStatus(notes, statusFilter) {
  if (!statusFilter || statusFilter === EXPORT_STATUS_FILTERS.ALL) return notes;
  return notes.filter((note) => note.status === statusFilter);
}

function flattenActorSelection(scope, filteredActorUuids, selectedActorUuids) {
  if (scope === "selected") return selectedActorUuids;
  if (scope === "filtered") return filteredActorUuids;
  return null;
}

function markdownMetadataLine(type, date, user) {
  const formattedDate = formatDateTime(date);
  const userName = getUserDisplayName(user);
  if (!formattedDate && !userName) return null;
  const created = type === "created";
  if (!userName) return format(created ? "SPN.NoteMeta.Created" : "SPN.NoteMeta.Updated", { date: formattedDate });
  return format(created ? "SPN.NoteMeta.CreatedBy" : "SPN.NoteMeta.UpdatedBy", { date: formattedDate, user: userName });
}

export async function buildExportPayload({ actorUuids = null, statusFilter = EXPORT_STATUS_FILTERS.ALL } = {}) {
  const summaries = await getTrackedActorSummaries({ actorFilter: "all" });
  const selectedSet = actorUuids ? new Set(actorUuids) : null;
  const notes = [];

  for (const summary of summaries) {
    if (selectedSet && !selectedSet.has(summary.actorUuid)) continue;
    const filteredNotes = filterByStatus(summary.filteredNotes.length ? summary.filteredNotes : summary.actor ? getActorNotes(summary.actor) : [], statusFilter);
    for (const note of filteredNotes) {
      notes.push({
        id: note.id,
        actorUuid: note.actorUuid,
        title: note.title,
        body: note.body,
        tags: note.tags ?? [],
        status: note.status,
        priority: note.priority,
        visibility: note.visibility,
        createdAt: note.createdAt,
        createdBy: note.createdBy,
        createdByName: getUserDisplayName(note.createdBy) || null,
        updatedAt: note.updatedAt,
        updatedBy: note.updatedBy,
        updatedByName: getUserDisplayName(note.updatedBy) || null,
        actorName: summary.actorName,
        actorImg: summary.actorImg
      });
    }
  }

  return {
    metadata: buildMetadata(),
    notes
  };
}

export async function exportNotesJson(options = {}) {
  const payload = await buildExportPayload(options);
  downloadData(exportFilename("json"), JSON.stringify(payload, null, 2), "application/json");
  ui.notifications.info(localize("SPN.Notification.ExportReady"));
  return payload;
}

export async function exportSessionPrepMarkdown({ actorUuids = null } = {}) {
  const summaries = await getTrackedActorSummaries({ actorFilter: "all", prepOnly: true, hideArchived: true });
  const selectedSet = actorUuids ? new Set(actorUuids) : null;
  const lines = [
    `# ${format("SPN.Export.MarkdownTitle", { world: game.world?.title ?? "World" })}`,
    "",
    `${localize("SPN.Import.Metadata")}: ${formatDateTime(new Date().toISOString())}`,
    ""
  ];

  for (const summary of summaries) {
    if (selectedSet && !selectedSet.has(summary.actorUuid)) continue;
    if (!summary.filteredNotes.length) continue;
    lines.push(`## ${summary.actorName}`);
    lines.push("");
    for (const note of summary.filteredNotes) {
      const createdLine = markdownMetadataLine("created", note.createdAt, note.createdBy);
      const updatedLine = markdownMetadataLine("updated", note.updatedAt, note.updatedBy);
      lines.push(`### ${note.title}`);
      lines.push("");
      lines.push(`- ${localize("SPN.Label.Status")}: ${getStatusLabel(note.status)}`);
      lines.push(`- ${localize("SPN.Label.Priority")}: ${getPriorityLabel(note.priority)}`);
      if (createdLine) lines.push(`- ${createdLine}`);
      if (updatedLine) lines.push(`- ${updatedLine}`);
      if (note.tags?.length) lines.push(`- ${localize("SPN.Label.Tags")}: ${note.tags.join(", ")}`);
      if (note.body) {
        lines.push("");
        lines.push(note.body);
      }
      lines.push("");
    }
    lines.push("");
  }

  const markdown = lines.join("\n");
  downloadData(exportFilename("md"), markdown, "text/markdown");
  return markdown;
}

function exportStatusOptions(selected) {
  return [
    { value: EXPORT_STATUS_FILTERS.ALL, label: localize("SPN.Export.Status.All"), selected: selected === EXPORT_STATUS_FILTERS.ALL },
    { value: EXPORT_STATUS_FILTERS.OPEN, label: localize("SPN.Export.Status.Open"), selected: selected === EXPORT_STATUS_FILTERS.OPEN },
    { value: EXPORT_STATUS_FILTERS.NEXT_SESSION, label: localize("SPN.Export.Status.NextSession"), selected: selected === EXPORT_STATUS_FILTERS.NEXT_SESSION },
    { value: EXPORT_STATUS_FILTERS.RESOLVED, label: localize("SPN.Export.Status.Resolved"), selected: selected === EXPORT_STATUS_FILTERS.RESOLVED },
    { value: EXPORT_STATUS_FILTERS.ARCHIVED, label: localize("SPN.Export.Status.Archived"), selected: selected === EXPORT_STATUS_FILTERS.ARCHIVED }
  ];
}

function renderOptions(options) {
  return options.map((option) => `<option value="${option.value}" ${option.selected ? "selected" : ""}>${option.label}</option>`).join("");
}

export async function promptExportNotes(filteredActorUuids = null) {
  const summaries = await getTrackedActorSummaries();
  const actorChecklist = summaries.map((summary) => `
    <label class="spn-check-row">
      <input type="checkbox" name="actorUuid" value="${summary.actorUuid}">
      <span>${foundry.utils.escapeHTML(summary.actorName)}</span>
    </label>`).join("");

  const content = `
    <div class="spn-dialog spn-dialog--export">
      <div class="spn-dialog__grid">
        <label>
          <span>${localize("SPN.Label.Selection")}</span>
          <select name="scope">
            <option value="all">${localize("SPN.Export.Scope.AllActors")}</option>
            <option value="filtered">${localize("SPN.Export.Scope.FilteredActors")}</option>
            <option value="selected">${localize("SPN.Export.Scope.SelectedActors")}</option>
          </select>
        </label>
        <label>
          <span>${localize("SPN.Label.Status")}</span>
          <select name="statusFilter">${renderOptions(exportStatusOptions(EXPORT_STATUS_FILTERS.ALL))}</select>
        </label>
      </div>
      <fieldset class="spn-export-actors">
        <legend>${localize("SPN.Export.Scope.SelectedActors")}</legend>
        <div class="spn-export-actor-list">${actorChecklist}</div>
      </fieldset>
    </div>`;

  const response = await foundry.applications.api.DialogV2.wait({
    window: { title: localize("SPN.Dialog.Export.Title"), resizable: true },
    content,
    buttons: [
      {
        action: "json",
        label: localize("SPN.Button.ExportJson"),
        default: true,
        callback: (_event, button) => {
          saveDialogGeometryFromButton("export", button);
          const form = button.form;
          return {
            exportType: "json",
            scope: form.elements.scope.value,
            statusFilter: form.elements.statusFilter.value,
            selectedActorUuids: Array.from(form.querySelectorAll('input[name="actorUuid"]:checked')).map((input) => input.value)
          };
        }
      },
      {
        action: "markdown",
        label: localize("SPN.Button.ExportMarkdown"),
        callback: (_event, button) => {
          saveDialogGeometryFromButton("export", button);
          const form = button.form;
          return {
            exportType: "markdown",
            scope: form.elements.scope.value,
            selectedActorUuids: Array.from(form.querySelectorAll('input[name="actorUuid"]:checked')).map((input) => input.value)
          };
        }
      },
      {
        action: "cancel",
        label: localize("SPN.Button.Cancel"),
        callback: (_event, button) => saveDialogGeometryFromButton("export", button)
      }
    ],
    rejectClose: false,
    modal: true,
    position: getSavedWindowPosition("export", { width: 820, height: 720 })
  });

  if (!response || response === "cancel") return null;

  const actorUuids = flattenActorSelection(response.scope, filteredActorUuids, response.selectedActorUuids);
  if (response.exportType === "markdown") return exportSessionPrepMarkdown({ actorUuids });
  return exportNotesJson({ actorUuids, statusFilter: response.statusFilter });
}

async function pickImportText() {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: localize("SPN.Dialog.Import.Title"), resizable: true },
    content: `
      <div class="spn-dialog">
        <label>
          <span>${localize("SPN.Dialog.Import.Title")}</span>
          <input type="file" name="payload" accept="application/json,.json" autofocus>
        </label>
      </div>`,
    ok: {
      label: localize("SPN.Button.Import"),
      callback: async (_event, button) => {
        saveDialogGeometryFromButton("importFile", button);
        const file = button.form.elements.payload.files?.[0];
        if (!file) throw new Error(localize("SPN.Dialog.Import.NoFile"));
        return file.text();
      }
    },
    rejectClose: false,
    modal: true,
    position: getSavedWindowPosition("importFile", { width: 520, height: 260 })
  });
}

export function previewImportPayload(payload) {
  const notes = Array.isArray(payload?.notes) ? payload.notes : [];
  const actorRefs = new Map();
  const duplicateIds = new Set();
  const seenIds = new Set();
  const statuses = new Set();
  const tags = new Set();
  const likelyDuplicates = [];

  const existingNotes = new Map();
  for (const actor of game?.actors?.contents ?? []) {
    for (const note of getActorNotes(actor)) {
      existingNotes.set(`${actor.uuid}::${duplicateSignature(note)}`, note);
    }
  }

  for (const raw of notes) {
    const normalized = normalizeNote(raw, { actorUuid: raw.actorUuid });
    if (seenIds.has(normalized.id)) duplicateIds.add(normalized.id);
    seenIds.add(normalized.id);
    statuses.add(normalized.status);
    for (const tag of normalized.tags) tags.add(tag);

    const actorUuid = normalized.actorUuid;
    const actor = resolveActorUuidSync(actorUuid);
    const current = actorRefs.get(actorUuid) ?? {
      actorUuid,
      actorName: raw.actorName ?? actor?.name ?? actorUuid,
      actorImg: raw.actorImg ?? actor?.img ?? "icons/svg/mystery-man.svg",
      exists: Boolean(actor),
      noteCount: 0
    };
    current.noteCount += 1;
    actorRefs.set(actorUuid, current);

    const likelyMatch = existingNotes.get(`${actorUuid}::${duplicateSignature(normalized)}`);
    if (likelyMatch) likelyDuplicates.push({ imported: normalized, existing: likelyMatch });
  }

  return {
    payload,
    notes: notes.map((note) => normalizeNote(note, { actorUuid: note.actorUuid })),
    metadata: payload?.metadata ?? {},
    actorRefs: [...actorRefs.values()],
    missingActors: [...actorRefs.values()].filter((entry) => !entry.exists),
    duplicateIds: [...duplicateIds],
    likelyDuplicates,
    statuses: [...statuses],
    tags: [...tags]
  };
}

async function promptImportPreview(preview) {
  const actorOptions = (game?.actors?.contents ?? [])
    .map((actor) => `<option value="${actor.uuid}">${foundry.utils.escapeHTML(actor.name)}</option>`)
    .join("");

  const mappingHtml = preview.missingActors.length
    ? preview.missingActors.map((entry) => `
      <label>
        <span>${foundry.utils.escapeHTML(entry.actorName)} (${entry.noteCount})</span>
        <select name="map:${entry.actorUuid}">
          <option value="__orphan__">${localize("SPN.Import.Unmapped")}</option>
          ${actorOptions}
        </select>
      </label>`).join("")
    : `<p class="spn-muted">${localize("SPN.Dialog.Popup.Empty")}</p>`;

  const content = `
    <div class="spn-dialog spn-import-preview">
      <section>
        <strong>${localize("SPN.Import.Metadata")}</strong>
        <pre>${foundry.utils.escapeHTML(JSON.stringify(preview.metadata, null, 2))}</pre>
      </section>
      <section class="spn-dialog__grid">
        <span class="spn-pill">${preview.notes.length} ${localize("SPN.Import.NoteCount")}</span>
        <span class="spn-pill">${preview.actorRefs.length} ${localize("SPN.Import.ReferencedActors")}</span>
        <span class="spn-pill">${preview.missingActors.length} ${localize("SPN.Import.MissingCount")}</span>
        <span class="spn-pill">${preview.duplicateIds.length} ${localize("SPN.Import.DuplicateCount")}</span>
        <span class="spn-pill">${preview.likelyDuplicates.length} ${localize("SPN.Import.ConflictCount")}</span>
      </section>
      <label>
        <span>${localize("SPN.Label.Mode")}</span>
        <select name="importMode">
          <option value="${IMPORT_MODES.NEW}">${localize("SPN.Dialog.Import.New")}</option>
          <option value="${IMPORT_MODES.MERGE}">${localize("SPN.Dialog.Import.Merge")}</option>
          <option value="${IMPORT_MODES.SKIP}">${localize("SPN.Dialog.Import.Skip")}</option>
          <option value="${IMPORT_MODES.REPLACE}">${localize("SPN.Dialog.Import.Replace")}</option>
        </select>
      </label>
      <fieldset>
        <legend>${localize("SPN.Label.MissingActors")}</legend>
        <div class="spn-dialog__grid">${mappingHtml}</div>
      </fieldset>
      <p class="spn-muted">${localize("SPN.Import.Warning")}</p>
    </div>`;

  return foundry.applications.api.DialogV2.wait({
    window: { title: localize("SPN.Dialog.Import.PreviewTitle"), resizable: true },
    content,
    buttons: [
      {
        action: "import",
        label: localize("SPN.Button.Import"),
        default: true,
        callback: (_event, button) => {
          saveDialogGeometryFromButton("importPreview", button);
          const form = button.form;
          const mappings = {};
          for (const entry of preview.missingActors) {
            mappings[entry.actorUuid] = form.elements[`map:${entry.actorUuid}`].value;
          }
          return {
            importMode: form.elements.importMode.value,
            mappings
          };
        }
      },
      {
        action: "cancel",
        label: localize("SPN.Button.Cancel"),
        callback: (_event, button) => saveDialogGeometryFromButton("importPreview", button)
      }
    ],
    rejectClose: false,
    modal: true,
    position: getSavedWindowPosition("importPreview", { width: 720, height: 640 })
  });
}

function mergeImportedNote(existing, imported) {
  return normalizeNote({
    ...existing,
    ...imported,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy
  }, { actorUuid: imported.actorUuid });
}

export async function applyImportPreview(preview, decision) {
  const actorMap = new Map();
  const orphans = [];

  for (const imported of preview.notes) {
    const mappedActorUuid = decision.mappings?.[imported.actorUuid] && decision.mappings[imported.actorUuid] !== "__orphan__"
      ? decision.mappings[imported.actorUuid]
      : imported.actorUuid;
    const actor = resolveActorUuidSync(mappedActorUuid);
    if (!actor) {
      orphans.push({
        actorUuid: imported.actorUuid,
        actorName: preview.actorRefs.find((entry) => entry.actorUuid === imported.actorUuid)?.actorName ?? imported.actorUuid,
        actorImg: preview.actorRefs.find((entry) => entry.actorUuid === imported.actorUuid)?.actorImg ?? "icons/svg/mystery-man.svg",
        note: imported
      });
      continue;
    }

    const targetNotes = actorMap.get(actor.uuid) ?? cloneData(getActorNotes(actor));
    const importedNote = normalizeNote(imported, { actorUuid: actor.uuid, userId: game?.user?.id });
    const exactIndex = targetNotes.findIndex((note) => note.id === importedNote.id);
    const duplicateIndex = targetNotes.findIndex((note) => notesLikelyDuplicate(note, importedNote));
    const matchIndex = exactIndex >= 0 ? exactIndex : duplicateIndex;

    switch (decision.importMode) {
      case IMPORT_MODES.SKIP:
        if (matchIndex >= 0) break;
        targetNotes.unshift(importedNote);
        break;

      case IMPORT_MODES.REPLACE:
        if (matchIndex >= 0) targetNotes.splice(matchIndex, 1, importedNote);
        else targetNotes.unshift(importedNote);
        break;

      case IMPORT_MODES.MERGE:
        if (matchIndex >= 0) targetNotes.splice(matchIndex, 1, mergeImportedNote(targetNotes[matchIndex], importedNote));
        else targetNotes.unshift(importedNote);
        break;

      case IMPORT_MODES.NEW:
      default:
        if (matchIndex >= 0) importedNote.id = `${importedNote.id}-imported`;
        targetNotes.unshift(importedNote);
        break;
    }

    actorMap.set(actor.uuid, targetNotes);
  }

  for (const [actorUuid, notes] of actorMap.entries()) {
    const actor = resolveActorUuidSync(actorUuid);
    if (actor) await setActorNotes(actor, notes);
  }

  if (orphans.length) await addOrphanedImportNotes(orphans);

  ui.notifications.info(localize("SPN.Notification.ImportComplete"));
}

export async function promptImportNotes() {
  let importText = null;

  try {
    importText = await pickImportText();
  } catch (error) {
    ui.notifications.error(error.message ?? localize("SPN.Dialog.Import.NoFile"));
    return null;
  }

  if (!importText) return null;

  const payload = JSON.parse(importText);
  const preview = previewImportPayload(payload);
  const decision = await promptImportPreview(preview);
  if (!decision || decision === "cancel") return null;
  await applyImportPreview(preview, decision);
  return preview;
}

export async function openOrphanCleanupDialog() {
  const orphans = getOrphanedNotes();
  const actorOptions = (game?.actors?.contents ?? []).map((actor) => `<option value="${actor.uuid}">${foundry.utils.escapeHTML(actor.name)}</option>`).join("");
  const rows = orphans.length
    ? orphans.map((entry) => `
      <label>
        <input type="checkbox" name="orphanId" value="${entry.id}" checked>
        <span>${foundry.utils.escapeHTML(entry.actorName)}: ${foundry.utils.escapeHTML(entry.note.title)}</span>
      </label>`).join("")
    : `<p class="spn-muted">${localize("SPN.Label.NoNotes")}</p>`;

  const response = await foundry.applications.api.DialogV2.wait({
    window: { title: localize("SPN.Dialog.Orphans.Title"), resizable: true },
    content: `
      <div class="spn-dialog spn-orphans">
        <div class="spn-dialog__grid">${rows}</div>
        <label>
          <span>${localize("SPN.Import.MapTo")}</span>
          <select name="targetActorUuid">
            <option value="">${localize("SPN.Import.Unmapped")}</option>
            ${actorOptions}
          </select>
        </label>
      </div>`,
    buttons: [
      {
        action: "remap",
        label: localize("SPN.Button.Remap"),
        callback: (_event, button) => {
          saveDialogGeometryFromButton("orphans", button);
          return {
            action: "remap",
            ids: Array.from(button.form.querySelectorAll('input[name="orphanId"]:checked')).map((input) => input.value),
            targetActorUuid: button.form.elements.targetActorUuid.value
          };
        }
      },
      {
        action: "archive",
        label: localize("SPN.Button.Archive"),
        callback: (_event, button) => {
          saveDialogGeometryFromButton("orphans", button);
          return {
            action: "archive",
            ids: Array.from(button.form.querySelectorAll('input[name="orphanId"]:checked')).map((input) => input.value)
          };
        }
      },
      {
        action: "export",
        label: localize("SPN.Button.ExportJson"),
        callback: (_event, button) => {
          saveDialogGeometryFromButton("orphans", button);
          return {
            action: "export",
            ids: Array.from(button.form.querySelectorAll('input[name="orphanId"]:checked')).map((input) => input.value)
          };
        }
      },
      {
        action: "delete",
        label: localize("SPN.Button.Delete"),
        callback: (_event, button) => {
          saveDialogGeometryFromButton("orphans", button);
          return {
            action: "delete",
            ids: Array.from(button.form.querySelectorAll('input[name="orphanId"]:checked')).map((input) => input.value)
          };
        }
      },
      {
        action: "cancel",
        label: localize("SPN.Button.Cancel"),
        callback: (_event, button) => saveDialogGeometryFromButton("orphans", button)
      }
    ],
    rejectClose: false,
    modal: true,
    position: getSavedWindowPosition("orphans", { width: 680, height: 560 })
  });

  if (!response || response === "cancel") return null;
  if (!response.ids?.length) return null;

  switch (response.action) {
    case "remap": {
      const actor = response.targetActorUuid ? resolveActorUuidSync(response.targetActorUuid) : null;
      if (actor) await remapOrphanedNotes(response.ids, actor);
      break;
    }
    case "archive":
      await archiveOrphanedNotes(response.ids);
      break;
    case "delete":
      await deleteOrphanedNotes(response.ids);
      break;
    case "export": {
      const selected = getOrphanedNotes().filter((entry) => response.ids.includes(entry.id));
      downloadData(`${MODULE_ID}-orphans.json`, JSON.stringify({ metadata: buildMetadata(), orphanNotes: selected }, null, 2), "application/json");
      break;
    }
  }

  return response;
}
