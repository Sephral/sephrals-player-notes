// The small pieces of Foundry's own windows and the canvas that this module adds to (directory button, indicator,
// Token HUD button, sheet header entry, token badge colors, reminder list). Built here so the real places and the sample
// windows (sample-windows.js) show the very same elements.
import { foundryEscape, localize } from "./utils.js";

export const TOKEN_INDICATOR_STYLES = Object.freeze({
  urgent: { fill: 0xb93d46, label: "!" },
  nextSession: { fill: 0xd06a4a, label: "N" }
});

/** The row with the labeled button below "Create Actor" in the Actor Directory. */
export function createDirectoryButtonRow(onClick = null) {
  const row = document.createElement("div");
  row.className = "header-actions action-buttons flexrow spn-directory-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spn-directory-button";
  button.dataset.tooltip = localize("SPN.Tooltip.OpenDashboard");
  button.innerHTML = `<i class="fa-solid fa-note-sticky" inert></i><span>${foundryEscape(localize("SPN.Directory.Button"))}</span>`;
  if (onClick) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
  }
  row.append(button);
  return row;
}

/** The badge with the number of open notes (or of notes for the next session) behind a name in the Actor Directory. */
export function createDirectoryIndicator(count) {
  const label = document.createElement("span");
  label.className = "spn-dir-indicator spn-badge";
  label.textContent = String(count);
  return label;
}

/** The button in the Token HUD. */
export function createHudButton(onClick = null) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-icon spn-hud-button";
  button.innerHTML = '<i class="fa-solid fa-note-sticky" inert></i>';
  button.dataset.tooltip = localize("SPN.Directory.Context.Open");
  button.setAttribute("aria-label", localize("SPN.Directory.Context.Open"));
  if (onClick) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onClick();
    });
  }
  return button;
}

/** The label of the sheet's header entry: the open notes of the actor. */
export function headerEntryLabelFor(openCount) {
  return `${localize("SPN.Button.OpenShort")} (${openCount})`;
}

/** The list of the session reminder window. notes: {actorName, title}[] */
export function reminderContent(notes) {
  return `
    <div class="spn-dialog">
      <ul>${notes.map((note) => `<li><strong>${foundryEscape(note.actorName)}</strong>: ${foundryEscape(note.title)}</li>`).join("")}</ul>
    </div>`;
}
