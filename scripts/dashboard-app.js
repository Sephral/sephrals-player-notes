import {
  DASHBOARD_VIEWS,
  MODULE_ID,
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  SETTINGS,
  TRACKING_MODES
} from "./constants.js";
import {
  archiveNoteForActor,
  deleteNoteForActor,
  duplicateNoteForActor,
  getActorRecoverySummaries,
  getAvailableTags,
  getOrphanedNotes,
  getPreparedDashboardGroups,
  getPreparedFlatNotes,
  setActorTrackingMode,
  toggleResolvedNoteForActor
} from "./note-repository.js";
import { getSetting } from "./settings.js";
import { openOrphanCleanupDialog, promptExportNotes, promptImportNotes } from "./import-export.js";
import { promptNoteEditor } from "./quick-note-dialog.js";
import { PlayerActorNotesApp } from "./actor-notes-app.js";
import { localize, renderAppTemplate, resolveActorUuidSync, tagOptions } from "./utils.js";
import { getSavedWindowPosition, observeApplicationGeometry } from "./window-state.js";

const DASHBOARD_POSITION = { width: 980, height: 680 };

function normalizeDashboardView(viewMode) {
  if (viewMode === DASHBOARD_VIEWS.NEXT_SESSION) return DASHBOARD_VIEWS.PREP;
  if ([DASHBOARD_VIEWS.GROUPED, DASHBOARD_VIEWS.FLAT, DASHBOARD_VIEWS.COMPACT, DASHBOARD_VIEWS.PREP].includes(viewMode)) return viewMode;
  return DASHBOARD_VIEWS.GROUPED;
}

