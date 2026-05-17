import {
  HOTKEY_PRECEDENCE,
  MODULE_ID,
  NOTE_STATUSES,
  SETTINGS,
  TRACKING_MODES
} from "./constants.js";
import { PlayerActorNotesApp } from "./actor-notes-app.js";
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
import { promptQuickNoteForActors } from "./quick-note-dialog.js";
import { registerSettings, getSetting, setOpenDashboardHandler } from "./settings.js";
import {
  debugLog,
  getContextDocumentId,
  getSelectedTokenActors,
  getSingleSelectedActor,
  isGM,
  loadModuleTranslations,
  localize,
  registerTemplateLocalization,
  resolveActorUuidSync
} from "./utils.js";

let dashboardApp = null;
const actorApps = new Map();
let reminderShown = false;
const PLAYER_NOTES_CONTROL = 'playerNotes';
const QUICK_NOTE_TOOL = 'quick-note';
const DASHBOARD_TOOL = 'dashboard';

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
  await promptQuickNoteForActors(actors);
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

function createActorDirectoryContextOption() {
  return {
    name: localize("SPN.Directory.Context.Open"),
    icon: '<i class="fa-solid fa-note-sticky"></i>',
    condition: () => game.user.isGM,
    callback: (target) => {
      const actor = getActorDirectoryEntry(target);
      if (!actor) return;
      void openActorNotes(actor);
    }
  };
}

function createTrackContextOption() {
  return {
    name: localize("SPN.Directory.Context.Track"),
    icon: '<i class="fa-solid fa-thumbtack"></i>',
    condition: () => game.user.isGM,
    callback: (target) => {
      const actor = getActorDirectoryEntry(target);
      if (!actor) return;
      void setActorTrackingMode(actor.uuid, TRACKING_MODES.TRACKED).then(() => refreshOpenApps());
    }
  };
}

function createHideContextOption() {
  return {
    name: localize("SPN.Directory.Context.Hide"),
    icon: '<i class="fa-solid fa-eye-slash"></i>',
    condition: () => game.user.isGM,
    callback: (target) => {
      const actor = getActorDirectoryEntry(target);
      if (!actor) return;
      void setActorTrackingMode(actor.uuid, TRACKING_MODES.HIDDEN).then(() => refreshOpenApps());
    }
  };
}

function injectActorDirectoryIndicators(app, html) {
  if (!isGM() || !getSetting(SETTINGS.ACTOR_DIRECTORY_INDICATORS, true)) return;
  const root = html?.[0] ?? html;
  if (!root?.querySelectorAll) return;

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

function updateTokenIndicator(token) {
  const existing = token.spnIndicator;
  if (existing) {
    existing.removeChildren();
    existing.visible = false;
  }

  if (!isGM() || !getSetting(SETTINGS.TOKEN_INDICATORS, true)) return;
  if (!token?.actor) return;

  const summary = getActorIndicatorSummary(token.actor);
  if (!summary.hasTokenIndicator) return;

  const container = existing ?? new PIXI.Container();
  const badge = new PIXI.Graphics();
  badge.beginFill(summary.counts.urgent > 0 ? 0xb93d46 : 0xd06a4a, 0.95);
  badge.lineStyle(1, 0x111111, 0.9);
  badge.drawCircle(0, 0, 11);
  badge.endFill();

  const TextClass = foundry?.canvas?.containers?.PreciseText ?? globalThis.PIXI?.Text;
  const text = new TextClass(summary.counts.urgent > 0 ? '!' : 'N', {
    fill: 0xffffff,
    fontSize: 14,
    fontWeight: 'bold'
  });
  text.anchor?.set?.(0.5);
  container.addChild(badge);
  container.addChild(text);
  container.position.set((token.w ?? token.document?.width ?? 1) - 10, 10);
  container.eventMode = 'none';
  container.visible = true;
  container.name = 'spn-token-indicator';

  if (!existing) {
    token.addChild(container);
    token.spnIndicator = container;
  }
}

function injectTokenHudButton(_app, html, data) {
  if (!isGM() || !getSetting(SETTINGS.TOKEN_INDICATORS, true)) return;
  const actor = canvas?.tokens?.get(data._id)?.actor;
  if (!actor) return;

  const root = html?.[0] ?? html;
  if (!root?.querySelector) return;
  const left = root.querySelector('.col.left') ?? root;
  if (left.querySelector('.spn-hud-button')) return;

  const button = document.createElement('div');
  button.className = 'control-icon spn-hud-button';
  button.dataset.action = 'spn-open-actor-notes';
  button.innerHTML = '<i class="fa-solid fa-note-sticky"></i>';
  button.title = localize('SPN.Directory.Context.Open');
  button.addEventListener('click', () => {
    void openActorNotes(actor);
  });
  left.append(button);
}

function injectActorSheetHeaderLink(app, html) {
  if (!isGM() || !getSetting(SETTINGS.ACTOR_SHEET_BUTTONS, true)) return;
  const actor = getActorFromSheet(app);
  if (!actor) return;

  const contentRoot = html?.[0] ?? html;
  const appElement = app?.element?.[0] ?? app?.element ?? null;
  const windowRoot = appElement?.querySelector?.('.window-header') ? appElement : contentRoot?.closest?.('.window-app, .application') ?? contentRoot;
  const header = windowRoot?.querySelector?.('.window-header');
  if (!header || header.querySelector('.spn-actor-sheet-link, .spn-open-actor-notes')) return;

  const openCount = getActorNotes(actor).filter((note) => note.status === NOTE_STATUSES.OPEN).length;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'header-control spn-actor-sheet-link';
  button.setAttribute('aria-label', localize('SPN.Tooltip.ActorHeaderNotes'));
  button.title = localize('SPN.Tooltip.ActorHeaderNotes');
  button.dataset.tooltip = localize('SPN.Tooltip.ActorHeaderNotes');
  button.innerHTML = `<i class="fa-solid fa-note-sticky"></i><span>${foundry.utils.escapeHTML(localize('SPN.Button.OpenShort'))} (${openCount})</span>`;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openActorNotes(actor);
  });

  const closeButton = header.querySelector('[data-action="close"]');
  if (closeButton) header.insertBefore(button, closeButton);
  else header.append(button);
}

