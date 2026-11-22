// Sample windows (api.samples, contract in samples.mjs): the dashboard, the notes window, the dialogs and the small
// entry points of the module filled with made-up notes, so translators and testers see every text in its place without
// writing notes first. Nothing here writes: the actors are built in memory and never created, the world state is a plain
// object, every button that would change something only says that it does nothing, the window sizes are not saved.
import { MODULE_ID, NOTE_PRIORITIES, NOTE_STATUSES, TRACKING_MODES, DASHBOARD_VIEWS } from "./constants.js";
import { PlayerNotesDashboardApp } from "./dashboard-app.js";
import { PlayerActorNotesApp } from "./actor-notes-app.js";
import { buildDraft, chooseActorContent } from "./chat-note.js";
import { editorContent } from "./quick-note-dialog.js";
import { buildPrepMarkdown, exportDialogContent, importFileContent, importPreviewContent, orphanDialogContent } from "./import-export.js";
import { createDirectoryButtonRow, createDirectoryIndicator, createHudButton, headerEntryLabelFor, reminderContent, TOKEN_INDICATOR_STYLES } from "./entry-points.js";
import { getTrackedActorSummaries } from "./note-repository.js";
import { getActorImage, localize, summarizeCounts, tagOptions } from "./utils.js";
import { markSample, openSampleDialog, openSampleHtml, openSampleText, sampleBlocked, sampleCast, sampleId } from "./samples.mjs";

// Buttons of the two windows that only look: switch a tab, fold a long note open and shut.
const LOOKING = new Set(["set-tab", "toggle-note-body"]);
const DAY = 24 * 60 * 60 * 1000;

/* -------------------------------------------- */
/*  The made-up notes                           */
/* -------------------------------------------- */

