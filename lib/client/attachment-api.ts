import { isUploadedImagesResponse } from "@/lib/notebook-validation";
import type { UploadedImagesResponse } from "@/lib/types";

export async function loadUploadedImages(): Promise<UploadedImagesResponse> {
  const response = await fetch("/api/attachments/images");

  if (!response.ok) {
    throw new Error("Failed to load uploaded images");
  }

  const data: unknown = await response.json();

  if (!isUploadedImagesResponse(data)) {
    throw new Error("Invalid uploaded images response");
  }

  return data;
}
