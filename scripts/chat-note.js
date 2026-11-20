import { MODULE_ID } from "./constants.js";
import { promptNoteEditor } from "./quick-note-dialog.js";
import { countFeature } from "./usage.mjs";
import { escapeHtml, format, isGM, localize, resolveElement } from "./utils.js";

// The longest text taken over from a message, and the longest title made from it.
const MAX_TEXT_LENGTH = 4000;
const MAX_TITLE_LENGTH = 60;
const FLASH_CLASS = "spn-message-flash";
const FLASH_MS = 2200;

const ENTITIES = Object.freeze({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&#x27;": "'", "&nbsp;": " " });

/**
 * The text of a chat message without markup: line breaks and paragraphs become new lines, runs of blanks collapse,
 * empty lines shrink to one, the ends are trimmed and the whole is cut at a sensible length.
 * @param {string} html
 * @returns {string}
 */
export function messageToPlainText(html) {
  const source = String(html ?? "")
    .replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|blockquote|section|header|footer)\s*>/gi, "\n");
  let text;
  if (typeof DOMParser === "function") {
    // A parsed document is inert: nothing loads and no script runs.
    text = new DOMParser().parseFromString(source, "text/html").body?.textContent ?? "";
  } else {
    text = source.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity);
  }
  const lines = text.replace(/ /g, " ").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
  const kept = [];
  for (const line of lines) {
    if (!line && (!kept.length || !kept.at(-1))) continue;
    kept.push(line);
  }
  const result = kept.join("\n").trim();
  return result.length > MAX_TEXT_LENGTH ? `${result.slice(0, MAX_TEXT_LENGTH).trimEnd()} ...` : result;
}

