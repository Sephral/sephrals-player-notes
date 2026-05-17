import {
  DASHBOARD_VIEWS,
  LANGUAGE_CHOICES,
  MODULE_ID,
  NOTE_STATUSES,
  SETTINGS
} from "./constants.js";
import { defaultWorldState } from "./migration.js";
import { localize } from "./utils.js";

let openDashboardHandler = null;

export function setOpenDashboardHandler(handler) {
  openDashboardHandler = handler;
}

export class SPNSettingsMenu {
  render(force, options) {
    if (typeof openDashboardHandler === "function") openDashboardHandler();
    return this;
  }
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.WORLD_STATE, {
    scope: "world",
    config: false,
    type: Object,
    default: defaultWorldState()
  });

  game.settings.register(MODULE_ID, SETTINGS.ACTOR_DIRECTORY_INDICATORS, {
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    name: game.i18n.localize("SPN.Settings.ActorDirectoryIndicators.Name"),
    hint: game.i18n.localize("SPN.Settings.ActorDirectoryIndicators.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.TOKEN_INDICATORS, {
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    name: game.i18n.localize("SPN.Settings.TokenIndicators.Name"),
    hint: game.i18n.localize("SPN.Settings.TokenIndicators.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.ACTOR_SHEET_BUTTONS, {
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    name: game.i18n.localize("SPN.Settings.ActorSheetButtons.Name"),
    hint: game.i18n.localize("SPN.Settings.ActorSheetButtons.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_STATUS, {
    scope: "world",
    config: true,
    type: String,
    default: NOTE_STATUSES.OPEN,
    name: game.i18n.localize("SPN.Settings.DefaultStatus.Name"),
    hint: game.i18n.localize("SPN.Settings.DefaultStatus.Hint"),
    choices: {
      [NOTE_STATUSES.OPEN]: game.i18n.localize("SPN.Status.Open"),
      [NOTE_STATUSES.NEXT_SESSION]: game.i18n.localize("SPN.Status.NextSession"),
      [NOTE_STATUSES.RESOLVED]: game.i18n.localize("SPN.Status.Resolved"),
      [NOTE_STATUSES.ARCHIVED]: game.i18n.localize("SPN.Status.Archived")
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.HIDE_ARCHIVED, {
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    name: game.i18n.localize("SPN.Settings.HideArchived.Name"),
    hint: game.i18n.localize("SPN.Settings.HideArchived.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG_MODE, {
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    name: game.i18n.localize("SPN.Settings.Debug.Name"),
    hint: game.i18n.localize("SPN.Settings.Debug.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.DEFAULT_DASHBOARD_VIEW, {
    scope: "client",
    config: true,
    type: String,
    default: DASHBOARD_VIEWS.GROUPED,
    name: game.i18n.localize("SPN.Settings.DefaultView.Name"),
    hint: game.i18n.localize("SPN.Settings.DefaultView.Hint"),
    choices: {
      [DASHBOARD_VIEWS.GROUPED]: game.i18n.localize("SPN.View.Grouped"),
      [DASHBOARD_VIEWS.FLAT]: game.i18n.localize("SPN.View.Flat"),
      [DASHBOARD_VIEWS.COMPACT]: game.i18n.localize("SPN.View.Compact"),
      [DASHBOARD_VIEWS.PREP]: game.i18n.localize("SPN.View.Prep")
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.LANGUAGE, {
    scope: "client",
    config: true,
    type: String,
    default: LANGUAGE_CHOICES.FOLLOW_FOUNDRY,
    name: game.i18n.localize("SPN.Settings.Language.Name"),
    hint: game.i18n.localize("SPN.Settings.Language.Hint"),
    choices: {
      [LANGUAGE_CHOICES.FOLLOW_FOUNDRY]: game.i18n.localize("SPN.Language.FollowFoundry"),
      [LANGUAGE_CHOICES.GERMAN]: game.i18n.localize("SPN.Language.German"),
      [LANGUAGE_CHOICES.ENGLISH]: game.i18n.localize("SPN.Language.English")
    },
    onChange: () => {
      Hooks.callAll(`${MODULE_ID}.languageChanged`);
      ui.notifications?.info?.(localize("SPN.Notification.LanguageChanged"));
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.SESSION_REMINDER_POPUP, {
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    name: game.i18n.localize("SPN.Settings.Popup.Name"),
    hint: game.i18n.localize("SPN.Settings.Popup.Hint")
  });

  game.settings.register(MODULE_ID, SETTINGS.WINDOW_GEOMETRY, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  try {
    game.settings.registerMenu(MODULE_ID, "openDashboard", {
      name: game.i18n.localize("SPN.Settings.Menu.Name"),
      label: game.i18n.localize("SPN.Settings.Menu.Label"),
      hint: game.i18n.localize("SPN.Settings.Menu.Hint"),
      icon: "fa-solid fa-note-sticky",
      type: SPNSettingsMenu,
      restricted: true
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | Failed to register settings dashboard shortcut`, error);
  }
}

export function getSetting(key, fallback = null) {
  const fullKey = `${MODULE_ID}.${key}`;
  if (!game?.settings?.settings?.has(fullKey)) return fallback;
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return fallback;
  }
}

export async function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
