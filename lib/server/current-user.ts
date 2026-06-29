import { auth } from "@clerk/nextjs/server";
import { findOrCreateUserIdByClerkUserId } from "./user-repository";

export async function getCurrentUserId(): Promise<string> {
  const { userId: clerkUserId } = await auth();

  if (!clerkUserId) {
    throw new Error("Not signed in");
  }

  const appUserId = await findOrCreateUserIdByClerkUserId(clerkUserId);

  return appUserId;
}
