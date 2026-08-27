import { getCurrentUserId } from "@/lib/server/current-user";
import {
  getUserSettings,
  saveUserSettings,
} from "@/lib/server/settings-repository";
import { isUserSettings } from "@/lib/settings";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    return Response.json({ settings: await getUserSettings(userId) });
  } catch {
    return Response.json({ error: "Could not load settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!isUserSettings(body)) {
      return Response.json({ error: "Invalid settings" }, { status: 400 });
    }
    const userId = await getCurrentUserId();
    return Response.json({ settings: await saveUserSettings(userId, body) });
  } catch {
    return Response.json({ error: "Could not save settings" }, { status: 500 });
  }
}
