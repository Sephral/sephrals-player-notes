import test from "node:test";
import assert from "node:assert/strict";

const hooks = [];
const notices = { info: [], warn: [] };
const actors = [
  { id: "a1", name: "Zed", hasPlayerOwner: true },
  { id: "a2", name: "Amy", hasPlayerOwner: true },
  { id: "a3", name: "Goblin", hasPlayerOwner: false }
];
const byId = new Map(actors.map((actor) => [actor.id, actor]));
const messages = new Map();
let user = { isGM: true };

globalThis.Hooks = { on: (name, handler) => hooks.push([name, handler]), once() {} };
globalThis.ui = { notifications: { info: (text) => notices.info.push(text), warn: (text) => notices.warn.push(text) } };
globalThis.game = {
  get user() { return user; },
  i18n: {
    lang: "en",
    localize: (key) => ({
      "SPN.ChatNote.Entry": "Note for the Character",
      "SPN.ChatNote.LinkLabel": "Chat message",
      "SPN.ChatNote.FallbackTitle": "Message from {name}"
    })[key] ?? key
  },
  settings: { settings: new Map(), get: () => undefined },
  actors: Object.assign(Array.from(actors), { get: (id) => byId.get(id), contents: actors }),
  scenes: { get: (id) => (id === "s1" ? { tokens: { get: (tokenId) => (tokenId === "t1" ? { actor: byId.get("a2") } : null) } } : null) },
  messages: { get: (id) => messages.get(id) ?? null }
};

const chat = await import("../scripts/chat-note.js");

test("the text of a message loses its markup, keeps its lines and is trimmed", () => {
  const html = '<div class="x"><p>Seraphine says:&nbsp;&quot;Hello&quot;</p><p>  second   line </p><br><br><br><span>third</span></div><script>alert(1)</script>';
  assert.equal(chat.messageToPlainText(html), 'Seraphine says: "Hello"\nsecond line\n\nthird');
  assert.equal(chat.messageToPlainText(""), "");
  assert.equal(chat.messageToPlainText(undefined), "");
  assert.equal(chat.messageToPlainText("<p>a &amp; b &lt;c&gt;</p>"), "a & b <c>");
  const long = chat.messageToPlainText(`<p>${"word ".repeat(2000)}</p>`);
  assert.equal(long.length <= 4004, true);
  assert.equal(long.endsWith(" ..."), true);
});

test("a title is the first line, cut at a word when it is long", () => {
  assert.equal(chat.titleFromText("Short one\nmore"), "Short one");
  const title = chat.titleFromText(`${"alpha beta gamma ".repeat(10)}end`);
  assert.equal(title.length <= 64, true);
  assert.equal(title.endsWith(" ..."), true);
  assert.equal(title.includes("gamma gamm "), false);
  assert.equal(chat.titleFromText(""), "");
});

test("the draft holds the text and a link to the message, a fallback title for a card without text", () => {
  const draft = chat.buildDraft({ id: "m1", content: "<p>The smith wants 50 gp.</p>", speaker: { alias: "Hero" } });
  assert.equal(draft.title, "The smith wants 50 gp.");
  assert.equal(draft.body, "The smith wants 50 gp.\n\n@UUID[ChatMessage.m1]{Chat message}");
  const empty = chat.buildDraft({ id: "m2", content: "<img src=x>", speaker: { alias: "Hero" } });
  assert.equal(empty.title, "Message from Hero");
  assert.equal(empty.body, "@UUID[ChatMessage.m2]{Chat message}");
  assert.equal(chat.messageLink("x", "a [b] {c}"), "@UUID[ChatMessage.x]{a b c}");
});

test("the speaker's character is found by actor, token or the author's character", () => {
  assert.equal(chat.findSpeakerActor({ speaker: { actor: "a1" } }).id, "a1");
  assert.equal(chat.findSpeakerActor({ speaker: { actor: "gone", scene: "s1", token: "t1" } }).id, "a2");
  assert.equal(chat.findSpeakerActor({ speaker: { scene: "s1", token: "t1" } }).id, "a2");
  const playerCharacter = { id: "a1" };
  assert.equal(chat.findSpeakerActor({ speaker: {}, author: { isGM: false, character: playerCharacter } }), playerCharacter);
  // A GM's own character does not count, the GM speaks for many
  assert.equal(chat.findSpeakerActor({ speaker: {}, author: { isGM: true, character: playerCharacter } }), null);
  assert.equal(chat.findSpeakerActor({ speaker: {} }), null);
});

test("without a clear character the choice lists player characters by name", () => {
  assert.deepEqual(chat.candidateActors().map((actor) => actor.name), ["Amy", "Zed"]);
});

test("the context menu entry carries both key sets with an HTML icon and shows for the GM on a message", () => {
  chat.registerChatContextEntry();
  const [name, handler] = hooks.find(([hook]) => hook === "getChatMessageContextOptions");
  assert.equal(name, "getChatMessageContextOptions");
  const entries = [];
  handler({}, entries);
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.name, "Note for the Character");
  assert.equal(entry.label, "Note for the Character");
  assert.match(entry.icon, /^<i class="fa-solid /);
  for ( const key of ["condition", "visible", "callback", "onClick"] ) assert.equal(typeof entry[key], "function", key);

  messages.set("m1", { id: "m1" });
  const row = { dataset: { messageId: "m1" }, nodeType: 1 };
  assert.equal(entry.condition(row), true);
  assert.equal(entry.visible(row), true);
  assert.equal(entry.visible({ dataset: { messageId: "gone" }, nodeType: 1 }), false);
  user = { isGM: false };
  assert.equal(entry.visible(row), false);
  user = { isGM: true };
  handler({}, "not an array");
});
