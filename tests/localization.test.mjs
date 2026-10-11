import test from "node:test";
import assert from "node:assert/strict";

import { LANGUAGE_CHOICES, MODULE_ID, SETTINGS } from "../scripts/constants.js";

const settingKey = `${MODULE_ID}.${SETTINGS.LANGUAGE}`;
let configuredLanguage = LANGUAGE_CHOICES.FOLLOW_FOUNDRY;

globalThis.game = {
  settings: {
    settings: new Map([[settingKey, {}]]),
    get: () => configuredLanguage
  },
  i18n: {
    lang: "fr",
    localize: (key) => (key === "SPN.Title" ? "Notes des joueurs" : key)
  }
};
globalThis.fetch = async (url) => ({
  ok: true,
  async json() {
    return String(url).endsWith("/de.json") ? { "SPN.Title": "Spielernotizen" } : { "SPN.Title": "Player Notes" };
  }
});

const { getOverrideLanguage, loadModuleTranslations, localize } = await import("../scripts/utils.js");
await loadModuleTranslations();

test("Follow Foundry uses Foundry's translation, also for languages the module does not bundle", () => {
  configuredLanguage = LANGUAGE_CHOICES.FOLLOW_FOUNDRY;
  assert.equal(getOverrideLanguage(), null);
  assert.equal(localize("SPN.Title"), "Notes des joueurs");
});

test("an explicitly chosen language overrides Foundry with the bundled translation", () => {
  configuredLanguage = LANGUAGE_CHOICES.GERMAN;
  assert.equal(localize("SPN.Title"), "Spielernotizen");
  configuredLanguage = LANGUAGE_CHOICES.ENGLISH;
  assert.equal(localize("SPN.Title"), "Player Notes");
  assert.equal(localize("SPN.Missing"), "SPN.Missing");
});
