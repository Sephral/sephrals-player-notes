import { NOTE_PRIORITIES, NOTE_STATUSES, NOTE_VISIBILITY } from "./constants.js";
import { createNoteForActor, getAvailableTags, updateNoteForActor } from "./note-repository.js";
import { format, formatDateTime, getSelectedTokenActors, getUserDisplayName, localize, parseTagsInput, tagOptions } from "./utils.js";
import { getSavedWindowPosition, saveDialogGeometryFromButton } from "./window-state.js";

function buildStatusOptions(selected) {
  return [
    { value: NOTE_STATUSES.OPEN, label: localize("SPN.Status.Open"), selected: selected === NOTE_STATUSES.OPEN },
    { value: NOTE_STATUSES.NEXT_SESSION, label: localize("SPN.Status.NextSession"), selected: selected === NOTE_STATUSES.NEXT_SESSION },
    { value: NOTE_STATUSES.RESOLVED, label: localize("SPN.Status.Resolved"), selected: selected === NOTE_STATUSES.RESOLVED },
    { value: NOTE_STATUSES.ARCHIVED, label: localize("SPN.Status.Archived"), selected: selected === NOTE_STATUSES.ARCHIVED }
  ];
}

function buildPriorityOptions(selected) {
  return [
    { value: NOTE_PRIORITIES.LOW, label: localize("SPN.Priority.Low"), selected: selected === NOTE_PRIORITIES.LOW },
    { value: NOTE_PRIORITIES.NORMAL, label: localize("SPN.Priority.Normal"), selected: selected === NOTE_PRIORITIES.NORMAL },
    { value: NOTE_PRIORITIES.HIGH, label: localize("SPN.Priority.High"), selected: selected === NOTE_PRIORITIES.HIGH },
    { value: NOTE_PRIORITIES.URGENT, label: localize("SPN.Priority.Urgent"), selected: selected === NOTE_PRIORITIES.URGENT }
  ];
}

function renderSelect(name, options) {
  return `<select name="${name}">${options.map((option) => `<option value="${option.value}" ${option.selected ? "selected" : ""}>${option.label}</option>`).join("")}</select>`;
}

function readEditorForm(form) {
  const data = new FormData(form);
  return {
    title: String(data.get("title") ?? "").trim(),
    body: String(data.get("body") ?? "").trim(),
    tags: parseTagsInput(String(data.get("tags") ?? "")),
    status: String(data.get("status") ?? NOTE_STATUSES.OPEN),
    priority: String(data.get("priority") ?? NOTE_PRIORITIES.NORMAL),
    visibility: NOTE_VISIBILITY.GM_ONLY
  };
}

function renderEditorMetadata(note) {
  if (!note) return "";
  const createdDate = formatDateTime(note.createdAt);
  const updatedDate = formatDateTime(note.updatedAt);
  const createdBy = getUserDisplayName(note.createdBy);
  const updatedBy = getUserDisplayName(note.updatedBy);
  const created = createdBy ? format("SPN.NoteMeta.CreatedBy", { date: createdDate, user: createdBy }) : format("SPN.NoteMeta.Created", { date: createdDate });
  const updated = updatedBy ? format("SPN.NoteMeta.UpdatedBy", { date: updatedDate, user: updatedBy }) : format("SPN.NoteMeta.Updated", { date: updatedDate });
  return `<p class="spn-muted spn-dialog__metadata">${foundry.utils.escapeHTML(created)}<br>${foundry.utils.escapeHTML(updated)}</p>`;
}

export async function promptNoteEditor({ actor, note = null, quick = false } = {}) {
  if (!actor) return null;
  const customTags = await getAvailableTags();
  const knownTagLabels = tagOptions(customTags).map((entry) => entry.label);
  const initial = note ?? {
    title: "",
    body: "",
    tags: [],
    status: NOTE_STATUSES.OPEN,
    priority: NOTE_PRIORITIES.NORMAL,
    visibility: NOTE_VISIBILITY.GM_ONLY
  };

  const content = `
    <div class="spn-dialog">
      <p class="spn-muted">${actor.name}</p>
      ${renderEditorMetadata(note)}
      <div class="spn-dialog__grid">
        <label>
          <span>${localize("SPN.Label.Title")}</span>
          <input type="text" name="title" value="${foundry.utils.escapeHTML(initial.title ?? "")}" autofocus>
        </label>
        <label>
          <span>${localize("SPN.Label.Tags")}</span>
          <input type="text" name="tags" value="${foundry.utils.escapeHTML((initial.tags ?? []).join(", "))}" placeholder="${foundry.utils.escapeHTML(knownTagLabels.join(", "))}">
        </label>
        <label>
          <span>${localize("SPN.Label.Status")}</span>
          ${renderSelect("status", buildStatusOptions(initial.status))}
        </label>
        <label>
          <span>${localize("SPN.Label.Priority")}</span>
          ${renderSelect("priority", buildPriorityOptions(initial.priority))}
        </label>
      </div>
      <label>
        <span>${localize("SPN.Label.Body")}</span>
        <textarea name="body" placeholder="@UUID[...]">${foundry.utils.escapeHTML(initial.body ?? "")}</textarea>
      </label>
    </div>`;

  const response = await foundry.applications.api.DialogV2.wait({
    window: {
      title: note ? localize("SPN.Dialog.Editor.EditTitle") : (quick ? localize("SPN.Button.QuickNote") : localize("SPN.Dialog.Editor.CreateTitle")),
      resizable: true
    },
    content,
    buttons: [
      {
        action: "save",
        label: localize("SPN.Button.Save"),
        default: true,
        callback: (_event, button) => {
          saveDialogGeometryFromButton("noteEditor", button);
          return readEditorForm(button.form);
        }
      },
      {
        action: "cancel",
        label: localize("SPN.Button.Cancel")
      }
    ],
    rejectClose: false,
    modal: true,
    position: getSavedWindowPosition("noteEditor", { width: 760, height: 620 })
  });

  if (!response || response === "cancel") return null;
  if (note) return updateNoteForActor(actor, note.id, response);
  return createNoteForActor(actor, response);
}

export async function promptQuickNoteForActors(actors = null) {
  const selectedActors = actors ?? getSelectedTokenActors();
  if (!selectedActors.length) return null;
  return promptNoteEditor({ actor: selectedActors[0] });
}
