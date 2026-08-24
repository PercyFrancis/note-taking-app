export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export function isAllowedImageContentType(
  contentType: string,
): contentType is (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number] {
  return ALLOWED_IMAGE_CONTENT_TYPES.some(
    (allowedType) => allowedType === contentType,
  );
}

export function sanitizeImageFilename(filename: string): string {
  const sanitized = filename
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);

  return sanitized || "image";
}

export function createImageAltText(filename: string): string {
  const filenameWithoutExtension = filename.replace(/\.[^.]+$/, "");
  const readableName = filenameWithoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (readableName || "image").replace(/([\\\]])/g, "\\$1");
}

export function createPrivateImageUrl(pathname: string): string {
  const encodedPathname = pathname
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/api/attachments/files/${encodedPathname}`;
}
