import { DEFAULT_USER_SETTINGS, isUserSettings } from "../settings";
import type { UserSettings } from "../types";
import { sql } from "./db";

interface SettingsRow {
  settings: unknown;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const rows = (await sql.query("select settings from users where id = $1", [
    userId,
  ])) as SettingsRow[];
  return isUserSettings(rows[0]?.settings)
    ? rows[0].settings
    : DEFAULT_USER_SETTINGS;
}

export async function saveUserSettings(
  userId: string,
  settings: UserSettings,
): Promise<UserSettings> {
  const rows = (await sql.query(
    `
      update users
      set settings = $2::jsonb, updated_at = now()
      where id = $1
      returning settings
    `,
    [userId, JSON.stringify(settings)],
  )) as SettingsRow[];
  if (!isUserSettings(rows[0]?.settings)) {
    throw new Error("Could not save settings");
  }
  return rows[0].settings;
}
