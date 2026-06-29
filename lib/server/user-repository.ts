import type { UserIdRow } from "../types";
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
