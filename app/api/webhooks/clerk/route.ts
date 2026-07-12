import type { WebhookEvent } from "@clerk/nextjs/webhooks";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import {
  markUserDeletedFromClerkWebhook,
  syncUserFromClerk,
} from "@/lib/server/user-repository";
import type { ClerkUserSyncInput } from "@/lib/types";

type ClerkUserWebhookData = Extract<
  WebhookEvent,
  { type: "user.created" | "user.updated" }
>["data"];

function getPrimaryEmail(userData: ClerkUserWebhookData): string | null {
  const primaryEmailId = userData.primary_email_address_id;

  const primaryEmail = userData.email_addresses.find(
    (email) => email.id === primaryEmailId,
  );

  return (
    primaryEmail?.email_address ??
    userData.email_addresses[0]?.email_address ??
    null
  );
}

function getDisplayName(
  userData: ClerkUserWebhookData,
  fallbackEmail: string | null,
): string | null {
  const combinedName = [userData.first_name, userData.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (combinedName !== "") {
    return combinedName;
  }

  if (userData.username) {
    return userData.username;
  }

  return fallbackEmail;
}

function getImageUrl(userData: ClerkUserWebhookData): string | null {
  return userData.image_url;
}

function buildClerkUserSyncInput(
  userData: ClerkUserWebhookData,
): ClerkUserSyncInput {
  const email = getPrimaryEmail(userData);
  return {
    clerkUserId: userData.id,
    email,
    name: getDisplayName(userData, email),
    imageUrl: getImageUrl(userData),
  };
}

export async function POST(request: NextRequest) {
  let event: WebhookEvent;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    console.error("Webhook verification failed:", error);
    return Response.json(
      { error: "Webhook verification failed" },
      { status: 400 },
    );
  }
  try {
    if (event.type === "user.created") {
      const userData = event.data;

      const syncInput = buildClerkUserSyncInput(userData);

      await syncUserFromClerk(syncInput);

      return new Response("User created synced", { status: 200 });
    } else if (event.type === "user.deleted") {
      const userData = event.data;

      if (userData.id !== undefined) {
        await markUserDeletedFromClerkWebhook(userData.id);
      } else {
        return Response.json({ error: "Deletion Failure" }, { status: 400 });
      }
      return new Response("User Deleted", { status: 200 });
    } else if (event.type === "user.updated") {
      const userData = event.data;

      const syncInput = buildClerkUserSyncInput(userData);

      await syncUserFromClerk(syncInput);

      return new Response("User updated synced", { status: 200 });
    } else {
      return Response.json({ error: "Ignored Event" }, { status: 200 });
    }
  } catch (error) {
    console.error("Webhook processing failed:", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
