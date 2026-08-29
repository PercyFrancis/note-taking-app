"use client";

import { useEffect, useState } from "react";
import {
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/ui/buttonStyles";
import type { AccentColor, ThemeMode, UserSettings } from "@/lib/types";

type SettingsSection = "appearance" | "editor" | "shortcuts" | "data";

interface SettingsDialogProps {
  settings: UserSettings;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onChange: (settings: UserSettings) => void;
  onClose: () => void;
  isLocalMode?: boolean;
  localStorageInfo?: {
    usage: number;
    quota: number;
    persisted: boolean;
  } | null;
  onRequestLocalPersistence?: () => void;
}

const SECTIONS: Array<{ id: SettingsSection; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "data", label: "Data" },
];

const ACCENTS: Array<{
  id: AccentColor;
  label: string;
  swatch: string;
}> = [
  { id: "blue", label: "Blue", swatch: "bg-[#0ea5e9]" },
  { id: "violet", label: "Violet", swatch: "bg-violet-500" },
  { id: "emerald", label: "Emerald", swatch: "bg-emerald-500" },
  { id: "rose", label: "Rose", swatch: "bg-rose-500" },
  { id: "amber", label: "Amber", swatch: "bg-amber-500" },
];

const SHORTCUT_GROUPS = [
  {
    title: "Notebook and search",
    rows: [
      ["Ctrl/Cmd + F", "Open or refocus find and replace"],
      ["Enter / Shift + Enter", "Next / previous find result"],
      ["Ctrl/Cmd + Z", "Undo the last structural cell action"],
      ["Ctrl/Cmd + Shift + Z", "Redo the last structural cell action"],
      ["Escape", "Close the active dialog or find bar"],
    ],
  },
  {
    title: "Selected cell",
    rows: [
      ["Ctrl/Cmd + Enter", "Add a text cell after the selected cell"],
      ["Ctrl/Cmd + Shift + Enter", "Duplicate the selected cell"],
      ["Ctrl/Cmd + Backspace", "Delete the selected cell"],
      ["Alt + Enter", "Add an Excalidraw cell after the selected cell"],
      ["Alt + Arrow Up / Down", "Move the selected cell"],
    ],
  },
  {
    title: "Text editing",
    rows: [
      ["Tab", "Insert a tab or indent selected lines"],
      ["Shift + Tab", "Remove indentation from selected lines"],
    ],
  },
] as const;

function ToggleSetting({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-5 rounded-lg border border-slate-200 bg-white p-4">
      <span>
        <span className="block text-sm font-medium text-slate-900">
          {label}
        </span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 accent-sky-600"
      />
    </label>
  );
}

