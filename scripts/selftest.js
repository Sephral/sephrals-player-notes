import { MODULE_ID, SETTINGS, TESTED_VERSIONS } from "./constants.js";
import { getActorNotes, getWorldStateSync } from "./note-repository.js";
import { getSetting, setSetting } from "./settings.js";
import { format, localize } from "./utils.js";

// Self-test: the world state, the notes of a player character, the templates, the texts and the entry points in the
// actor directory and the token controls. Meant to be run after every Foundry update; the GM also gets a notice once
// when a newer Foundry is installed.

const DASHBOARD_TOOL = "spnDashboard";

async function templateExists(name) {
  try {
    return (await fetch(`modules/${MODULE_ID}/templates/${name}`, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

async function checkIntegrations() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if (!ok) problems.push(format(`SPN.SelfTest.${key}`, data));
  };

  check(game.i18n.has("SPN.ModuleTitle"), "Texts");
  check(Number.isFinite(getWorldStateSync()?.version), "WorldState");
  check((await templateExists("dashboard.hbs")) && (await templateExists("actor-notes.hbs")), "Templates");

  const actor = Array.from(game.actors ?? []).find((entry) => entry.hasPlayerOwner) ?? null;
  if (actor) check(Array.isArray(getActorNotes(actor)), "Notes", { name: actor.name });

  if (getSetting(SETTINGS.ACTOR_DIRECTORY_BUTTON, true) && ui.actors?.rendered) {
    check(!!ui.actors.element?.querySelector(".spn-directory-button"), "Directory");
  }
  const tokens = ui.controls?.controls?.tokens;
  if (tokens?.tools) check(!!tokens.tools[DASHBOARD_TOOL], "Controls");
  return { problems, checks, actor };
}

// Runs the self-test and reports the result as a notification and a whispered chat message.
export async function runSelfTest({ report = true } = {}) {
  const { problems, checks, actor } = await checkIntegrations();
  const versions = format("SPN.SelfTest.Version", { current: game.version, tested: TESTED_VERSIONS.core });
  const summary = problems.length
    ? format("SPN.SelfTest.Problems", { problems: problems.length, checks })
    : format("SPN.SelfTest.Passed", { checks });

  if (problems.length) ui.notifications.warn(summary, { permanent: true });
  else ui.notifications.info(summary);

  if (report) {
    const escape = foundry.utils.escapeHTML;
    let content = `<h3>${escape(localize("SPN.SelfTest.Title"))}</h3><p>${escape(summary)}</p><p><small>${escape(versions)}</small></p>`;
    if (problems.length) content += `<ul>${problems.map((problem) => `<li>${escape(problem)}</li>`).join("")}</ul>`;
    if (!actor) content += `<p><small>${escape(localize("SPN.SelfTest.NoCharacter"))}</small></p>`;
    await ChatMessage.implementation.create({ content, whisper: [game.user.id], speaker: { alias: game.modules.get(MODULE_ID)?.title } });
  }
  return { problems, checks };
}

// Tells the GM once when Foundry is newer than the version the module was verified against.
export function noticeNewVersions() {
  if (!game.user?.isGM || !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core)) return;
  const signature = `core ${game.version}`;
  if (getSetting(SETTINGS.ACKNOWLEDGED_VERSIONS, "") === signature) return;
  void setSetting(SETTINGS.ACKNOWLEDGED_VERSIONS, signature);
  ui.notifications.info(format("SPN.SelfTest.NewVersions", { versions: signature }), { permanent: true });
}