const TEXTS = {
  en: {
    ferrymanT: "Debt to the ferryman", ferrymanB: "Ari promised the ferryman two silver for the night crossing and never paid.\nHe has not forgotten. Let him turn up at the harbor, polite and patient.",
    swordT: "The secret of the old sword", swordB: "The blade belonged to Ari's mother. The runes on it spell a name the party has not heard yet: Valdren.\nReveal it only when the cult comes up.",
    rivalT: "Rivalry with Captain Voss", rivalB: "Voss still thinks Ari cost him the lighthouse watch. A public insult is likely, a duel is possible.",
    farmT: "The burned farm", farmB: "Ari grew up on a farm east of the old mill. It burned down nine years ago and she says it was an accident.\nIt was not: the miller's sons set the fire for a bag of silver.\nHer father survived and lives in a hut by the river under another name.\nHe knows who paid. He will only speak to her alone.\nIf she asks the right question in town, the baker remembers a stranger with a red glove.\nThe glove ties the fire to the cult of Valdren.\nUse this slowly, one piece per session.",
    overheardT: "Overheard in the tavern", overheardB: "A drunk sailor told the room that a hero named Ari owes the harbor guild a favor.\n\n@UUID[ChatMessage.spnsample00msg1]{Chat message}",
    brotherT: "Ari meets her brother", brotherB: "Spotlight for the next session: her brother Jan arrives with the caravan, thin and nervous. He has news about the farm.",
    mayorT: "Reward from the mayor", mayorB: "The mayor pays 200 gold for the wolves and offers a house at the edge of town. A small favor comes with it.",
    shieldT: "Found the lost shield", shieldB: "The shield of the gate guard turned up in the troll's cave. Returned, thanked, done.",
    brawlT: "Tavern brawl", brawlB: "The innkeeper wants the broken table paid for. Small matter, nothing more to do.",
    spellT: "Mira's missing spellbook", spellB: "Stolen in the last town by a student of her old teacher. Mira suspects but cannot prove it.",
    towerT: "Letter from the tower", towerB: "Her old teacher writes: come home, it is about the other apprentices. The letter is unsigned.",
    tipT: "Lesson for Pim", tipB: "A kid called Pim follows Mira around. She said yes to a lesson once the roads are safe.",
    vowT: "Tovin's vow", vowB: "Tovin swore at the shrine not to take up arms against the villagers of Hollow Creek. The cult is hiding among them.",
    graceT: "Healing at the chapel", graceB: "The chapel needs a new roof. Tovin could pay with the reward.",
    orphanA: "Old sword runes", orphanB: "Notes of a hero that left the party.", orphanC: "Debt of the fallen knight",
    orphanName: "Edric", missingName: "Old Hero", worldTitle: "The Silver Coast",
    chatMsg: "<p>Seraphine whispers: the bridge is guarded at night, but the guard changes at midnight.</p><p>That is our window.</p>",
    chatSpeaker: "Seraphine"
  },
  de: {
    ferrymanT: "Schulden beim Fährmann", ferrymanB: "Ari hat dem Fährmann zwei Silber für die Überfahrt in der Nacht versprochen und nie bezahlt.\nEr hat es nicht vergessen. Lass ihn höflich und geduldig am Hafen auftauchen.",
    swordT: "Das Geheimnis des alten Schwerts", swordB: "Die Klinge gehörte Aris Mutter. Die Runen darauf ergeben einen Namen, den die Gruppe noch nicht kennt: Valdren.\nEnthülle ihn erst, wenn der Kult zur Sprache kommt.",
    rivalT: "Rivalität mit Hauptmann Voss", rivalB: "Voss glaubt immer noch, Ari habe ihn die Leuchtturmwache gekostet. Eine öffentliche Beleidigung ist wahrscheinlich, ein Duell möglich.",
    farmT: "Der abgebrannte Hof", farmB: "Ari wuchs auf einem Hof östlich der alten Mühle auf. Er brannte vor neun Jahren ab, sie sagt, es war ein Unfall.\nEs war keiner: Die Söhne des Müllers legten das Feuer für einen Beutel Silber.\nIhr Vater überlebte und lebt unter anderem Namen in einer Hütte am Fluss.\nEr weiß, wer bezahlt hat. Er spricht nur allein mit ihr.\nWenn sie in der Stadt die richtige Frage stellt, erinnert sich der Bäcker an einen Fremden mit rotem Handschuh.\nDer Handschuh verbindet das Feuer mit dem Kult von Valdren.\nLangsam einsetzen, ein Stück pro Sitzung.",
    overheardT: "In der Taverne aufgeschnappt", overheardB: "Ein betrunkener Matrose erzählte allen, ein Held namens Ari schulde der Hafengilde einen Gefallen.\n\n@UUID[ChatMessage.spnsample00msg1]{Chat-Nachricht}",
    brotherT: "Ari trifft ihren Bruder", brotherB: "Rampenlicht für die nächste Sitzung: Ihr Bruder Jan kommt mit der Karawane an, dünn und nervös. Er hat Neuigkeiten vom Hof.",
    mayorT: "Belohnung vom Bürgermeister", mayorB: "Der Bürgermeister zahlt 200 Gold für die Wölfe und bietet ein Haus am Stadtrand an. Eine kleine Gefälligkeit gehört dazu.",
    shieldT: "Verlorenen Schild gefunden", shieldB: "Der Schild des Torwächters tauchte in der Höhle des Trolls auf. Zurückgegeben, bedankt, erledigt.",
    brawlT: "Kneipenschlägerei", brawlB: "Der Wirt will den kaputten Tisch bezahlt haben. Kleinigkeit, nichts weiter zu tun.",
    spellT: "Miras fehlendes Zauberbuch", spellB: "In der letzten Stadt von einem Schüler ihres alten Lehrers gestohlen. Mira ahnt es, kann es aber nicht beweisen.",
    towerT: "Brief aus dem Turm", towerB: "Ihr alter Lehrer schreibt: Komm nach Hause, es geht um die anderen Schüler. Der Brief ist nicht unterschrieben.",
    tipT: "Unterricht für Pim", tipB: "Ein Kind namens Pim folgt Mira überallhin. Sie hat eine Stunde zugesagt, sobald die Straßen sicher sind.",
    vowT: "Tovins Schwur", vowB: "Tovin hat am Schrein geschworen, nicht gegen die Dorfbewohner von Hohlbach zu kämpfen. Der Kult versteckt sich unter ihnen.",
    graceT: "Heilung in der Kapelle", graceB: "Die Kapelle braucht ein neues Dach. Tovin könnte es von der Belohnung bezahlen.",
    orphanA: "Alte Schwertrunen", orphanB: "Notizen eines Helden, der die Gruppe verlassen hat.", orphanC: "Schuld des gefallenen Ritters",
    orphanName: "Edric", missingName: "Alter Held", worldTitle: "Die Silberküste",
    chatMsg: "<p>Seraphine flüstert: Die Brücke wird nachts bewacht, aber die Wache wechselt um Mitternacht.</p><p>Das ist unser Fenster.</p>",
    chatSpeaker: "Seraphine"
  }
};

