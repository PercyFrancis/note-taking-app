import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PDF_MAX_PAGES,
  DEFAULT_PDF_MAX_UPLOAD_BYTES,
  getPdfLimits,
  sanitizePdfFilename,
} from "../lib/pdf.ts";

test("PDF filename sanitization prevents path traversal", () => {
  assert.equal(
    sanitizePdfFilename("../course/notes.pdf"),
    ".-course-notes.pdf",
  );
  assert.equal(sanitizePdfFilename("lecture"), "lecture.pdf");
});

test("PDF limits support defaults and an explicit unlimited value", () => {
  const previousBytes = process.env.PDF_MAX_UPLOAD_BYTES;
  const previousPages = process.env.PDF_MAX_PAGES;
  try {
    delete process.env.PDF_MAX_UPLOAD_BYTES;
    delete process.env.PDF_MAX_PAGES;
    assert.deepEqual(getPdfLimits(), {
      maximumSizeInBytes: DEFAULT_PDF_MAX_UPLOAD_BYTES,
      maximumPages: DEFAULT_PDF_MAX_PAGES,
    });

    process.env.PDF_MAX_UPLOAD_BYTES = "unlimited";
    process.env.PDF_MAX_PAGES = "unlimited";
    assert.deepEqual(getPdfLimits(), {
      maximumSizeInBytes: null,
      maximumPages: null,
    });
  } finally {
    if (previousBytes === undefined) delete process.env.PDF_MAX_UPLOAD_BYTES;
    else process.env.PDF_MAX_UPLOAD_BYTES = previousBytes;
    if (previousPages === undefined) delete process.env.PDF_MAX_PAGES;
    else process.env.PDF_MAX_PAGES = previousPages;
  }
});
