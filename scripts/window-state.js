import { MODULE_ID, SETTINGS } from "./constants.js";

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

function getStore() {
  try {
    return foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.WINDOW_GEOMETRY) ?? {});
  } catch {
    return {};
  }
}

async function setStore(store) {
  if (!game?.settings?.settings?.has(`${MODULE_ID}.${SETTINGS.WINDOW_GEOMETRY}`)) return;
  await game.settings.set(MODULE_ID, SETTINGS.WINDOW_GEOMETRY, store);
}

function sanitizeGeometry(geometry = {}) {
  const width = Number(geometry.width);
  const height = Number(geometry.height);
  return {
    ...(Number.isFinite(width) && width > 0 ? { width: Math.max(MIN_WIDTH, Math.round(width)) } : {}),
    ...(Number.isFinite(height) && height > 0 ? { height: Math.max(MIN_HEIGHT, Math.round(height)) } : {})
  };
}

export function getSavedWindowPosition(key, fallback = {}) {
  return { ...fallback, ...sanitizeGeometry(getStore()[key] ?? {}) };
}

export async function saveWindowGeometry(key, geometry) {
  const nextGeometry = sanitizeGeometry(geometry);
  if (!nextGeometry.width && !nextGeometry.height) return;
  const store = getStore();
  store[key] = { ...(store[key] ?? {}), ...nextGeometry };
  await setStore(store);
}

export function saveDialogGeometryFromButton(key, button) {
  const windowElement = button?.form?.closest?.(".application, .window-app");
  if (!windowElement) return;
  void saveWindowGeometry(key, {
    width: windowElement.offsetWidth,
    height: windowElement.offsetHeight
  });
}

export function observeApplicationGeometry(app, key) {
  const windowElement = app?.element?.closest?.(".application, .window-app") ?? app?.element;
  if (!windowElement || windowElement.dataset.spnGeometryObserver === key) return;
  windowElement.dataset.spnGeometryObserver = key;

  let timer = null;
  const save = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void saveWindowGeometry(key, {
        width: windowElement.offsetWidth,
        height: windowElement.offsetHeight
      });
    }, 350);
  };

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(save);
    observer.observe(windowElement);
    app.addEventListener?.("close", () => observer.disconnect(), { once: true });
  }

  app.addEventListener?.("close", save, { once: true });
}