function text(key) {
  const lang = globalThis.game?.i18n?.lang ?? "en";
  return TEXTS[lang]?.[key] ?? TEXTS.en[key] ?? key;
}

function actorId(id) {
  return `spnsample${id}0000000`.slice(0, 16);
}

/** [key, title key, body key, tags, status, priority, days ago created, days ago updated, written by the viewing user] */
const NOTE_PLAN = {
  ari: [
    ["ferryman", "ferrymanT", "ferrymanB", ["debt", "promise"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.HIGH, 14, 3, true],
    ["sword", "swordT", "swordB", ["secret", "backstory", "item"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.URGENT, 30, 2, true],
    ["rival", "rivalT", "rivalB", ["relationship", "npc"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.NORMAL, 9, 9, false],
    ["farm", "farmT", "farmB", ["backstory", "secret", "quest"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.LOW, 40, 20, true],
    ["overheard", "overheardT", "overheardB", ["npc", "location"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.NORMAL, 1, 1, true],
    ["brother", "brotherT", "brotherB", ["spotlight", "session-prep"], NOTE_STATUSES.NEXT_SESSION, NOTE_PRIORITIES.HIGH, 6, 1, true],
    ["mayor", "mayorT", "mayorB", ["reward", "quest"], NOTE_STATUSES.NEXT_SESSION, NOTE_PRIORITIES.NORMAL, 5, 5, false],
    ["shield", "shieldT", "shieldB", ["item"], NOTE_STATUSES.RESOLVED, NOTE_PRIORITIES.LOW, 25, 8, true],
    ["brawl", "brawlT", "brawlB", ["consequence"], NOTE_STATUSES.ARCHIVED, NOTE_PRIORITIES.LOW, 60, 50, true]
  ],
  mira: [
    ["spell", "spellT", "spellB", ["item", "quest"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.HIGH, 12, 4, true],
    ["tower", "towerT", "towerB", ["npc", "backstory"], NOTE_STATUSES.NEXT_SESSION, NOTE_PRIORITIES.URGENT, 3, 1, true],
    ["tip", "tipT", "tipB", ["promise", "downtime"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.LOW, 18, 18, false]
  ],
  tovin: [
    ["vow", "vowT", "vowB", ["promise", "secret"], NOTE_STATUSES.OPEN, NOTE_PRIORITIES.HIGH, 21, 6, true],
    ["grace", "graceT", "graceB", ["downtime", "reward"], NOTE_STATUSES.NEXT_SESSION, NOTE_PRIORITIES.NORMAL, 4, 4, false]
  ],
  sela: []
};

/** The notes of one sample character as they sit in the flag of an actor. */
export function sampleNotesFor(castId, now = Date.now(), userId = null) {
  const uuid = `Actor.${actorId(castId)}`;
  return (NOTE_PLAN[castId] ?? []).map(([key, title, body, tags, status, priority, created, updated, mine]) => ({
    id: `spnsample-${castId}-${key}`,
    actorUuid: uuid,
    title: text(title),
    body: text(body),
    tags,
    status,
    priority,
    visibility: "gm-only",
    createdAt: new Date(now - created * DAY).toISOString(),
    updatedAt: new Date(now - updated * DAY).toISOString(),
    createdBy: mine ? userId : null,
    updatedBy: mine ? userId : null
  }));
}

/** Notes of characters that are gone (the orphan list). */
export function sampleOrphans(now = Date.now()) {
  return [
    ["spnsample-orphan-1", "orphanA", "orphanB", 11],
    ["spnsample-orphan-2", "orphanC", "orphanB", 27]
  ].map(([id, title, body, days]) => ({
    id,
    actorUuid: "Actor.spnsampleedric0000",
    actorName: text("orphanName"),
    actorImg: "icons/svg/mystery-man.svg",
    orphanedAt: new Date(now - days * DAY).toISOString(),
    note: {
      id,
      actorUuid: "Actor.spnsampleedric0000",
      title: text(title),
      body: text(body),
      tags: ["backstory"],
      status: NOTE_STATUSES.OPEN,
      priority: NOTE_PRIORITIES.NORMAL,
      visibility: "gm-only",
      createdAt: new Date(now - (days + 5) * DAY).toISOString(),
      updatedAt: new Date(now - days * DAY).toISOString(),
      createdBy: null,
      updatedBy: null
    }
  }));
}

/** An actor type this world's game system has (the made-up characters are never created, only held in memory). */
function characterType() {
  const types = game.system?.documentTypes?.Actor ?? game.documentTypes?.Actor ?? [];
  const list = Array.isArray(types) ? types : Object.keys(types);
  return ["character", "hero", "pc", "player"].find((type) => list.includes(type)) ?? list.find((type) => type !== "base") ?? "character";
}

/**
 * The made-up party: unsaved actors with their notes in the flag, so the module's own code reads them like real ones.
 * @returns {{actors: Actor[], worldState: object, byId: object}}
 */
export function buildSampleData() {
  const Actor = getDocumentClass("Actor");
  const type = characterType();
  const userId = game.user?.id ?? null;
  const party = sampleCast().filter((member) => member.side === "party");
  const actors = party.map((member) => new Actor({
    _id: actorId(member.id),
    name: member.name,
    type,
    img: member.img,
    flags: { [MODULE_ID]: { notes: sampleNotesFor(member.id, Date.now(), userId) } }
  }));
  const byId = Object.fromEntries(party.map((member, index) => [member.id, actors[index]]));
  const worldState = {
    version: 1,
    // Sela has no notes yet but is followed, Tovin is hidden from the dashboard
    actorTracking: { [byId.sela.uuid]: TRACKING_MODES.TRACKED, [byId.tovin.uuid]: TRACKING_MODES.HIDDEN },
    customTags: [],
    orphanNotes: sampleOrphans()
  };
  return { actors, worldState, byId };
}

/* -------------------------------------------- */
/*  The windows                                 */
/* -------------------------------------------- */

/** Clicks on buttons that would change or open something do nothing but say so, looking buttons and filters work. */
function blockWrites(app) {
  app.element.addEventListener("click", (event) => {
    const target = event.target.closest?.(".window-content button[data-action]");
    if (!target || LOOKING.has(target.dataset.action)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sampleBlocked();
  }, true);
}

class SampleNotesApp extends PlayerActorNotesApp {
  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    blockWrites(this);
  }
}

class SampleDashboardApp extends PlayerNotesDashboardApp {
  constructor(data, options = {}) {
    super(options);
    this.sampleData = data;
  }

  dataSource() {
    return { actors: this.sampleData.actors, worldState: this.sampleData.worldState };
  }

  orphanTotal() {
    return this.sampleData.worldState.orphanNotes.length;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender?.(context, options);
    blockWrites(this);
  }
}

async function openNotes(id, castId) {
  const data = buildSampleData();
  const app = markSample(new SampleNotesApp(data.byId[castId], { id: sampleId(MODULE_ID, id) }));
  await app.render({ force: true });
  return app;
}

async function openDashboard(id, { view = DASHBOARD_VIEWS.GROUPED, empty = false } = {}) {
  const data = buildSampleData();
  if (empty) {
    data.actors = [];
    data.worldState = { ...data.worldState, orphanNotes: [] };
  }
  const app = markSample(new SampleDashboardApp(data, { id: sampleId(MODULE_ID, id) }));
  app.filters.viewMode = view;
  await app.render({ force: true });
  return app;
}

/* -------------------------------------------- */
/*  Dialogs, texts, entry points                */
/* -------------------------------------------- */

function button(labelKey, extra = {}) {
  return { label: localize(labelKey), ...extra };
}

async function openEditor(id, { fromChat }) {
  const data = buildSampleData();
  const actor = data.byId.ari;
  const note = fromChat ? null : actor.getFlag(MODULE_ID, "notes")?.[0];
  const message = { id: "spnsample00msg1", content: text("chatMsg"), speaker: { alias: text("chatSpeaker") } };
  const initial = note ?? {
    title: "", body: "", tags: [], status: NOTE_STATUSES.OPEN, priority: NOTE_PRIORITIES.NORMAL, visibility: "gm-only",
    ...(fromChat ? buildDraft(message) : {})
  };
  const knownTagLabels = tagOptions([]).map((entry) => entry.label);
  return openSampleDialog({
    moduleId: MODULE_ID,
    id,
    title: note ? localize("SPN.Dialog.Editor.EditTitle") : localize("SPN.Dialog.Editor.CreateTitle"),
    content: () => editorContent({ actor, note, initial, knownTagLabels }),
    buttons: [button("SPN.Button.Save", { icon: "fa-solid fa-check", default: true }), button("SPN.Button.Cancel")],
    width: 700
  });
}

async function openChooseActor() {
  const data = buildSampleData();
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "choose-character",
    title: localize("SPN.ChatNote.ChooseTitle"),
    content: () => chooseActorContent(data.actors, data.byId.mira),
    buttons: [button("SPN.ChatNote.ChooseConfirm", { default: true }), button("SPN.Button.Cancel")]
  });
}

async function openDeleteConfirm() {
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "delete-confirm",
    title: localize("SPN.Dialog.Delete.Title"),
    content: () => `<p>${localize("SPN.Dialog.Delete.Content")}</p>`,
    buttons: [
      { label: game.i18n.localize("Yes"), icon: "fa-solid fa-check", default: true },
      { label: game.i18n.localize("No"), icon: "fa-solid fa-xmark" }
    ]
  });
}

async function openExportDialog() {
  const data = buildSampleData();
  const summaries = await getTrackedActorSummaries({ actors: data.actors, worldState: data.worldState });
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "export-dialog",
    title: localize("SPN.Dialog.Export.Title"),
    content: () => exportDialogContent(summaries),
    buttons: [button("SPN.Button.ExportJson", { default: true }), button("SPN.Button.ExportMarkdown"), button("SPN.Button.Cancel")],
    width: 620
  });
}

async function openExportMarkdown() {
  const data = buildSampleData();
  return openSampleText({
    moduleId: MODULE_ID,
    id: "export-markdown",
    title: localize("SPN.Button.ExportMarkdown"),
    text: async () => buildPrepMarkdown(await getTrackedActorSummaries({
      actorFilter: "all", prepOnly: true, hideArchived: true, actors: data.actors, worldState: data.worldState
    })),
    width: 560,
    rows: 20
  });
}

async function openImportFile() {
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "import-file",
    title: localize("SPN.Dialog.Import.Title"),
    content: () => importFileContent(),
    buttons: [button("SPN.Button.Import", { default: true })],
    width: 480
  });
}

