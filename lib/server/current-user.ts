import { auth } from "@clerk/nextjs/server";
import { findOrCreateUserIdByClerkUserId } from "./user-repository";

// export const DEVELOPMENT_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function getCurrentUserId(): Promise<string> {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    throw new Error("Not signed in");
  }

  const appUserId = await findOrCreateUserIdByClerkUserId(clerkUserId);

  return appUserId;
}
