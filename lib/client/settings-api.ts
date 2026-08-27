import { isUserSettings } from "../settings";
import type { UserSettings, UserSettingsResponse } from "../types";

function readResponse(value: unknown): UserSettings | null {
  if (typeof value !== "object" || value === null || !("settings" in value)) {
    return null;
  }
  return isUserSettings((value as UserSettingsResponse).settings)
    ? (value as UserSettingsResponse).settings
    : null;
}

export async function loadRemoteSettings(): Promise<UserSettings> {
  const response = await fetch("/api/settings");
  const settings = readResponse(await response.json());
  if (!response.ok || !settings) throw new Error("Could not load settings");
  return settings;
}

export async function saveRemoteSettings(settings: UserSettings) {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error("Could not save settings");
}