/** What the import preview shows for a file with notes of three characters, one of them missing in this world. */
export function buildSamplePreview(data) {
  const notes = [data.byId.ari, data.byId.mira].flatMap((actor) => actor.getFlag(MODULE_ID, "notes").slice(0, 2));
  const missingUuid = "Actor.spnsampleedric0000";
  const lost = sampleOrphans()[0].note;
  const refs = [data.byId.ari, data.byId.mira].map((actor) => ({
    actorUuid: actor.uuid, actorName: actor.name, actorImg: actor.img, exists: true, noteCount: 2
  }));
  refs.push({ actorUuid: missingUuid, actorName: text("missingName"), actorImg: "icons/svg/mystery-man.svg", exists: false, noteCount: 1 });
  return {
    payload: {},
    notes: [...notes, lost],
    metadata: {
      moduleId: MODULE_ID,
      moduleVersion: game.modules.get(MODULE_ID)?.version ?? "1.0.0",
      foundryVersion: game.version,
      systemId: game.system?.id ?? "unknown",
      worldTitle: text("worldTitle"),
      exportDate: new Date().toISOString()
    },
    actorRefs: refs,
    missingActors: refs.filter((entry) => !entry.exists),
    duplicateIds: [],
    likelyDuplicates: [{ imported: notes[0], existing: notes[0] }],
    statuses: [NOTE_STATUSES.OPEN],
    tags: ["debt", "secret"]
  };
}

