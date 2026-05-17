# Sephral’s Player Notes

Sephral’s Player Notes is a GM-only campaign memory and reminder tool for player characters in Foundry VTT.

It keeps private notes, secrets, promises, hooks, consequences, unresolved beats, and next-session reminders attached directly to player-facing Actors without replacing Foundry Journals or replacing existing Actor sheets.

## What the module is for

Sephral’s Player Notes is designed for the kind of information that is easy for a GM to forget between sessions:

- story hooks tied to one character
- secrets the GM is holding back
- promises, debts, and owed rewards
- backstory details that should matter later
- unresolved character scenes
- spotlight reminders for upcoming sessions
- next-session prep items for specific party members

It is intentionally not a generic note module for every document type.

## Core workflow

- Open Player Notes from a supported Actor sheet header button
- Open Player Notes from the Actor Directory context menu
- Optionally open Player Notes from the Token HUD
- Use the global Player Notes Dashboard to review all tracked campaign notes
- Create notes from the dashboard, an Actor notes window, a selected token shortcut, or Actor sheet access
- Export notes as JSON or session prep as Markdown from one export dialog
- Import notes with a preview and missing-Actor detection

## Features in version 1

- GM-only notes attached to Actors
- Statuses: Open, Next Session, Resolved, Archived
- Priorities: Low, Normal, High, Urgent
- Built-in and custom tags
- Actor-specific notes window with quick actions
- Global dashboard with status, tag, priority, Actor, and text filters
- Dashboard views for Actor grouping, detailed list review, compact scanning, and session prep
- Actor Directory indicators for open and next-session notes
- Optional token indicators for urgent or next-session notes
- Selected-token note shortcut that opens the full Create Player Note editor
- Import preview with missing Actor references and duplicate detection
- Single export dialog for JSON export and Markdown session-prep export
- Orphan note storage and cleanup support for deleted or missing Actors
- Client-side window size persistence for the dashboard, Actor notes window, and module dialogs

## Privacy

- Only GMs can create, edit, archive, delete, import, or export notes.
- Players do not see GM-only notes.
- The module does not send private note contents to chat, sockets, shared dialogs, or player-facing UI.

## Storage model

- Notes attached to existing Actors are stored on the Actor document as flags under scope `sephrals-player-notes`, flag key `notes`.
- Each note stores its title, body, tags, status, priority, visibility, Actor UUID, creation timestamp/user, and last-change timestamp/user.
- Supporting world data is stored in the world setting `sephrals-player-notes.worldState`. This setting stores manual Actor tracking modes, custom tags, and orphaned notes from deleted or missing Actors.
- Client-only UI preferences, including saved window sizes, are stored in client settings such as `sephrals-player-notes.windowGeometry`.
- Export payloads preserve Actor UUID references and add Actor name, image, and readable creator/updater names for easier review.
- JSON and Markdown exports are downloaded by the browser when the GM explicitly uses the export dialog; exports are not stored automatically by the module.

## Current limitations

- The module enriches note text for Foundry links and readable formatting, but it does not try to replace Journals or become a full campaign wiki.
- Token indicators are intentionally lightweight and GM-facing.
