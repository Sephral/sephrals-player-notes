import {
  BUILTIN_TAGS,
  DASHBOARD_VIEWS,
  LANGUAGE_CHOICES,
  MODULE_ID,
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  NOTE_VISIBILITY,
  SETTINGS,
  TRACKING_MODES
} from "./constants.js";

const BUILTIN_TAG_MAP = new Map(BUILTIN_TAGS.map((entry) => [entry.value, entry.key]));
const MODULE_LANGUAGE_CODES = [LANGUAGE_CHOICES.ENGLISH, LANGUAGE_CHOICES.GERMAN];

let moduleTranslations = {};
let translationsPromise = null;

function getConfiguredLanguage() {
  const fullKey = `${MODULE_ID}.${SETTINGS.LANGUAGE}`;
  if (!game?.settings?.settings?.has(fullKey)) return LANGUAGE_CHOICES.FOLLOW_FOUNDRY;
  try {
    return game.settings.get(MODULE_ID, SETTINGS.LANGUAGE) || LANGUAGE_CHOICES.FOLLOW_FOUNDRY;
  } catch {
    return LANGUAGE_CHOICES.FOLLOW_FOUNDRY;
  }
}

function getEffectiveModuleLanguage() {
  const configured = getConfiguredLanguage();
  if (configured && configured !== LANGUAGE_CHOICES.FOLLOW_FOUNDRY) return configured;
  const foundryLanguage = String(game?.i18n?.lang ?? LANGUAGE_CHOICES.ENGLISH).toLowerCase();
  return foundryLanguage.startsWith("de") ? LANGUAGE_CHOICES.GERMAN : LANGUAGE_CHOICES.ENGLISH;
}

export async function loadModuleTranslations() {
  if (translationsPromise) return translationsPromise;
  translationsPromise = Promise.all(MODULE_LANGUAGE_CODES.map(async (language) => {
    try {
      const response = await fetch(`modules/${MODULE_ID}/lang/${language}.json`);
      if (!response.ok) return [language, {}];
      return [language, await response.json()];
    } catch (error) {
      console.warn(`${MODULE_ID} | Failed to load ${language} translations`, error);
      return [language, {}];
    }
  })).then((entries) => {
    moduleTranslations = Object.fromEntries(entries);
    return moduleTranslations;
  });
  return translationsPromise;
}

export function registerTemplateLocalization() {
  const handlebars = globalThis.Handlebars ?? foundry?.applications?.handlebars?.handlebars;
  handlebars?.registerHelper?.("spnLocalize", (key) => localize(String(key ?? "")));
}

export function localize(key) {
  const language = getEffectiveModuleLanguage();
  return moduleTranslations?.[language]?.[key] ?? game?.i18n?.localize?.(key) ?? key;
}

export async function renderAppTemplate(path, context) {
  const renderer = foundry?.applications?.handlebars?.renderTemplate ?? globalThis.renderTemplate;
  if (typeof renderer !== "function") throw new Error(`No template renderer available for ${path}`);
  return renderer(path, context);
}

export function format(key, data = {}) {
  const template = localize(key);
  return Object.entries(data).reduce((text, [property, value]) => text.replaceAll(`{${property}}`, String(value ?? "")), template);
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const locale = String(game?.i18n?.lang ?? "en");
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function getUserDisplayName(userId) {
  if (!userId) return "";
  return game?.users?.get?.(userId)?.name ?? String(userId);
}

export function isGM() {
  return Boolean(game?.user?.isGM);
}

export function debugEnabled() {
  try {
    return Boolean(game?.settings?.get(MODULE_ID, SETTINGS.DEBUG_MODE));
  } catch {
    return false;
  }
}

export function debugLog(...args) {
  if (!debugEnabled()) return;
  console.debug(`${MODULE_ID} |`, ...args);
}

export function cloneData(data) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(data);
  if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(data);
  return JSON.parse(JSON.stringify(data));
}

export function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values ?? []) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