async function openImportPreview() {
  const data = buildSampleData();
  const preview = buildSamplePreview(data);
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "import-preview",
    title: localize("SPN.Dialog.Import.PreviewTitle"),
    content: () => importPreviewContent(preview, data.actors),
    buttons: [button("SPN.Button.Import", { default: true }), button("SPN.Button.Cancel")],
    width: 680
  });
}

async function openOrphans() {
  const data = buildSampleData();
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "orphans",
    title: localize("SPN.Dialog.Orphans.Title"),
    content: () => orphanDialogContent(data.worldState.orphanNotes, data.actors),
    buttons: [
      button("SPN.Button.Remap", { default: true }), button("SPN.Button.Archive"), button("SPN.Button.ExportJson"),
      button("SPN.Button.Delete"), button("SPN.Button.Cancel")
    ],
    width: 680
  });
}

async function openReminder() {
  const data = buildSampleData();
  const summaries = await getTrackedActorSummaries({
    statusFilter: NOTE_STATUSES.NEXT_SESSION, hideArchived: true, actors: data.actors, worldState: data.worldState
  });
  const notes = summaries.flatMap((summary) => summary.filteredNotes.map((note) => ({ actorName: summary.actorName, title: note.title })));
  return openSampleDialog({
    moduleId: MODULE_ID,
    id: "reminder",
    title: localize("SPN.Dialog.Popup.Title"),
    content: () => reminderContent(notes),
    buttons: [button("SPN.Button.Dismiss", { default: true })]
  });
}

