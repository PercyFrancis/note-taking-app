export const PDF_CONTENT_TYPE = "application/pdf";
export const DEFAULT_PDF_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const DEFAULT_PDF_MAX_PAGES = 200;
export const DEFAULT_GUEST_PDF_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const DEFAULT_GUEST_PDF_MAX_PAGES = 200;

function readLimit(value: string | undefined, fallback: number): number | null {
  if (value?.trim().toLowerCase() === "unlimited") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPdfLimits() {
  return {
    maximumSizeInBytes: readLimit(
      process.env.PDF_MAX_UPLOAD_BYTES,
      DEFAULT_PDF_MAX_UPLOAD_BYTES,
    ),
    maximumPages: readLimit(process.env.PDF_MAX_PAGES, DEFAULT_PDF_MAX_PAGES),
  };
}

export function getGuestPdfLimits() {
  return {
    maximumSizeInBytes: readLimit(
      process.env.NEXT_PUBLIC_GUEST_PDF_MAX_UPLOAD_BYTES,
      DEFAULT_GUEST_PDF_MAX_UPLOAD_BYTES,
    ),
    maximumPages: readLimit(
      process.env.NEXT_PUBLIC_GUEST_PDF_MAX_PAGES,
      DEFAULT_GUEST_PDF_MAX_PAGES,
    ),
  };
}

export function sanitizePdfFilename(filename: string): string {
  const withoutControls = Array.from(filename, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? "-" : character;
  }).join("");
  const safe = withoutControls
    .normalize("NFKC")
    .replace(/[\\/]+/g, "-")
    .replace(/\.\.+/g, ".")
    .trim()
    .slice(0, 160);
  return safe.toLowerCase().endsWith(".pdf")
    ? safe
    : `${safe || "document"}.pdf`;
}

export function getPdfAnnotationPlacement({
  bounds: [x1, y1, x2, y2],
  scrollX,
  scrollY,
  zoom,
  pageHeight,
}: {
  bounds: readonly [number, number, number, number];
  scrollX: number;
  scrollY: number;
  zoom: number;
  pageHeight: number;
}) {
  const safeZoom = Math.max(0.01, zoom);
  const width = (x2 - x1) * safeZoom;
  const height = (y2 - y1) * safeZoom;
  const viewportY = (y1 + scrollY) * safeZoom;
  return {
    x: (x1 + scrollX) * safeZoom,
    y: pageHeight - viewportY - height,
    width,
    height,
  };
}

export interface PdfDocumentRecord {
  id: string;
  title: string;
  originalFilename: string;
  pathname: string | null;
  sizeBytes: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface PdfAnnotationRecord {
  pageNumber: number;
  scene: string;
  revision: number;
  updatedAt: number;
}
