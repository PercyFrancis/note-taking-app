import type { ClerkUserSyncInput, UserIdRow } from "../types";
import { sql } from "./db";

export async function findOrCreateUserIdByClerkUserId(
  clerkUserId: string,
): Promise<string> {
  const rows = (await sql.query(
    `
      insert into users (clerk_user_id)
      values ($1)
      on conflict (clerk_user_id) do update
      set clerk_user_id = excluded.clerk_user_id
      returning id
    `,
    [clerkUserId],
  )) as UserIdRow[];

  const row = rows[0];

  return row.id;
}

export async function syncUserFromClerk(
  syncInput: ClerkUserSyncInput,
): Promise<void> {
  await sql.query(
    `
    insert into users (clerk_user_id, email, name, image_url)
    values ($1, $2, $3, $4)
    on conflict (clerk_user_id) do update
    set
    email = excluded.email,
    name = excluded.name,
    image_url = excluded.image_url,
    updated_at = now(),
    clerk_synced_at = now(),
    deleted_at = null
    `,
    [
      syncInput.clerkUserId,
      syncInput.email,
      syncInput.name,
      syncInput.imageUrl,
    ],
  );
}

export async function markUserDeletedFromClerkWebhook(
  clerkUserId: string,
): Promise<void> {
  await sql.query(
    `
    update users
    set deleted_at = now(), updated_at = now(), clerk_synced_at = now()
    where clerk_user_id = $1
    `,
    [clerkUserId],
  );
}
