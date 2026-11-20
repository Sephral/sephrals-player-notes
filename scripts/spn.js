import {
  HOTKEY_PRECEDENCE,
  MODULE_ID,
  NOTE_STATUSES,
  SETTINGS,
  TESTED_VERSIONS,
  TRACKING_MODES
} from "./constants.js";
import { PlayerActorNotesApp } from "./actor-notes-app.js";
import { activateMessageLinks, registerChatContextEntry } from "./chat-note.js";
import { registerDebug } from "./debug.js";
import { saveDebugFile } from "./debug-file.mjs";
import { registerHubModule } from "./hub.mjs";
import { PlayerNotesDashboardApp } from "./dashboard-app.js";
import { openOrphanCleanupDialog } from "./import-export.js";
import {
  getActorIndicatorSummary,
  getActorNotes,
  getOrphanedNotes,
  getTrackedActorSummaries,
  setActorTrackingMode,
  stashActorNotesAsOrphans
} from "./note-repository.js";
import { createNote, getNotes, updateNote } from "./notes-api.js";
import { noticeNewVersions, runSelfTest } from "./selftest.js";
import { promptQuickNoteForActors } from "./quick-note-dialog.js";
import { BADGE_RADIUS, drawBadgeCircle } from "./token-badge.js";
import { registerSettings, getSetting, migrateHudButtonSetting, setOpenDashboardHandler } from "./settings.js";
import {
  actorChangeAffectsNotes,
  debugLog,
  getContextDocumentId,
  getSelectedTokenActors,
  getSingleSelectedActor,
  isGM,
  loadModuleTranslations,
  localize,
  registerTemplateLocalization,
  resolveActorUuidSync,
  resolveElement
} from "./utils.js";
import { countFeature, markUsed, registerUsage } from "./usage.mjs";

let dashboardApp = null;
const actorApps = new Map();
let reminderShown = false;
const QUICK_NOTE_TOOL = 'spnQuickNote';
const DASHBOARD_TOOL = 'spnDashboard';
const HEADER_CONTROL_ACTION = 'spnOpenNotes';
const REFRESH_DEBOUNCE_MS = 150;
const TOKEN_INDICATOR_STYLES = Object.freeze({
  urgent: { fill: 0xb93d46, label: '!' },
  nextSession: { fill: 0xd06a4a, label: 'N' }
});

function getActorFromSheet(app) {
  return app?.actor ?? app?.document ?? null;
}

function getActorDirectoryEntry(target) {
  const actorId = getContextDocumentId(target);
  return actorId ? game.actors?.get(actorId) ?? null : null;
}

export async function openDashboard() {
  if (!isGM()) {
    ui.notifications.warn(localize("SPN.Notification.GMOnly"));
    return null;
  }
  markUsed(MODULE_ID);

  if (dashboardApp?.rendered) {
    await dashboardApp.render();
    dashboardApp.bringToFront();
    return dashboardApp;
  }

  dashboardApp = new PlayerNotesDashboardApp();
  dashboardApp.addEventListener("close", () => {
    dashboardApp = null;
  }, { once: true });
  await dashboardApp.render({ force: true });
  return dashboardApp;
}

export async function toggleDashboard() {
  if (dashboardApp?.rendered) {
    await dashboardApp.close();
    return null;
  }
  return openDashboard();
}

export async function openActorNotes(actor) {
  if (!isGM()) {
    ui.notifications.warn(localize("SPN.Notification.GMOnly"));
    return null;
  }

  if (!actor) {
    ui.notifications.warn(localize("SPN.Notification.NoActor"));
    return null;
  }
  markUsed(MODULE_ID);

  const existing = actorApps.get(actor.uuid);
  if (existing?.rendered) {
    await existing.render();
    existing.bringToFront();
    return existing;
  }

  const app = new PlayerActorNotesApp(actor);
  actorApps.set(actor.uuid, app);
  app.addEventListener("close", () => {
    actorApps.delete(actor.uuid);
  }, { once: true });
  await app.render({ force: true });
  return app;
}

async function openSelectedTokenActorNotes() {
  const actor = getSingleSelectedActor();
  if (!actor) {
    ui.notifications.warn(localize("SPN.Notification.NoToken"));
    return false;
  }
  await openActorNotes(actor);
  return true;
}