export default function SettingsDialog({
  settings,
  saveStatus,
  onChange,
  onClose,
  isLocalMode = false,
  localStorageInfo,
  onRequestLocalPersistence,
}: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const update = <Key extends keyof UserSettings>(
    key: Key,
    value: UserSettings[Key],
  ) => onChange({ ...settings, [key]: value });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close settings"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:flex-row"
      >
        <aside className="border-b border-slate-200 bg-slate-50 p-4 md:w-52 md:border-r md:border-b-0">
          <h2 id="settings-title" className="px-2 text-lg font-semibold">
            Settings
          </h2>
          <nav className="mt-3 flex gap-1 overflow-x-auto md:flex-col">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium ${
                  section === item.id
                    ? "app-selected bg-sky-600 text-white"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            {section === "appearance" && (
              <div>
                <h3 className="text-lg font-semibold">Appearance</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Theme and color choices synchronize with your account.
                </p>

                <fieldset className="mt-6">
                  <legend className="text-sm font-medium">Theme</legend>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      ["original", "system", "light", "dark"] as ThemeMode[]
                    ).map((theme) => (
                      <label
                        key={theme}
                        className={`cursor-pointer rounded-lg border p-4 capitalize ${
                          settings.theme === theme
                            ? "theme-choice-selected border-sky-500 bg-sky-50 ring-1 ring-sky-500"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name="theme"
                          value={theme}
                          checked={settings.theme === theme}
                          onChange={() => update("theme", theme)}
                          className="sr-only"
                        />
                        <span className="text-sm font-medium">{theme}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="mt-7">
                  <legend className="text-sm font-medium">Accent color</legend>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {ACCENTS.map((accent) => (
                      <label
                        key={accent.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                          settings.accent === accent.id
                            ? "border-sky-500 ring-1 ring-sky-500"
                            : "border-slate-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name="accent"
                          checked={settings.accent === accent.id}
                          onChange={() => update("accent", accent.id)}
                          className="sr-only"
                        />
                        <span
                          className={`h-4 w-4 rounded-full ${accent.swatch}`}
                        />
                        {accent.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {section === "editor" && (
              <div>
                <h3 className="text-lg font-semibold">Editor</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Compatibility and drawing input preferences.
                </p>
                <div className="mt-6 space-y-3">
                  <ToggleSetting
                    checked={settings.legacyCanvasToolsVisible}
                    label="Legacy canvas tools"
                    description="Show controls for creating compatibility bitmap canvas cells. Existing legacy cells remain visible when this is off."
                    onChange={(checked) =>
                      update("legacyCanvasToolsVisible", checked)
                    }
                  />
                  <ToggleSetting
                    checked={settings.touchDrawingEnabled}
                    label="Draw with touch"
                    description="Allow finger drawing in Excalidraw cells, legacy canvas cells, and the PDF editor. When disabled, fingers scroll or zoom while pens still draw."
                    onChange={(checked) =>
                      update("touchDrawingEnabled", checked)
                    }
                  />
                </div>
              </div>
            )}

            {section === "shortcuts" && (
              <div>
                <h3 className="text-lg font-semibold">Keyboard shortcuts</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Ctrl applies to Windows/Linux; use Cmd on macOS. Cell actions
                  operate on the outlined selected cell.
                </p>
                <div className="mt-6 space-y-6">
                  {SHORTCUT_GROUPS.map((group) => (
                    <section key={group.title}>
                      <h4 className="text-sm font-semibold">{group.title}</h4>
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                        {group.rows.map(([shortcut, action]) => (
                          <div
                            key={shortcut}
                            className="grid gap-1 border-b border-slate-200 px-4 py-3 last:border-b-0 sm:grid-cols-[13rem_1fr]"
                          >
                            <kbd className="font-mono text-xs font-semibold text-slate-700">
                              {shortcut}
                            </kbd>
                            <span className="text-sm text-slate-600">
                              {action}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {section === "data" && (
              <div>
                <h3 className="text-lg font-semibold">Data and portability</h3>
                <div className="mt-5 space-y-4 text-sm text-slate-600">
                  {isLocalMode && localStorageInfo && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <h4 className="font-medium text-slate-900">
                        Browser storage
                      </h4>
                      <p className="mt-1">
                        {formatStorageSize(localStorageInfo.usage)} used of
                        approximately{" "}
                        {formatStorageSize(localStorageInfo.quota)}.
                      </p>
                      <p className="mt-1">
                        {localStorageInfo.persisted
                          ? "The browser granted persistent storage."
                          : "Storage is not persistent and may be cleared under disk pressure."}
                      </p>
                      {!localStorageInfo.persisted &&
                        onRequestLocalPersistence && (
                          <button
                            type="button"
                            className={`${secondaryButtonClass} mt-3`}
                            onClick={onRequestLocalPersistence}
                          >
                            Request persistent storage
                          </button>
                        )}
                    </div>
                  )}
                  <div className="rounded-lg border border-slate-200 p-4">
                    <h4 className="font-medium text-slate-900">
                      Image library
                    </h4>
                    <p className="mt-1">
                      Open it from the notebook toolbar to reuse, rename,
                      restore, or delete private images.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <h4 className="font-medium text-slate-900">JSON export</h4>
                    <p className="mt-1">
                      Lightweight and fast. Private image links continue to
                      require access to the exporting account.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <h4 className="font-medium text-slate-900">
                      Portable ZIP export
                    </h4>
                    <p className="mt-1">
                      Use a notebook or folder's right-click menu to include
                      private images for transfer to another account.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
            <p className="text-xs text-slate-500" aria-live="polite">
              {saveStatus === "saving" && "Saving…"}
              {saveStatus === "saved" &&
                (isLocalMode
                  ? "Saved on this device"
                  : "Saved to your account")}
              {saveStatus === "error" &&
                "Could not sync; saved in this browser"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className={primaryButtonClass}
            >
              Done
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}

function formatStorageSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
