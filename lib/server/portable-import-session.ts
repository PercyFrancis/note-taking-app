import { createHmac, timingSafeEqual } from "node:crypto";
import { isUuid } from "../utils";

const SESSION_LIFETIME_MS = 30 * 60 * 1000;

interface SessionClaims {
  sessionId: string;
  appUserId: string;
  clerkUserId: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new Error("Image storage is not configured");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createPortableImportSession(
  appUserId: string,
  clerkUserId: string,
) {
  const claims: SessionClaims = {
    sessionId: crypto.randomUUID(),
    appUserId,
    clerkUserId,
    expiresAt: Date.now() + SESSION_LIFETIME_MS,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return {
    sessionId: claims.sessionId,
    expiresAt: claims.expiresAt,
    token: `${payload}.${signature(payload)}`,
  };
}

export function verifyPortableImportSession(
  token: string,
  expected: {
    sessionId: string;
    appUserId: string;
    clerkUserId: string;
  },
): SessionClaims {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra)
    throw new Error("Invalid session");
  const expectedSignature = signature(payload);
  const suppliedBytes = Buffer.from(suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new Error("Invalid session");
  }

  const value: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString(),
  );
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid session");
  const claims = value as Partial<SessionClaims>;
  if (
    !claims.sessionId ||
    !isUuid(claims.sessionId) ||
    claims.sessionId !== expected.sessionId ||
    claims.appUserId !== expected.appUserId ||
    claims.clerkUserId !== expected.clerkUserId ||
    typeof claims.expiresAt !== "number" ||
    claims.expiresAt < Date.now()
  ) {
    throw new Error("Invalid or expired session");
  }
  return claims as SessionClaims;
}

export function portableImportPathPrefix(
  clerkUserId: string,
  sessionId: string,
  attachmentId?: string,
) {
  const base = `users/${clerkUserId}/images/import-${sessionId}/`;
  return attachmentId ? `${base}${attachmentId}/` : base;
}