function scheduleActorSheetHeaderLink(app, html) {
  injectActorSheetHeaderLink(app, html);
  window.setTimeout(() => injectActorSheetHeaderLink(app, html), 50);
}

function installSceneControlClickFallback() {
  const handlers = [
    [`[data-control="${PLAYER_NOTES_CONTROL}"]`, QUICK_NOTE_TOOL, quickNoteForSelectedTokens],
    [`[data-tool="${QUICK_NOTE_TOOL}"]`, QUICK_NOTE_TOOL, quickNoteForSelectedTokens],
    [`[data-tool="${DASHBOARD_TOOL}"]`, DASHBOARD_TOOL, toggleDashboard]
  ];

  for (const [selector, key, handler] of handlers) {
    const button = document.querySelector(selector);
    if (!button || button.dataset.spnClickFallback === key) continue;
    button.dataset.spnClickFallback = key;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void handler();
    });
  }
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
  registerTemplateLocalization();
  void loadModuleTranslations();
  registerSettings();
  setOpenDashboardHandler(openDashboard);

  Hooks.on('getActorSheetHeaderButtons', (app, buttons) => {
    if (!isGM() || !getSetting(SETTINGS.ACTOR_SHEET_BUTTONS, true)) return;
    const actor = getActorFromSheet(app);
    if (!actor) return;
    const openCount = getActorNotes(actor).filter((note) => note.status === NOTE_STATUSES.OPEN).length;
    buttons.unshift({
      label: `${localize('SPN.Button.OpenShort')} (${openCount})`,
      class: 'spn-open-actor-notes',
      icon: 'fa-solid fa-note-sticky',
      tooltip: localize('SPN.Tooltip.ActorHeaderNotes'),
      title: localize('SPN.Tooltip.ActorHeaderNotes'),
      onclick: () => {
        void openActorNotes(actor);
      }
    });
  });

  Hooks.on('getActorDirectoryEntryContext', (_app, options) => {
    options.push(createActorDirectoryContextOption(), createTrackContextOption(), createHideContextOption());
  });

  Hooks.on('renderActorSheet', scheduleActorSheetHeaderLink);
  Hooks.on('renderActorSheetV2', scheduleActorSheetHeaderLink);
  Hooks.on('renderActorDirectory', injectActorDirectoryIndicators);
  Hooks.on('renderTokenHUD', injectTokenHudButton);

  Hooks.on('getSceneControlButtons', (controls) => {
    if (!isGM()) return;
    controls[PLAYER_NOTES_CONTROL] = {
      name: PLAYER_NOTES_CONTROL,
      title: localize('SPN.SceneTool.QuickNote'),
      icon: 'fa-solid fa-bolt',
      visible: true,
      order: Object.keys(controls).length,
      activeTool: QUICK_NOTE_TOOL,
      onChange: (_event, active) => {
        if (active) void quickNoteForSelectedTokens();
      },
      tools: {
        [QUICK_NOTE_TOOL]: {
          name: QUICK_NOTE_TOOL,
          title: localize('SPN.SceneTool.QuickNote'),
          icon: 'fa-solid fa-bolt',
          order: 0,
          button: true,
          visible: true,
          onChange: (_event, active) => {
            if (active) void quickNoteForSelectedTokens();
          }
        },
        [DASHBOARD_TOOL]: {
          name: DASHBOARD_TOOL,
          title: localize('SPN.SceneTool.Dashboard'),
          icon: 'fa-solid fa-note-sticky',
          order: 1,
          button: true,
          visible: true,
          onChange: (_event, active) => {
            if (active) void toggleDashboard();
          }
        }
      }
    };
  });

  Hooks.on('canvasReady', installSceneControlClickFallback);
  Hooks.on('renderSceneControls', installSceneControlClickFallback);

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
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openDashboard,
      toggleDashboard,
      openActorNotes,
      quickNoteForSelectedTokens,
      openOrphanCleanupDialog
    };
  }

  await showSessionReminderPopup();
  canvas?.tokens?.placeables?.forEach((token) => updateTokenIndicator(token));
});

Hooks.on('updateActor', () => {
  void refreshOpenApps();
});

Hooks.on('createActor', () => {
  void refreshOpenApps();
});

Hooks.on('deleteActor', (actor) => {
  void stashActorNotesAsOrphans(actor).then(() => refreshOpenApps());
});