/** The first line of the text as a title, cut after a few words when it is long. */
export function titleFromText(text) {
  const first = String(text ?? "").split("\n").find((line) => line.trim()) ?? "";
  if (first.length <= MAX_TITLE_LENGTH) return first;
  const cut = first.slice(0, MAX_TITLE_LENGTH);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_TITLE_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()} ...`;
}

/** The link to the message that goes below the text. Core resolves the UUID, the click is handled below. */
export function messageLink(messageId, label) {
  return `@UUID[ChatMessage.${messageId}]{${String(label ?? "").replace(/[\[\]{}]/g, "")}}`;
}

/**
 * The prefilled note for a message.
 * @param {object} message   A chat message (or anything with id, content and a speaker)
 * @returns {{title: string, body: string}}
 */
export function buildDraft(message) {
  const text = messageToPlainText(message?.content);
  const alias = message?.speaker?.alias || message?.author?.name || "";
  const title = titleFromText(text) || format("SPN.ChatNote.FallbackTitle", { name: alias });
  const link = messageLink(message?.id, localize("SPN.ChatNote.LinkLabel"));
  return { title, body: text ? `${text}\n\n${link}` : link };
}

/**
 * The character a message belongs to, when that is clear: the speaker's actor, else the actor of the speaker's token,
 * else the character the author plays. Null when none of them exists.
 * @param {object} message
 * @returns {Actor|null}
 */
export function findSpeakerActor(message) {
  const speaker = message?.speaker ?? {};
  const world = globalThis.game;
  const direct = speaker.actor ? world?.actors?.get?.(speaker.actor) : null;
  if (direct) return direct;
  const token = speaker.scene && speaker.token ? world?.scenes?.get?.(speaker.scene)?.tokens?.get?.(speaker.token) : null;
  if (token?.actor) return token.actor;
  const author = message?.author ?? null;
  if (author && !author.isGM && author.character) return author.character;
  return null;
}

/** The characters offered when a message gives no clear one: those a player owns, else every actor. */
export function candidateActors() {
  const actors = Array.from(globalThis.game?.actors?.contents ?? globalThis.game?.actors ?? []);
  const owned = actors.filter((actor) => actor.hasPlayerOwner);
  return (owned.length ? owned : actors).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function askForActor(candidates, preselected) {
  const options = candidates.map((actor) => `<option value="${escapeHtml(actor.id)}"${actor.id === preselected?.id ? " selected" : ""}>${escapeHtml(actor.name)}</option>`).join("");
  const content = `
    <div class="spn-dialog">
      <label>
        <span>${escapeHtml(localize("SPN.ChatNote.ChooseLabel"))}</span>
        <select name="actorId">${options}</select>
      </label>
    </div>`;
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: localize("SPN.ChatNote.ChooseTitle") },
    content,
    buttons: [
      { action: "ok", label: localize("SPN.ChatNote.ChooseConfirm"), default: true, callback: (_event, button) => button.form.elements.actorId.value },
      { action: "cancel", label: localize("SPN.Button.Cancel") }
    ],
    rejectClose: false,
    modal: true
  });
  if (!id || id === "cancel") return null;
  return candidates.find((actor) => actor.id === id) ?? null;
}

/**
 * The context menu action: a note on the message's character (asking which one when it is unclear), the text and a
 * link to the message in the editor. Resolves to the saved note, or null when nothing was saved.
 * @param {object} message
 */
export async function noteFromChatMessage(message) {
  if (!isGM() || !message) return null;
  let actor = findSpeakerActor(message);
  if (!actor) {
    const candidates = candidateActors();
    if (!candidates.length) {
      ui.notifications?.warn(localize("SPN.ChatNote.NoCharacter"));
      return null;
    }
    actor = await askForActor(candidates, message.author?.character ?? null);
    if (!actor) return null;
  }
  const note = await promptNoteEditor({ actor, prefill: buildDraft(message) });
  if (!note) return null;
  countFeature(MODULE_ID, "noteFromChat");
  ui.notifications?.info(format("SPN.ChatNote.Saved", { name: actor.name }));
  return note;
}

function messageFromEntry(target) {
  const element = resolveElement(target) ?? target;
  const id = element?.dataset?.messageId ?? element?.closest?.("[data-message-id]")?.dataset?.messageId;
  return id ? globalThis.game?.messages?.get?.(id) ?? null : null;
}

/**
 * The entry for the chat message context menu. v13 reads name, icon, condition and callback, v14 label, visible and
 * onClick, so both sets are given with an HTML icon.
 */
export function createChatContextEntry() {
  const run = (target) => {
    const message = messageFromEntry(target);
    if (message) void noteFromChatMessage(message);
  };
  const shown = (target) => isGM() && Boolean(messageFromEntry(target));
  return {
    // Read when the menu opens: the module language is loaded after "init" and can change at any time
    get name() { return localize("SPN.ChatNote.Entry"); },
    get label() { return localize("SPN.ChatNote.Entry"); },
    icon: '<i class="fa-solid fa-note-sticky"></i>',
    condition: shown,
    visible: shown,
    callback: run,
    onClick: (_event, target) => run(target)
  };
}

/** Registers the entry. Call in "init": the chat log builds its context menu before "ready". */
export function registerChatContextEntry() {
  Hooks.on("getChatMessageContextOptions", (_app, entries) => {
    if (!Array.isArray(entries)) return;
    entries.push(createChatContextEntry());
  });
}

/**
 * A click on the link in a note leads to the message in the chat log. Core opens nothing for a chat message, so the
 * module scrolls to it and lets it flash; a message that is no longer in the log is said so.
 */
export function openMessageLink(uuid) {
  const id = String(uuid ?? "").replace(/^ChatMessage\./, "");
  if (!id) return false;
  try {
    ui.sidebar?.changeTab?.("chat", "primary");
  } catch {
    // The sidebar cannot switch tabs here, the chat may already be open.
  }
  const row = Array.from(document.querySelectorAll(`.chat-message[data-message-id]`)).find((element) => element.dataset.messageId === id);
  if (!row) {
    ui.notifications?.info(localize("SPN.ChatNote.NotShown"));
    return false;
  }
  row.scrollIntoView?.({ block: "center", behavior: "smooth" });
  row.classList.add(FLASH_CLASS);
  window.setTimeout(() => row.classList.remove(FLASH_CLASS), FLASH_MS);
  return true;
}

export function activateMessageLinks() {
  // In the capture phase on the document, so the click never reaches the core content link handler on the body, which
  // would open an empty sheet of the chat message next to the jump.
  document.addEventListener("click", (event) => {
    const link = event.target?.closest?.("a[data-link][data-uuid^='ChatMessage.']");
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    openMessageLink(link.dataset.uuid);
  }, true);
}