export class PlayerNotesDashboardApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-dashboard`,
    classes: ["spn-dashboard-window"],
    tag: "section",
    position: {
      ...DASHBOARD_POSITION
    },
    window: {
      title: localize("SPN.ModuleTitle"),
      icon: "fa-solid fa-note-sticky",
      resizable: true
    }
  };

  constructor(options = {}) {
    super({ ...options, position: { ...getSavedWindowPosition("dashboard", DASHBOARD_POSITION), ...(options.position ?? {}) } });
    this.filters = {
      search: "",
      statusFilter: "all",
      priorityFilter: "all",
      tagFilter: "all",
      actorFilter: "all",
      viewMode: normalizeDashboardView(getSetting(SETTINGS.DEFAULT_DASHBOARD_VIEW, DASHBOARD_VIEWS.GROUPED)),
      hideArchived: getSetting(SETTINGS.HIDE_ARCHIVED, true),
      prepOnly: false
    };
    this.expandedBodyKeys = new Set();
  }

  async _prepareContext(_options) {
    const viewMode = normalizeDashboardView(this.filters.viewMode);
    this.filters.viewMode = viewMode;
    const prepOnly = viewMode === DASHBOARD_VIEWS.PREP;
    const filterState = { ...this.filters, prepOnly, expandedBodyKeys: this.expandedBodyKeys };
    const groupedActors = await getPreparedDashboardGroups(filterState);
    const flatNotes = await getPreparedFlatNotes(filterState);
    const recoverySummaries = (await getActorRecoverySummaries(filterState)).sort((left, right) => {
      if (left.hidden !== right.hidden) return left.hidden ? 1 : -1;
      return left.actorName.localeCompare(right.actorName);
    });
    const availableTags = tagOptions(await getAvailableTags());

    return {
      viewMode,
      groupedView: viewMode === DASHBOARD_VIEWS.GROUPED || viewMode === DASHBOARD_VIEWS.PREP,
      compactMode: viewMode === DASHBOARD_VIEWS.COMPACT,
      prepMode: prepOnly,
      filters: this.filters,
      orphanCount: getOrphanedNotes().length,
      recoveryActorSummaries: recoverySummaries.map((entry) => ({
        actorUuid: entry.actorUuid,
        actorName: entry.actorName,
        actorImg: entry.actorImg,
        counts: entry.counts,
        hidden: entry.hidden,
        active: this.filters.actorFilter === entry.actorUuid
      })),
      groupedActors,
      flatNotes,
      actorOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.actorFilter === "all" },
        ...recoverySummaries.map((entry) => ({ value: entry.actorUuid, label: entry.hidden ? `${entry.actorName} (${localize("SPN.Button.Hidden")})` : entry.actorName, selected: this.filters.actorFilter === entry.actorUuid }))
      ],
      statusOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.statusFilter === "all" },
        { value: NOTE_STATUSES.OPEN, label: localize("SPN.Status.Open"), selected: this.filters.statusFilter === NOTE_STATUSES.OPEN },
        { value: NOTE_STATUSES.NEXT_SESSION, label: localize("SPN.Status.NextSession"), selected: this.filters.statusFilter === NOTE_STATUSES.NEXT_SESSION },
        { value: NOTE_STATUSES.RESOLVED, label: localize("SPN.Status.Resolved"), selected: this.filters.statusFilter === NOTE_STATUSES.RESOLVED },
        { value: NOTE_STATUSES.ARCHIVED, label: localize("SPN.Status.Archived"), selected: this.filters.statusFilter === NOTE_STATUSES.ARCHIVED }
      ],
      priorityOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.priorityFilter === "all" },
        { value: NOTE_PRIORITIES.LOW, label: localize("SPN.Priority.Low"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.LOW },
        { value: NOTE_PRIORITIES.NORMAL, label: localize("SPN.Priority.Normal"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.NORMAL },
        { value: NOTE_PRIORITIES.HIGH, label: localize("SPN.Priority.High"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.HIGH },
        { value: NOTE_PRIORITIES.URGENT, label: localize("SPN.Priority.Urgent"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.URGENT }
      ],
      tagOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.tagFilter === "all" },
        ...availableTags.map((tag) => ({ value: tag.value, label: tag.label, selected: this.filters.tagFilter === tag.value }))
      ],
      viewOptions: [
        { value: DASHBOARD_VIEWS.GROUPED, label: localize("SPN.View.Grouped"), selected: viewMode === DASHBOARD_VIEWS.GROUPED },
        { value: DASHBOARD_VIEWS.FLAT, label: localize("SPN.View.Flat"), selected: viewMode === DASHBOARD_VIEWS.FLAT },
        { value: DASHBOARD_VIEWS.COMPACT, label: localize("SPN.View.Compact"), selected: viewMode === DASHBOARD_VIEWS.COMPACT },
        { value: DASHBOARD_VIEWS.PREP, label: localize("SPN.View.Prep"), selected: viewMode === DASHBOARD_VIEWS.PREP }
      ]
    };
  }

  async _renderHTML(context) {
    return renderAppTemplate(`modules/${MODULE_ID}/templates/dashboard.hbs`, context);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    observeApplicationGeometry(this, "dashboard");
    this.#bindListeners();
  }

  async #editNote(actorUuid, noteId) {
    const actor = resolveActorUuidSync(actorUuid);
    const app = new PlayerActorNotesApp(actor);
    await app.render({ force: true });
    const note = actor ? (await import("./note-repository.js")).getNoteById(actor, noteId) : null;
    await promptNoteEditor({ actor, note });
    await app.close();
    await this.render();
  }

  #bindListeners() {
    const root = this.element;
    root.querySelector('input[name="search"]')?.addEventListener("input", async (event) => {
      this.filters.search = event.currentTarget.value;
      await this.render();
    });

    ["statusFilter", "priorityFilter", "tagFilter", "actorFilter", "viewMode"].forEach((name) => {
      root.querySelector(`select[name="${name}"]`)?.addEventListener("change", async (event) => {
        this.filters[name] = event.currentTarget.value;
        await this.render();
      });
    });

    root.querySelector('[data-action="export-notes"]')?.addEventListener("click", async () => {
      const filteredActorUuids = this.filters.actorFilter !== "all" ? [this.filters.actorFilter] : null;
      await promptExportNotes(filteredActorUuids);
    });

    root.querySelector('[data-action="import-json"]')?.addEventListener("click", async () => {
      await promptImportNotes();
      await this.render();
    });

    root.querySelector('[data-action="open-orphans"]')?.addEventListener("click", async () => {
      await openOrphanCleanupDialog();
      await this.render();
    });

    root.querySelectorAll('[data-action="toggle-note-body"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const bodyKey = button.dataset.bodyKey;
        if (!bodyKey) return;
        if (this.expandedBodyKeys.has(bodyKey)) this.expandedBodyKeys.delete(bodyKey);
        else this.expandedBodyKeys.add(bodyKey);
        await this.render();
      });
    });

    root.querySelectorAll('.spn-sidebar__actor[data-actor-uuid]').forEach((entry) => {
      entry.addEventListener('click', async (event) => {
        if (event.target.closest('[data-action="toggle-track"]')) return;
        this.filters.actorFilter = entry.dataset.actorUuid === this.filters.actorFilter ? 'all' : entry.dataset.actorUuid;
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="open-actor"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        const app = new PlayerActorNotesApp(actor);
        await app.render({ force: true });
      });
    });

    root.querySelectorAll('[data-action="create-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        await promptNoteEditor({ actor });
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="toggle-track"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await setActorTrackingMode(button.dataset.actorUuid, button.dataset.hidden === "true" ? TRACKING_MODES.TRACKED : TRACKING_MODES.HIDDEN);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="edit-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await this.#editNote(button.dataset.actorUuid, button.dataset.noteId);
      });
    });

    root.querySelectorAll('[data-action="resolve-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        await toggleResolvedNoteForActor(actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="archive-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        await archiveNoteForActor(actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="duplicate-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        await duplicateNoteForActor(actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="delete-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const actor = resolveActorUuidSync(button.dataset.actorUuid);
        if (!actor) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: localize("SPN.Dialog.Delete.Title"), resizable: true },
          content: `<p>${localize("SPN.Dialog.Delete.Content")}</p>`,
          rejectClose: false,
          modal: true
        });
        if (!confirmed) return;
        await deleteNoteForActor(actor, button.dataset.noteId);
        await this.render();
      });
    });
  }
}