/** The places in Foundry's own windows where the module adds something, built by the module's own helpers. */
function entryPointsBody() {
  const data = buildSampleData();
  const ari = data.byId.ari;
  const notes = ari.getFlag(MODULE_ID, "notes");
  const wrap = document.createElement("div");
  wrap.className = "spn-sample-entries";
  wrap.innerHTML = `
    <style>
      .spn-sample-entries { display: grid; gap: 14px; padding: 4px 2px; font-size: 13px; }
      .spn-sample-entries h4 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; opacity: .75; }
      .spn-sample-entries .spn-sample-box { padding: 8px 10px; border: 1px solid rgba(128,128,128,.4); border-radius: 6px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .spn-sample-entries .spn-sample-hud button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid #888; background: #1d1a17; color: #eee; cursor: default; }
      .spn-sample-entries .spn-sample-badge { width: 24px; height: 24px; border-radius: 50%; border: 1px solid #111; color: #fff; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
      .spn-sample-entries .spn-sample-menu { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
      .spn-sample-entries .spn-sample-menu li { display: flex; gap: 8px; align-items: center; }
      .spn-sample-entries .spn-sample-menu i { width: 1.2em; text-align: center; }
    </style>
    <section><h4></h4><div class="spn-sample-box" data-part="directory"></div></section>
    <section><h4></h4><div class="spn-sample-box spn-sample-hud" data-part="hud"></div></section>
    <section><h4></h4><div class="spn-sample-box" data-part="badges"></div></section>
    <section><h4></h4><div class="spn-sample-box"><ul class="spn-sample-menu" data-part="sheet"></ul></div></section>
    <section><h4></h4><div class="spn-sample-box"><ul class="spn-sample-menu" data-part="context"></ul></div></section>`;
  const heads = wrap.querySelectorAll("h4");
  ["SPN.Sample.PartDirectory", "SPN.Sample.PartHud", "SPN.Sample.PartBadges", "SPN.Sample.PartSheet", "SPN.Sample.PartContext"]
    .forEach((key, index) => { heads[index].textContent = localize(key); });

  const directory = wrap.querySelector('[data-part="directory"]');
  directory.append(createDirectoryButtonRow());
  const entry = document.createElement("span");
  entry.innerHTML = `<img src="${getActorImage(ari)}" width="24" height="24" style="vertical-align:middle;border:0;margin-right:6px"><strong>${foundry.utils.escapeHTML(ari.name)}</strong> `;
  entry.append(createDirectoryIndicator(summarizeCounts(notes).nextSession));
  directory.append(entry);

  wrap.querySelector('[data-part="hud"]').append(createHudButton());

  const badges = wrap.querySelector('[data-part="badges"]');
  for (const [state, label] of [["urgent", "SPN.Priority.Urgent"], ["nextSession", "SPN.Status.NextSession"]]) {
    const style = TOKEN_INDICATOR_STYLES[state];
    const span = document.createElement("span");
    span.innerHTML = `<span class="spn-sample-badge" style="background:#${style.fill.toString(16).padStart(6, "0")}">${style.label}</span> ${foundry.utils.escapeHTML(localize(label))}`;
    badges.append(span);
  }

  const openCount = notes.filter((note) => note.status === NOTE_STATUSES.OPEN).length;
  const menu = (part, items) => {
    const list = wrap.querySelector(`[data-part="${part}"]`);
    for (const [icon, label] of items) {
      const li = document.createElement("li");
      li.innerHTML = `<i class="fa-solid ${icon}"></i><span></span>`;
      li.querySelector("span").textContent = label;
      list.append(li);
    }
  };
  menu("sheet", [["fa-note-sticky", headerEntryLabelFor(openCount)]]);
  menu("context", [
    ["fa-note-sticky", localize("SPN.Directory.Context.Open")],
    ["fa-thumbtack", localize("SPN.Directory.Context.Track")],
    ["fa-eye-slash", localize("SPN.Directory.Context.Hide")],
    ["fa-note-sticky", localize("SPN.ChatNote.Entry")]
  ]);
  return wrap;
}