async function quickNoteForSelectedTokens() {
  const actors = getSelectedTokenActors();
  if (!actors.length) {
    ui.notifications.warn(localize("SPN.Notification.NoToken"));
    return false;
  }
  const note = await promptQuickNoteForActors(actors);
  if (note) countFeature(MODULE_ID, 'quickNote');
  await refreshOpenApps();
  return true;
}

async function refreshOpenApps() {
  if (dashboardApp?.rendered) await dashboardApp.render();
  for (const app of actorApps.values()) {
    if (app.rendered) await app.render();
  }
  ui.actors?.render?.(false);
  canvas?.tokens?.placeables?.forEach((token) => updateTokenIndicator(token));
}

// Actor hooks arrive in bursts (several updates per combat turn, bulk imports), so they share one refresh.
const scheduleRefreshOpenApps = foundry.utils.debounce(() => {
  void refreshOpenApps();
}, REFRESH_DEBOUNCE_MS);

// One entry with both key sets: v13 reads name, condition and callback(li), v14 reads label, visible and onClick(event, li)
// and logs a deprecation warning for the old keys unless the new ones are there too. The icon is HTML, which both accept.
function createContextOption({ key, icon, run }) {
  const label = localize(key);
  const visible = () => game.user.isGM;
  const action = (target) => {
    const actor = getActorDirectoryEntry(target);
    if (actor) run(actor);
  };
  return {
    name: label,
    label,
    icon: `<i class="fa-solid ${icon}"></i>`,
    condition: visible,
    visible,
    callback: (target) => action(target),
    onClick: (_event, target) => action(target)
  };
}

function createActorDirectoryContextOption() {
  return createContextOption({
    key: "SPN.Directory.Context.Open",
    icon: "fa-note-sticky",
    run: (actor) => void openActorNotes(actor)
  });
}

function createTrackContextOption() {
  return createContextOption({
    key: "SPN.Directory.Context.Track",
    icon: "fa-thumbtack",
    run: (actor) => {
      countFeature(MODULE_ID, 'actorTracking');
      void setActorTrackingMode(actor.uuid, TRACKING_MODES.TRACKED).then(() => refreshOpenApps());
    }
  });
}

function createHideContextOption() {
  return createContextOption({
    key: "SPN.Directory.Context.Hide",
    icon: "fa-eye-slash",
    run: (actor) => {
      countFeature(MODULE_ID, 'actorTracking');
      void setActorTrackingMode(actor.uuid, TRACKING_MODES.HIDDEN).then(() => refreshOpenApps());
    }
  });
}

// A labeled button below "Create Actor" opens the dashboard, so the module has an entry point that does not
// depend on a token, a sheet or a context menu.
function injectActorDirectoryButton(app, html) {
  if (!isGM() || !getSetting(SETTINGS.ACTOR_DIRECTORY_BUTTON, true)) return;
  if (app?.collection instanceof foundry.documents.collections.CompendiumCollection) return;
  const root = resolveElement(html);
  const header = root?.querySelector('.directory-header');
  if (!header || header.querySelector('.spn-directory-actions')) return;

  const row = document.createElement('div');
  row.className = 'header-actions action-buttons flexrow spn-directory-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'spn-directory-button';
  button.dataset.tooltip = localize('SPN.Tooltip.OpenDashboard');
  button.innerHTML = `<i class="fa-solid fa-note-sticky" inert></i><span>${foundry.utils.escapeHTML(localize('SPN.Directory.Button'))}</span>`;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    void openDashboard();
  });
  row.append(button);

  const actions = header.querySelector('.header-actions');
  if (actions) actions.after(row);
  else header.prepend(row);
}

