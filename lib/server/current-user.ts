export const DEVELOPMENT_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function getCurrentUserId(): Promise<string> {
  return DEVELOPMENT_USER_ID;
}
