import type { UserSettings } from "./types";

export const SETTINGS_STORAGE_KEY = "note-taking-app:settings";
export const LEGACY_TOUCH_DRAWING_STORAGE_KEY =
  "note-taking-app:draw-with-touch";
export const LEGACY_CANVAS_TOOLS_STORAGE_KEY =
  "note-taking-app:show-legacy-drawing-controls";

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "original",
  accent: "blue",
  touchDrawingEnabled: false,
  legacyCanvasToolsVisible: false,
};

export function isUserSettings(value: unknown): value is UserSettings {
  if (typeof value !== "object" || value === null) return false;
  const settings = value as Partial<UserSettings>;
  return (
    (settings.theme === "original" ||
      settings.theme === "light" ||
      settings.theme === "dark" ||
      settings.theme === "system") &&
    (settings.accent === "blue" ||
      settings.accent === "violet" ||
      settings.accent === "emerald" ||
      settings.accent === "rose" ||
      settings.accent === "amber") &&
    typeof settings.touchDrawingEnabled === "boolean" &&
    typeof settings.legacyCanvasToolsVisible === "boolean"
  );
}

export function loadLocalSettings(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_USER_SETTINGS;
  try {
    const value = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (value) {
      const parsed: unknown = JSON.parse(value);
      if (isUserSettings(parsed)) return parsed;
    }
    return {
      ...DEFAULT_USER_SETTINGS,
      touchDrawingEnabled:
        window.localStorage.getItem(LEGACY_TOUCH_DRAWING_STORAGE_KEY) ===
        "true",
      legacyCanvasToolsVisible:
        window.localStorage.getItem(LEGACY_CANVAS_TOOLS_STORAGE_KEY) === "true",
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveLocalSettings(settings: UserSettings) {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The in-memory settings remain useful when browser storage is blocked.
  }
}

export function applyAppearance(settings: UserSettings) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle(
    "dark",
    settings.theme === "dark" || (settings.theme === "system" && prefersDark),
  );
  root.dataset.theme = settings.theme;
  root.dataset.accent = settings.accent;
  root.style.colorScheme = root.classList.contains("dark") ? "dark" : "light";
}