function injectActorDirectoryIndicators(app, html) {
  if (!isGM() || !getSetting(SETTINGS.ACTOR_DIRECTORY_INDICATORS, true)) return;
  const root = resolveElement(html);
  if (!root) return;

  root.querySelectorAll('[data-document-id], [data-entry-id]').forEach((entry) => {
    const actorId = entry.dataset.documentId || entry.dataset.entryId;
    const actor = game.actors?.get(actorId);
    if (!actor) return;
    const summary = getActorIndicatorSummary(actor);
    entry.querySelectorAll('.spn-dir-indicator').forEach((node) => node.remove());
    if (!summary.hasVisibleIndicator) return;

    const label = document.createElement('span');
    label.className = 'spn-dir-indicator spn-badge';
    label.textContent = String(summary.counts.nextSession || summary.counts.open);
    const heading = entry.querySelector('.entry-name, h3, .document-name') ?? entry;
    heading.append(label);
  });
}

function getTokenIndicatorState(token) {
  if (!isGM() || !getSetting(SETTINGS.TOKEN_INDICATORS, true)) return null;
  if (!token?.actor) return null;

  const summary = getActorIndicatorSummary(token.actor);
  if (!summary.hasTokenIndicator) return null;
  return summary.counts.urgent > 0 ? 'urgent' : 'nextSession';
}

function drawTokenBadge(container, state) {
  const style = TOKEN_INDICATOR_STYLES[state];
  const badge = new PIXI.Graphics();
  drawBadgeCircle(badge, { fill: style.fill, fillAlpha: 0.95, lineColor: 0x111111, lineAlpha: 0.9, lineWidth: 1, radius: BADGE_RADIUS });

  const TextClass = foundry?.canvas?.containers?.PreciseText ?? globalThis.PIXI?.Text;
  const text = new TextClass(style.label, {
    fill: 0xffffff,
    fontSize: 14,
    fontWeight: 'bold'
  });
  text.anchor?.set?.(0.5);
  container.addChild(badge);
  container.addChild(text);
}

// refreshToken fires on every incremental refresh, including each frame of a movement animation.
// The badge is built once per token and only redrawn when its state changes.
function updateTokenIndicator(token) {
  let container = token?.spnIndicator ?? null;
  if (container?.destroyed) {
    container = null;
    token.spnIndicator = null;
  }

  const state = getTokenIndicatorState(token);
  if (!state) {
    if (container) container.visible = false;
    return;
  }

  if (!container) {
    container = new PIXI.Container();
    container.eventMode = 'none';
    container.name = 'spn-token-indicator';
    token.addChild(container);
    token.spnIndicator = container;
  }

  if (container.spnState !== state) {
    container.removeChildren().forEach((child) => child.destroy({ children: true }));
    drawTokenBadge(container, state);
    container.spnState = state;
  }

  container.position.set((token.w ?? token.document?.width ?? 1) - 10, 10);
  container.visible = true;
}

// The Token HUD element is a <form>, see resolveElement.
function injectTokenHudButton(app, html, data) {
  if (!isGM() || !getSetting(SETTINGS.TOKEN_HUD_BUTTON, true)) return;
  const actor = app?.actor ?? app?.object?.actor ?? canvas?.tokens?.get(data?._id)?.actor;
  if (!actor) return;

  const root = resolveElement(html);
  if (!root) return;
  const left = root.querySelector('.col.left') ?? root;
  if (left.querySelector('.spn-hud-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'control-icon spn-hud-button';
  button.innerHTML = '<i class="fa-solid fa-note-sticky" inert></i>';
  button.dataset.tooltip = localize('SPN.Directory.Context.Open');
  button.setAttribute('aria-label', localize('SPN.Directory.Context.Open'));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    void openActorNotes(actor);
  });
  left.append(button);
}

// The open notes of the actor, as the label of the sheet's header entry.
function getHeaderEntryLabel(actor) {
  const openCount = getActorNotes(actor).filter((note) => note.status === NOTE_STATUSES.OPEN).length;
  return `${localize('SPN.Button.OpenShort')} (${openCount})`;
}