export function parseTagsInput(input) {
  if (Array.isArray(input)) return uniqueStrings(input);
  return uniqueStrings(String(input ?? "").split(/[,\n]/));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function getStatusLabel(status) {
  switch (status) {
    case NOTE_STATUSES.NEXT_SESSION: return localize("SPN.Status.NextSession");
    case NOTE_STATUSES.RESOLVED: return localize("SPN.Status.Resolved");
    case NOTE_STATUSES.ARCHIVED: return localize("SPN.Status.Archived");
    case NOTE_STATUSES.OPEN:
    default: return localize("SPN.Status.Open");
  }
}

export function getPriorityLabel(priority) {
  switch (priority) {
    case NOTE_PRIORITIES.LOW: return localize("SPN.Priority.Low");
    case NOTE_PRIORITIES.HIGH: return localize("SPN.Priority.High");
    case NOTE_PRIORITIES.URGENT: return localize("SPN.Priority.Urgent");
    case NOTE_PRIORITIES.NORMAL:
    default: return localize("SPN.Priority.Normal");
  }
}

export function getVisibilityLabel(visibility) {
  switch (visibility) {
    case NOTE_VISIBILITY.PLAYER_VISIBLE: return localize("SPN.Visibility.PlayerVisible");
    case NOTE_VISIBILITY.GM_ONLY:
    default: return localize("SPN.Visibility.GMOnly");
  }
}

export function getViewLabel(view) {
  switch (view) {
    case DASHBOARD_VIEWS.FLAT: return localize("SPN.View.Flat");
    case DASHBOARD_VIEWS.NEXT_SESSION: return localize("SPN.View.Prep");
    case DASHBOARD_VIEWS.COMPACT: return localize("SPN.View.Compact");
    case DASHBOARD_VIEWS.PREP: return localize("SPN.View.Prep");
    case DASHBOARD_VIEWS.GROUPED:
    default: return localize("SPN.View.Grouped");
  }
}

export function getTrackingModeLabel(mode) {
  switch (mode) {
    case TRACKING_MODES.TRACKED: return localize("SPN.Button.Track");
    case TRACKING_MODES.HIDDEN: return localize("SPN.Button.Hide");
    case TRACKING_MODES.AUTO:
    default: return localize("SPN.Label.All");
  }
}

export function getTagLabel(tag) {
  const normalized = normalizeText(tag);
  const key = BUILTIN_TAG_MAP.get(normalized);
  return key ? localize(key) : String(tag ?? "").trim();
}

export function tagOptions(customTags = []) {
  const builtin = BUILTIN_TAGS.map((entry) => ({ value: entry.value, label: localize(entry.key) }));
  const custom = uniqueStrings(customTags)
    .filter((tag) => !BUILTIN_TAG_MAP.has(normalizeText(tag)))
    .map((tag) => ({ value: tag, label: tag }));
  return [...builtin, ...custom].sort((left, right) => left.label.localeCompare(right.label, game?.i18n?.lang ?? "en"));
}

export function getActorImage(actor) {
  return actor?.img || actor?.prototypeToken?.texture?.src || actor?.prototypeToken?.src || "icons/svg/mystery-man.svg";
}

export function resolveActorUuidSync(uuid) {
  if (!uuid) return null;
  if (typeof globalThis.fromUuidSync === "function") return globalThis.fromUuidSync(uuid);
  const match = String(uuid).match(/^Actor\.([^\.]+)$/);
  if (match) return game?.actors?.get(match[1]) ?? null;
  return null;
}

export async function resolveActorUuid(uuid) {
  if (!uuid) return null;
  if (typeof globalThis.fromUuid === "function") return globalThis.fromUuid(uuid);
  return resolveActorUuidSync(uuid);
}

export function getSelectedTokenActors() {
  const controlled = canvas?.tokens?.controlled ?? [];
  const actors = [];
  const seen = new Set();
  for (const token of controlled) {
    const actor = token?.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    actors.push(actor);
  }
  return actors;
}

export function getSingleSelectedActor() {
  const actors = getSelectedTokenActors();
  return actors.length === 1 ? actors[0] : null;
}

export function getContextDocumentId(target) {
  const element = target?.closest ? target.closest("[data-document-id], [data-entry-id], [data-id]") : target;
  return element?.dataset?.documentId || element?.dataset?.entryId || element?.dataset?.id || null;
}

export async function enrichNoteBody(body) {
  const source = String(body ?? "").trim();
  if (!source) return "";
  const TextEditorImplementation = foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (!TextEditorImplementation?.enrichHTML) return `<p>${escapeHtml(source).replaceAll("\n", "<br>")}</p>`;

  try {
    return await TextEditorImplementation.enrichHTML(source, {
      async: true,
      documents: true,
      links: true,
      secrets: false
    });
  } catch (error) {
    debugLog("Failed to enrich note body", error);
    return `<p>${escapeHtml(source).replaceAll("\n", "<br>")}</p>`;
  }
}

export function downloadData(filename, data, mimeType = "application/json") {
  const saveFile = foundry?.utils?.saveDataToFile;
  if (typeof saveFile === "function") {
    saveFile(data, mimeType, filename);
    return;
  }

  if ("saveDataToFile" in globalThis && typeof globalThis.saveDataToFile === "function") {
    globalThis.saveDataToFile(data, mimeType, filename);
    return;
  }

  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function notePriorityRank(priority) {
  switch (priority) {
    case NOTE_PRIORITIES.URGENT: return 4;
    case NOTE_PRIORITIES.HIGH: return 3;
    case NOTE_PRIORITIES.NORMAL: return 2;
    case NOTE_PRIORITIES.LOW:
    default: return 1;
  }
}

export function sortNotes(notes) {
  return [...notes].sort((left, right) => {
    const priorityDelta = notePriorityRank(right.priority) - notePriorityRank(left.priority);
    if (priorityDelta !== 0) return priorityDelta;
    const leftNext = left.status === NOTE_STATUSES.NEXT_SESSION ? 1 : 0;
    const rightNext = right.status === NOTE_STATUSES.NEXT_SESSION ? 1 : 0;
    if (rightNext !== leftNext) return rightNext - leftNext;
    return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
  });
}

export async function prepareNoteForDisplay(note, actorData = {}) {
  const resolved = note.status === NOTE_STATUSES.RESOLVED;
  const bodyText = String(note.body ?? "");
  const bodyLineCount = bodyText ? bodyText.split(/\r?\n/).length : 0;
  const bodyKey = `${note.actorUuid ?? actorData.actorUuid ?? ""}:${note.id ?? ""}`;
  const expandedBodyKeys = actorData.expandedBodyKeys ?? new Set();
  const bodyExpanded = expandedBodyKeys.has(bodyKey);
  const bodyCollapsible = bodyLineCount > 5 || bodyText.length > 360;
  const createdDateLabel = formatDateTime(note.createdAt);
  const updatedDateLabel = formatDateTime(note.updatedAt);
  const createdByName = getUserDisplayName(note.createdBy);
  const updatedByName = getUserDisplayName(note.updatedBy);
  const createdMetaLabel = createdByName
    ? format("SPN.NoteMeta.CreatedBy", { date: createdDateLabel, user: createdByName })
    : format("SPN.NoteMeta.Created", { date: createdDateLabel });
  const updatedMetaLabel = updatedByName
    ? format("SPN.NoteMeta.UpdatedBy", { date: updatedDateLabel, user: updatedByName })
    : format("SPN.NoteMeta.Updated", { date: updatedDateLabel });
  return {
    ...note,
    actorUuid: note.actorUuid,
    actorName: actorData.actorName ?? actorData.name ?? "",
    actorImg: actorData.actorImg ?? actorData.img ?? "",
    statusLabel: getStatusLabel(note.status),
    priorityLabel: getPriorityLabel(note.priority),
    visibilityLabel: getVisibilityLabel(note.visibility),
    resolved,
    resolveIcon: resolved ? "fa-rotate-left" : "fa-check",
    resolveLabel: resolved ? localize("SPN.Button.Reopen") : localize("SPN.Button.Resolve"),
    statusClass: String(note.status ?? NOTE_STATUSES.OPEN),
    priorityClass: String(note.priority ?? NOTE_PRIORITIES.NORMAL),
    tags: (note.tags ?? []).map((tag) => getTagLabel(tag)),
    bodyKey,
    bodyLineCount,
    bodyCollapsible,
    bodyExpanded,
    bodyToggleLabel: bodyExpanded ? localize("SPN.Button.ShowLess") : localize("SPN.Button.ShowAll"),
    createdDateLabel,
    updatedDateLabel,
    createdByName,
    updatedByName,
    createdMetaLabel,
    updatedMetaLabel,
    dateMetaLabel: `${createdMetaLabel} | ${updatedMetaLabel}`,
    enrichedBody: await enrichNoteBody(note.body)
  };
}

export function isoNow() {
  return new Date().toISOString();
}

export function summarizeCounts(notes) {
  const summary = {
    total: notes.length,
    open: 0,
    nextSession: 0,
    resolved: 0,
    archived: 0,
    urgent: 0,
    high: 0
  };

  for (const note of notes) {
    switch (note.status) {
      case NOTE_STATUSES.NEXT_SESSION:
        summary.nextSession += 1;
        break;
      case NOTE_STATUSES.RESOLVED:
        summary.resolved += 1;
        break;
      case NOTE_STATUSES.ARCHIVED:
        summary.archived += 1;
        break;
      case NOTE_STATUSES.OPEN:
      default:
        summary.open += 1;
        break;
    }

    if (note.priority === NOTE_PRIORITIES.URGENT) summary.urgent += 1;
    if (note.priority === NOTE_PRIORITIES.HIGH) summary.high += 1;
  }

  return summary;
}
