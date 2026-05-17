import { MODULE_ID, NOTE_PRIORITIES, NOTE_STATUSES, SETTINGS } from "./constants.js";
import {
  archiveNoteForActor,
  deleteNoteForActor,
  duplicateNoteForActor,
  getActorNotes,
  getAvailableTags,
  toggleResolvedNoteForActor
} from "./note-repository.js";
import { getSetting } from "./settings.js";
import { promptNoteEditor } from "./quick-note-dialog.js";
import { getActorImage, localize, prepareNoteForDisplay, renderAppTemplate, tagOptions } from "./utils.js";
import { getSavedWindowPosition, observeApplicationGeometry } from "./window-state.js";

const ACTOR_NOTES_POSITION = { width: 680, height: 620 };

function getActorNotesAppId(actor) {
  const actorId = actor?.id ?? String(actor?.uuid ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "-");
  return `${MODULE_ID}-actor-notes-${actorId}`;
}

export class PlayerActorNotesApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-actor-notes`,
    classes: ["spn-app-window"],
    tag: "section",
    position: {
      ...ACTOR_NOTES_POSITION
    },
    window: {
      title: localize("SPN.ActorNotes.Title"),
      icon: "fa-solid fa-note-sticky",
      resizable: true
    }
  };

  constructor(actor, options = {}) {
    super({ id: getActorNotesAppId(actor), ...options, position: { ...getSavedWindowPosition("actorNotes", ACTOR_NOTES_POSITION), ...(options.position ?? {}) } });
    this.actor = actor;
    this.filters = {
      search: "",
      tagFilter: "all",
      priorityFilter: "all",
      tab: NOTE_STATUSES.OPEN,
      hideArchived: getSetting(SETTINGS.HIDE_ARCHIVED, true)
    };
    this.expandedBodyKeys = new Set();
  }

  get title() {
    return `${this.actor?.name ?? localize("SPN.ActorNotes.Title")} - ${localize("SPN.ActorNotes.Title")}`;
  }

  async _prepareContext(_options) {
    const tagChoices = tagOptions(await getAvailableTags());
    const rawNotes = getActorNotes(this.actor).filter((note) => {
      if (this.filters.tab !== "all" && note.status !== this.filters.tab) return false;
      if (this.filters.hideArchived && note.status === NOTE_STATUSES.ARCHIVED && this.filters.tab !== NOTE_STATUSES.ARCHIVED) return false;
      if (this.filters.tagFilter !== "all" && !(note.tags ?? []).includes(this.filters.tagFilter)) return false;
      if (this.filters.priorityFilter !== "all" && note.priority !== this.filters.priorityFilter) return false;
      if (this.filters.search) {
        const haystack = [note.title, note.body, ...(note.tags ?? [])].join(" ").toLowerCase();
        if (!haystack.includes(this.filters.search.toLowerCase())) return false;
      }
      return true;
    });

    const notes = await Promise.all(rawNotes.map((note) => prepareNoteForDisplay(note, {
      actorName: this.actor.name,
      actorImg: getActorImage(this.actor),
      actorUuid: this.actor.uuid,
      expandedBodyKeys: this.expandedBodyKeys
    })));
    const allNotes = getActorNotes(this.actor);
    const counts = {
      total: allNotes.length,
      open: allNotes.filter((note) => note.status === NOTE_STATUSES.OPEN).length,
      nextSession: allNotes.filter((note) => note.status === NOTE_STATUSES.NEXT_SESSION).length,
      resolved: allNotes.filter((note) => note.status === NOTE_STATUSES.RESOLVED).length,
      archived: allNotes.filter((note) => note.status === NOTE_STATUSES.ARCHIVED).length
    };

    return {
      actorUuid: this.actor.uuid,
      actorName: this.actor.name,
      actorImg: getActorImage(this.actor),
      counts,
      notes,
      filters: this.filters,
      tagOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.tagFilter === "all" },
        ...tagChoices.map((tag) => ({ value: tag.value, label: tag.label, selected: this.filters.tagFilter === tag.value }))
      ],
      priorityOptions: [
        { value: "all", label: localize("SPN.Label.All"), selected: this.filters.priorityFilter === "all" },
        { value: NOTE_PRIORITIES.LOW, label: localize("SPN.Priority.Low"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.LOW },
        { value: NOTE_PRIORITIES.NORMAL, label: localize("SPN.Priority.Normal"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.NORMAL },
        { value: NOTE_PRIORITIES.HIGH, label: localize("SPN.Priority.High"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.HIGH },
        { value: NOTE_PRIORITIES.URGENT, label: localize("SPN.Priority.Urgent"), selected: this.filters.priorityFilter === NOTE_PRIORITIES.URGENT }
      ],
      tabs: [
        { value: "all", label: localize("SPN.ActorNotes.Filter.All"), active: this.filters.tab === "all" },
        { value: NOTE_STATUSES.OPEN, label: localize("SPN.ActorNotes.Filter.Open"), active: this.filters.tab === NOTE_STATUSES.OPEN },
        { value: NOTE_STATUSES.NEXT_SESSION, label: localize("SPN.ActorNotes.Filter.NextSession"), active: this.filters.tab === NOTE_STATUSES.NEXT_SESSION },
        { value: NOTE_STATUSES.RESOLVED, label: localize("SPN.ActorNotes.Filter.Resolved"), active: this.filters.tab === NOTE_STATUSES.RESOLVED },
        { value: NOTE_STATUSES.ARCHIVED, label: localize("SPN.ActorNotes.Filter.Archived"), active: this.filters.tab === NOTE_STATUSES.ARCHIVED }
      ]
    };
  }

  async _renderHTML(context) {
    return renderAppTemplate(`modules/${MODULE_ID}/templates/actor-notes.hbs`, context);
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    observeApplicationGeometry(this, "actorNotes");
    this.#bindListeners();
  }

  #bindListeners() {
    const root = this.element;
    root.querySelectorAll('[data-action="set-tab"]').forEach((button) => {
      button.addEventListener("click", async () => {
        this.filters.tab = button.dataset.tab;
        await this.render();
      });
    });

    root.querySelector('[data-action="create-note"]')?.addEventListener("click", async () => {
      await promptNoteEditor({ actor: this.actor });
      await this.render();
    });

    root.querySelector('[data-action="open-dashboard"]')?.addEventListener("click", () => {
      void game.modules.get(MODULE_ID)?.api?.openDashboard?.();
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

    root.querySelector('input[name="search"]')?.addEventListener("input", async (event) => {
      this.filters.search = event.currentTarget.value;
      await this.render();
    });

    root.querySelector('select[name="tagFilter"]')?.addEventListener("change", async (event) => {
      this.filters.tagFilter = event.currentTarget.value;
      await this.render();
    });

    root.querySelector('select[name="priorityFilter"]')?.addEventListener("change", async (event) => {
      this.filters.priorityFilter = event.currentTarget.value;
      await this.render();
    });

    root.querySelectorAll('[data-action="edit-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const note = getActorNotes(this.actor).find((entry) => entry.id === button.dataset.noteId);
        await promptNoteEditor({ actor: this.actor, note });
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="resolve-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await toggleResolvedNoteForActor(this.actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="archive-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await archiveNoteForActor(this.actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="duplicate-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        await duplicateNoteForActor(this.actor, button.dataset.noteId);
        await this.render();
      });
    });

    root.querySelectorAll('[data-action="delete-note"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: localize("SPN.Dialog.Delete.Title"), resizable: true },
          content: `<p>${localize("SPN.Dialog.Delete.Content")}</p>`,
          rejectClose: false,
          modal: true
        });
        if (!confirmed) return;
        await deleteNoteForActor(this.actor, button.dataset.noteId);
        await this.render();
      });
    });
  }
}