// ApplicationV2 sheets (every sheet of v13 and v14 core and of dnd5e, PF2e, SWADE and Crucible): an entry in the
// window's controls menu. Only sheets of an Actor document get it, not the notes windows of this module.
function addActorSheetHeaderControl(app, controls) {
  if (!isGM() || !getSetting(SETTINGS.ACTOR_SHEET_BUTTONS, true)) return;
  const actor = app?.document?.documentName === 'Actor' ? app.document : null;
  if (!actor) return;
  if (controls.some((control) => control.action === HEADER_CONTROL_ACTION)) return;
  controls.unshift({
    action: HEADER_CONTROL_ACTION,
    icon: 'fa-solid fa-note-sticky',
    label: getHeaderEntryLabel(actor),
    visible: () => isGM() && getSetting(SETTINGS.ACTOR_SHEET_BUTTONS, true),
    onClick: () => {
      void openActorNotes(actor);
    }
  });
}

function registerKeybinding(action, data) {
  try {
    game.keybindings.register(MODULE_ID, action, data);
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to register keybinding ${action}`, error);
  }
}

async function showSessionReminderPopup() {
  if (reminderShown || !isGM() || !getSetting(SETTINGS.SESSION_REMINDER_POPUP, false)) return;
  reminderShown = true;

  const summaries = await getTrackedActorSummaries({ statusFilter: NOTE_STATUSES.NEXT_SESSION, hideArchived: true });
  const notes = summaries.flatMap((summary) => summary.filteredNotes.map((note) => ({ actorName: summary.actorName, title: note.title })));
  if (!notes.length) return;

  const content = `
    <div class="spn-dialog">
      <ul>${notes.map((note) => `<li><strong>${foundry.utils.escapeHTML(note.actorName)}</strong>: ${foundry.utils.escapeHTML(note.title)}</li>`).join('')}</ul>
    </div>`;

  await foundry.applications.api.DialogV2.prompt({
    window: { title: localize('SPN.Dialog.Popup.Title'), resizable: true },
    content,
    ok: { label: localize('SPN.Button.Dismiss') },
    rejectClose: false,
    modal: false
  });
}

Hooks.once('init', () => {
  registerHubModule({ moduleId: MODULE_ID, tested: TESTED_VERSIONS });
  registerTemplateLocalization();
  void loadModuleTranslations();
  registerSettings();
  registerDebug();
  setOpenDashboardHandler(openDashboard);
  registerUsage(MODULE_ID, {
    features: ['noteCreate', 'noteEdit', 'noteResolve', 'noteArchive', 'quickNote', 'notesExport', 'notesImport', 'actorTracking', 'noteFromChat'],
    settings: [SETTINGS.DEFAULT_DASHBOARD_VIEW, SETTINGS.TOKEN_INDICATORS, SETTINGS.SESSION_REMINDER_POPUP]
  });

  // GM entry in the context menu of a chat message: a note on the speaker's character, prefilled with the message.
  registerChatContextEntry();

  // Sheets of Foundry's current window system get a control entry, see addActorSheetHeaderControl.
  Hooks.on('getHeaderControlsApplicationV2', addActorSheetHeaderControl);

  // Actor sheets of the old window system (Foundry 13, a game system that has not moved on) only know this hook.
  // ApplicationV2 sheets never call it.
  Hooks.on('getActorSheetHeaderButtons', (app, buttons) => {
    if (!isGM() || !getSetting(SETTINGS.ACTOR_SHEET_BUTTONS, true)) return;
    const actor = getActorFromSheet(app);
    if (!actor) return;
    buttons.unshift({
      label: getHeaderEntryLabel(actor),
      class: 'spn-open-actor-notes',
      icon: 'fa-solid fa-note-sticky',
      tooltip: localize('SPN.Tooltip.ActorHeaderNotes'),
      title: localize('SPN.Tooltip.ActorHeaderNotes'),
      onclick: () => {
        void openActorNotes(actor);
      }
    });
  });

  // v13+ fires get<DocumentName>ContextOptions for the Actor Directory and for Actor compendium windows.
  // Entries resolve through game.actors, so compendium windows do not get them.
  Hooks.on('getActorContextOptions', (app, options) => {
    if (app?.collection instanceof foundry.documents.collections.CompendiumCollection) return;
    options.push(createActorDirectoryContextOption(), createTrackContextOption(), createHideContextOption());
  });

  Hooks.on('renderActorDirectory', (app, html) => {
    injectActorDirectoryButton(app, html);
    injectActorDirectoryIndicators(app, html);
  });
  Hooks.on('renderTokenHUD', injectTokenHudButton);

  // Button tools in the token controls. A control set of its own does not work: its active tool cannot be a
  // button, because clicking the active tool does nothing.
  Hooks.on('getSceneControlButtons', (controls) => {
    if (!isGM()) return;
    const tokens = controls?.tokens;
    if (!tokens?.tools) return;
    const order = Object.keys(tokens.tools).length;
    tokens.tools[DASHBOARD_TOOL] = {
      name: DASHBOARD_TOOL,
      title: localize('SPN.SceneTool.Dashboard'),
      icon: 'fa-solid fa-note-sticky',
      order,
      button: true,
      visible: true,
      onChange: () => void toggleDashboard()
    };
    tokens.tools[QUICK_NOTE_TOOL] = {
      name: QUICK_NOTE_TOOL,
      title: localize('SPN.SceneTool.QuickNote'),
      icon: 'fa-solid fa-bolt',
      order: order + 1,
      button: true,
      visible: true,
      onChange: () => void quickNoteForSelectedTokens()
    };
  });

  Hooks.on('refreshToken', (token) => {
    try {
      updateTokenIndicator(token);
    } catch (error) {
      debugLog('Token indicator refresh failed', error);
    }
  });

  Hooks.on(`${MODULE_ID}.languageChanged`, () => {
    void loadModuleTranslations().then(() => refreshOpenApps());
  });

  registerKeybinding('openDashboard', {
    name: localize('SPN.Hotkey.OpenDashboard.Name'),
    hint: localize('SPN.Hotkey.OpenDashboard.Hint'),
    editable: [{ key: 'KeyN', modifiers: ['CONTROL', 'SHIFT'] }],
    precedence: HOTKEY_PRECEDENCE,
    restricted: true,
    onDown: () => {
      void openDashboard();
      return true;
    }
  });

  registerKeybinding('openSelectedTokenActor', {
    name: localize('SPN.Hotkey.OpenSelected.Name'),
    hint: localize('SPN.Hotkey.OpenSelected.Hint'),
    editable: [{ key: 'KeyN', modifiers: ['ALT', 'SHIFT'] }],
    precedence: HOTKEY_PRECEDENCE,
    restricted: true,
    onDown: () => {
      void openSelectedTokenActorNotes();
      return true;
    }
  });

  registerKeybinding('quickNoteSelectedTokenActor', {
    name: localize('SPN.Hotkey.QuickNote.Name'),
    hint: localize('SPN.Hotkey.QuickNote.Hint'),
    editable: [{ key: 'KeyN', modifiers: ['CONTROL', 'ALT'] }],
    precedence: HOTKEY_PRECEDENCE,
    restricted: true,
    onDown: () => {
      void quickNoteForSelectedTokens();
      return true;
    }
  });
});

Hooks.once('ready', async () => {
  await loadModuleTranslations();
  if (isGM()) activateMessageLinks();
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openDashboard,
      toggleDashboard,
      openActorNotes,
      quickNoteForSelectedTokens,
      openOrphanCleanupDialog,
      createNote,
      getNotes,
      updateNote,
      runSelfTest,
      // One file for all of Sephral's modules, without a message id about their latest picture
      saveDebugFile: (messageId) => saveDebugFile(messageId ?? null, { moduleId: MODULE_ID })
    };
  }
  noticeNewVersions();
  await migrateHudButtonSetting();

  await showSessionReminderPopup();
  canvas?.tokens?.placeables?.forEach((token) => updateTokenIndicator(token));
});

Hooks.on('updateActor', (_actor, changes) => {
  if (!isGM() || !actorChangeAffectsNotes(changes)) return;
  scheduleRefreshOpenApps();
});

Hooks.on('createActor', () => {
  if (isGM()) scheduleRefreshOpenApps();
});

// deleteActor fires on every client. Only the active GM writes the orphan records, so they are stored once
// and players never attempt the world setting write. Other GMs only refresh their windows.
Hooks.on('deleteActor', (actor) => {
  if (!isGM()) return;
  const stashed = game.user.isActiveGM ? stashActorNotesAsOrphans(actor) : Promise.resolve();
  void stashed.then(() => scheduleRefreshOpenApps());
});
