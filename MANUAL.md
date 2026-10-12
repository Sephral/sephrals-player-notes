# Sephral’s Player Notes Manual

This manual covers the details. For a quick overview see the [README](README.md).

## What the module is for

Player Notes is designed for the kind of information that is easy for a GM to forget between sessions:

* story hooks tied to one character
* secrets the GM is holding back
* promises, debts and owed rewards
* backstory details that should matter later
* unresolved character scenes
* spotlight reminders for upcoming sessions
* prep items for the next session for specific party members

It is intentionally not a generic note module for every document type, and it does not try to replace Journals or become a full campaign wiki.

## Core workflow

* Open the dashboard with the Player Notes button in the Actor Directory, the Player Notes tool in the token controls, the shortcut Ctrl+Shift+N or the button in the module settings
* Open Player Notes with the header button of a supported actor sheet
* Open Player Notes from the context menu of the Actor Directory
* Optionally open Player Notes from the Token HUD (needs the Token indicators setting)
* Write a quick note for the selected token with the Quick Player Note tool in the token controls
* Use the global Player Notes Dashboard to review all tracked campaign notes
* Create notes from the dashboard, the notes window of an actor, the shortcut for a selected token or the actor sheet
* Export notes as JSON or session prep as Markdown from one export dialog
* Import notes with a preview that detects missing actors

## Features

* GM notes attached to actors
* Statuses: Open, Next Session, Resolved, Archived
* Priorities: Low, Normal, High, Urgent
* Included and custom tags
* A notes window per actor with quick actions
* Global dashboard with status, tag, priority, actor and text filters
* Dashboard views for actor grouping, detailed list review, compact scanning and session prep
* Indicators in the Actor Directory for open notes and notes for the next session
* Optional token indicators for urgent notes and notes for the next session
* A shortcut for the selected token that opens the full Create Player Note editor
* Import preview with missing actor references and duplicate detection
* One export dialog for the JSON export and the Markdown session prep export
* Orphan storage and cleanup for notes of deleted or missing actors
* Saved window sizes for the dashboard, the actor notes window and the module dialogs (per browser)
* API for macros and other modules to create, read and update notes

Note text supports Foundry links and readable formatting. Token indicators are intentionally lightweight and only visible to the GM.

## Privacy

* Only GMs can create, edit, archive, delete, import or export notes.
* The module hides GM notes from players in its interface.
* The module never posts note contents to the chat or shows them in any window players see.
* Notes are saved on the actor and are not encrypted. Foundry sends actor data to every connected client, so a player who opens the browser console can read them. Do not keep secrets in notes that players must never see.

## Export and import

* JSON and Markdown exports are downloaded by your browser when you use the export dialog. Nothing is exported automatically.
* Exports remember which character each note belongs to. The import preview shows notes whose character is missing in this world and notes that already exist.
* Notes of deleted characters are kept as orphans, so you can assign them to another character or clean them up.

## Macros

GMs can work with notes from macros or other modules through `game.modules.get("sephrals-player-notes").api`. Each function takes an actor, a token, an actor UUID or the id of a world actor. Calls from players throw an error.

| Function | What it does |
| --- | --- |
| `createNote(actor, data)` | Creates a note. `data` can contain `title`, `body`, `tags`, `status`, `priority` and `visibility`. Returns the new note. |
| `getNotes(actor, { status })` | Returns the notes of the actor. With `status`, only notes with that status are returned. |
| `updateNote(actor, noteId, changes)` | Changes the same fields as `createNote`. Returns the updated note, or `null` if the actor has no note with that id. |

Valid statuses are `open`, `next-session`, `resolved` and `archived`. Valid priorities are `low`, `normal`, `high` and `urgent`. Visibility is `gm-only` or `player-visible`. Other values throw an error.

```js
const api = game.modules.get("sephrals-player-notes").api
const actor = canvas.tokens.controlled[0]?.actor
await api.createNote(actor, { title: "Owes the smith 50 gp", tags: ["debt"], status: "next-session", priority: "high" })
```
