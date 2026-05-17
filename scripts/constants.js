export const MODULE_ID = "sephrals-player-notes";
export const MODULE_TITLE = "Sephral’s Player Notes";
export const DATA_VERSION = 1;
export const EXPORT_FORMAT_VERSION = 1;

export const FLAG_KEYS = Object.freeze({
  NOTES: "notes"
});

export const SETTINGS = Object.freeze({
  WORLD_STATE: "worldState",
  ACTOR_DIRECTORY_INDICATORS: "actorDirectoryIndicators",
  TOKEN_INDICATORS: "tokenIndicators",
  ACTOR_SHEET_BUTTONS: "actorSheetButtons",
  DEFAULT_STATUS: "defaultNoteStatus",
  HIDE_ARCHIVED: "hideArchivedByDefault",
  DEBUG_MODE: "debugMode",
  DEFAULT_DASHBOARD_VIEW: "defaultDashboardView",
  SESSION_REMINDER_POPUP: "sessionReminderPopup",
  WINDOW_GEOMETRY: "windowGeometry",
  LANGUAGE: "language"
});

export const LANGUAGE_CHOICES = Object.freeze({
  FOLLOW_FOUNDRY: "follow-foundry",
  GERMAN: "de",
  ENGLISH: "en"
});

export const NOTE_STATUSES = Object.freeze({
  OPEN: "open",
  NEXT_SESSION: "next-session",
  RESOLVED: "resolved",
  ARCHIVED: "archived"
});

export const NOTE_PRIORITIES = Object.freeze({
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
  URGENT: "urgent"
});

export const NOTE_VISIBILITY = Object.freeze({
  GM_ONLY: "gm-only",
  PLAYER_VISIBLE: "player-visible"
});

export const DASHBOARD_VIEWS = Object.freeze({
  GROUPED: "grouped",
  FLAT: "flat",
  NEXT_SESSION: "next-session",
  COMPACT: "compact",
  PREP: "prep"
});

export const TRACKING_MODES = Object.freeze({
  AUTO: "auto",
  TRACKED: "tracked",
  HIDDEN: "hidden"
});

export const IMPORT_MODES = Object.freeze({
  NEW: "new",
  MERGE: "merge",
  SKIP: "skip",
  REPLACE: "replace"
});

export const EXPORT_STATUS_FILTERS = Object.freeze({
  ALL: "all",
  OPEN: NOTE_STATUSES.OPEN,
  NEXT_SESSION: NOTE_STATUSES.NEXT_SESSION,
  RESOLVED: NOTE_STATUSES.RESOLVED,
  ARCHIVED: NOTE_STATUSES.ARCHIVED
});

export const BUILTIN_TAGS = Object.freeze([
  { value: "backstory", key: "SPN.Tag.Backstory" },
  { value: "secret", key: "SPN.Tag.Secret" },
  { value: "promise", key: "SPN.Tag.Promise" },
  { value: "debt", key: "SPN.Tag.Debt" },
  { value: "reward", key: "SPN.Tag.Reward" },
  { value: "consequence", key: "SPN.Tag.Consequence" },
  { value: "npc", key: "SPN.Tag.NPC" },
  { value: "quest", key: "SPN.Tag.Quest" },
  { value: "downtime", key: "SPN.Tag.Downtime" },
  { value: "relationship", key: "SPN.Tag.Relationship" },
  { value: "spotlight", key: "SPN.Tag.Spotlight" },
  { value: "session-prep", key: "SPN.Tag.SessionPrep" },
  { value: "combat", key: "SPN.Tag.Combat" },
  { value: "item", key: "SPN.Tag.Item" },
  { value: "location", key: "SPN.Tag.Location" },
  { value: "custom", key: "SPN.Tag.Custom" }
]);

export const HOTKEY_PRECEDENCE = globalThis.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 0;
export const PLAYER_TYPE_HINTS = Object.freeze(["character", "pc", "player", "hero", "party-member", "party_member"]);
