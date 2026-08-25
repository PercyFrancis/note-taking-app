### This is a full-stack note taking app for learning React and Next.js.
- Notebooks consist of "cells" like jupyter notebook cells.
- The cells can contain Excalidraw drawings, legacy bitmap canvases, or markdown text.
  - You can drag and drop the cells.
- Authentication is implemented using Clerk.
- This app uses a PostgreSQL database for persistence.
  - Neon is the provider.

## Private Image Storage

Markdown-cell image uploads use a private Vercel Blob store. To enable them:

1. Open the Vercel project dashboard and go to **Storage**.
2. Create a Blob store and choose **Private** access.
3. Connect the store to this project and its development, preview, and production environments as appropriate.
4. Pull the generated environment variables locally with `vercel env pull`, or copy `BLOB_READ_WRITE_TOKEN` into `.env.local`.
5. Restart the development server after adding the token.

Do not commit the real Blob token. The placeholder in `.env.example` only documents the required variable.

The app accepts JPEG, PNG, WebP, and GIF images up to 10 MB. Uploads go directly from the browser to Vercel Blob using a short-lived token issued only after the app verifies that the signed-in user owns the target text cell. Private images are displayed through an authenticated app route.

Use **Image library** in the notebook toolbar to browse every image uploaded by the signed-in user. The library is sorted newest first and supports filename search, pagination, full-size previews, copying the authenticated URL or complete Markdown, and inserting an existing image into the selected text or Excalidraw cell. Text insertion uses the cell's last caret position. Excalidraw insertion places and selects a native image element near the current viewport center while reusing the existing authenticated URL, so it does not upload a duplicate. Images whose original upload cell no longer exists remain available and are labeled **Unattached**.

The authenticated URLs copied by the library are recoverable note references, not public sharing links. They only render when the image owner is signed in.

The library synchronizes Blob metadata into the `image_attachments` database table. Existing Blob uploads are indexed automatically when the library opens, including uploads whose original cell has been deleted. Blob listing currently synchronizes up to 20,000 objects per request and reports if that limit is reached.

Renaming an image changes only its display name; its pathname and authenticated URL remain stable, so existing Markdown and Excalidraw references keep working. Deleting an image first moves it to Trash without disabling its URL. Trashed images can be restored. After 30 days, unreferenced images are removed from Blob storage when the library next synchronizes. Referenced images remain protected, and manual permanent deletion reports the notebook cells that still use the image. JSON exports preserve image references but do not copy the files, and another user cannot access the original owner's private images.

## Mobile And Stylus Drawing

New drawing buttons create Excalidraw cells with selectable strokes, shapes, arrows, text, images, erasing, zoom, pan, undo/redo, and fullscreen editing. Paste, drop, or choose a JPEG, PNG, WebP, or GIF image up to 10 MB. Images are uploaded to the existing private Blob store and the scene saves only the authenticated URL, preventing base64 image payloads from accumulating in notebook data. These uploads also appear in the image library. Excalidraw scenes are stored as versioned JSON and remain compatible with notebook JSON import/export.

Existing bitmap drawings remain distinct **Legacy canvas cells** and continue using their original storage and editor. Turn on **Legacy canvas tools** in the notebook toolbar to reveal buttons for creating additional compatibility canvases; this preference is remembered in the browser. A future settings menu should replace this temporary toolbar preference as more application settings are added.

Legacy canvas cells accept mouse and pen input automatically. Finger drags scroll the notebook by default; enable **Touch drawing** in the notebook toolbar to use a finger as the pen across every legacy canvas cell. The touch preference is remembered in that browser. The canvas owns its pointer gestures so iPadOS cannot convert a downward Apple Pencil stroke into page scrolling; when touch drawing is off, finger movement is forwarded to the notebook scroller instead.

Supported pens use pressure-sensitive pen and eraser widths and coalesced pointer samples when the browser supplies them. Each completed stroke is encoded asynchronously and saved once, keeping rapid follow-up strokes responsive. Palm and additional touch pointers are ignored while an accepted stroke is active.