async function openEntryPoints() {
  return openSampleHtml({ moduleId: MODULE_ID, id: "entry-points", title: localize("SPN.Sample.EntryPoints"), body: entryPointsBody, width: 460 });
}

/* -------------------------------------------- */
/*  The list                                    */
/* -------------------------------------------- */

/**
 * The entries of api.samples(): one per window or state that shows texts of its own.
 * @returns {{id: string, label: string, group: string, open: () => Promise<Application>}[]}
 */
export function sampleWindows() {
  const group = localize("SPN.Sample.Group");
  const entry = (id, labelKey, open) => ({ id, label: localize(labelKey), group, open });
  return [
    entry("dashboard-grouped", "SPN.Sample.DashboardGrouped", () => openDashboard("dashboard-grouped")),
    entry("dashboard-flat", "SPN.Sample.DashboardFlat", () => openDashboard("dashboard-flat", { view: DASHBOARD_VIEWS.FLAT })),
    entry("dashboard-compact", "SPN.Sample.DashboardCompact", () => openDashboard("dashboard-compact", { view: DASHBOARD_VIEWS.COMPACT })),
    entry("dashboard-prep", "SPN.Sample.DashboardPrep", () => openDashboard("dashboard-prep", { view: DASHBOARD_VIEWS.PREP })),
    entry("dashboard-empty", "SPN.Sample.DashboardEmpty", () => openDashboard("dashboard-empty", { view: DASHBOARD_VIEWS.FLAT, empty: true })),
    entry("notes-filled", "SPN.Sample.NotesFilled", () => openNotes("notes-filled", "ari")),
    entry("notes-empty", "SPN.Sample.NotesEmpty", () => openNotes("notes-empty", "sela")),
    entry("editor-from-chat", "SPN.Sample.EditorFromChat", () => openEditor("editor-from-chat", { fromChat: true })),
    entry("editor-edit", "SPN.Sample.EditorEdit", () => openEditor("editor-edit", { fromChat: false })),
    entry("choose-character", "SPN.Sample.ChooseCharacter", () => openChooseActor()),
    entry("delete-confirm", "SPN.Sample.DeleteConfirm", () => openDeleteConfirm()),
    entry("reminder", "SPN.Sample.Reminder", () => openReminder()),
    entry("export-dialog", "SPN.Sample.ExportDialog", () => openExportDialog()),
    entry("export-markdown", "SPN.Sample.ExportMarkdown", () => openExportMarkdown()),
    entry("import-file", "SPN.Sample.ImportFile", () => openImportFile()),
    entry("import-preview", "SPN.Sample.ImportPreview", () => openImportPreview()),
    entry("orphans", "SPN.Sample.Orphans", () => openOrphans()),
    entry("entry-points", "SPN.Sample.EntryPoints", () => openEntryPoints())
  ];
}

export const __test__ = { TEXTS, NOTE_PLAN, actorId };
