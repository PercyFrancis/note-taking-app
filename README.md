### This is a full-stack note taking app for learning React and Next.js.
- Notebooks consist of "cells" like jupyter notebook cells.
- The cells can contain Excalidraw drawings, legacy bitmap canvases, or markdown text.
  - You can drag and drop the cells.
- Authentication is implemented using Clerk.
- This app uses a PostgreSQL database for persistence.
  - Neon is the provider.

## Notebook Folders And Trash

Notebooks use a filesystem-style organization model. Each notebook is stored either at the workspace root (**Unfiled**) or in one nested folder. The sidebar provides **All notes**, **Unfiled**, and **Trash** virtual locations alongside an expandable folder tree. Use a notebook or folder's drag handle to move it, or right-click it (or select its **…** button) and choose **Move to…** to open the searchable folder picker. Dropping a notebook between notebook rows reorders it, hovering over a collapsed folder while dragging expands it, and circular folder moves are rejected. The editor breadcrumb shows the active notebook's folder path.

Notebook action menus can export one notebook and import another export beside it. Folder action menus can export the complete nested subtree or recreate an exported notebook/folder beneath that folder. Right-click **Unfiled** to import at the workspace root. Scoped exports use the validated version 2 JSON format, preserve Excalidraw and legacy cells, regenerate database IDs during import, and have a 25 MB client-side import limit.

The same menus also provide **Export portable ZIP** and **Import portable ZIP…**. A portable archive contains a versioned manifest, the scoped workspace JSON, and deduplicated copies of every private image referenced by Markdown or Excalidraw. On import, the app verifies every image hash, uploads the images into the importing user's private Blob storage, rewrites the stored references, and creates the notebooks, cells, and attachment index records transactionally. External/public image URLs are left unchanged. Portable archives allow moving image-backed notes between users or deployments; regular JSON remains the smaller choice when all referenced private images will remain in the same account.

Portable archives allow JPEG, PNG, WebP, and GIF files up to 10 MB each and up to 100 MB of uncompressed archive content. Export stops and lists any private images that cannot be retrieved. Import uses a signed 30-minute staging session, removes uploads when finalization fails, and removes abandoned staging files during later image-library synchronization. ZIP files contain unencrypted image copies, so the export action displays a privacy warning before downloading.

Deleting a notebook moves it to Trash. Deleting a folder moves its entire folder subtree and every contained notebook to Trash while preserving the hierarchy. Restoring the top-level trashed item restores its original path and contents. Permanent deletion is a separate confirmed action. Folder names reject path separators, control characters, `.` and `..`, matching filesystem-safe naming behavior while notebook titles remain free-form.

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

Renaming an image changes only its display name; its pathname and authenticated URL remain stable, so existing Markdown and Excalidraw references keep working. Deleting an image first moves it to Trash without disabling its URL. Trashed images can be restored. After 30 days, unreferenced images are removed from Blob storage when the library next synchronizes. Referenced images remain protected, and manual permanent deletion reports the notebook cells that still use the image. Lightweight JSON exports preserve image references but do not copy the files, and another user cannot access the original owner's private images; use a portable ZIP when the recipient must receive those images too.

## Appearance And Settings

Open **Settings** from the gear beside the account menu. The original slate-and-white design remains the default theme. Appearance also supports **System**, **Light**, and **Dark** modes plus Blue, Violet, Emerald, Rose, and Amber accents. System mode follows the operating-system preference and updates while the app is open. The last browser preference is applied before the interface renders to avoid a bright theme flash.

Settings are saved immediately in the browser, then synchronized to the signed-in account after 400 ms without another change. If account synchronization fails, the browser copy remains active and the dialog reports the failure. Existing browser-local touch-drawing and legacy-canvas preferences are migrated the first time the settings system loads.

The settings dialog also contains the legacy canvas and touch-drawing switches, a guide to currently implemented keyboard shortcuts, and an explanation of JSON exports, portable ZIP exports, and the image library.

## Mobile And Stylus Drawing

New drawing buttons create Excalidraw cells with selectable strokes, shapes, arrows, text, images, erasing, zoom, pan, undo/redo, and fullscreen editing. Paste, drop, or choose a JPEG, PNG, WebP, or GIF image up to 10 MB. Images are uploaded to the existing private Blob store and the scene saves only the authenticated URL, preventing base64 image payloads from accumulating in notebook data. These uploads also appear in the image library. Excalidraw scenes are stored as versioned JSON and remain compatible with notebook JSON import/export. Export waits for pending scene changes and image uploads, while import preserves the Excalidraw cell type and rejects malformed scene envelopes.

Each Excalidraw cell also restores its last pan position, zoom, grid enabled state, grid size/step, and background color. Content edits settle for 200 ms before scene serialization, while view-only changes settle for 650 ms. Either category is forced to flush after at most two seconds of continuous activity. The cell then uses a 200 ms network queue, producing normal database-save times of roughly 400 ms for content and 850 ms for view-only changes. Pending state flushes when leaving the cell, toggling fullscreen, hiding or closing the page, copying the cell, or deleting it. Temporary selections, dialogs, and editing handles are not persisted.

Existing bitmap drawings remain distinct **Legacy canvas cells** and continue using their original storage and editor. Turn on **Legacy canvas tools** under **Settings → Editor** to reveal buttons for creating additional compatibility canvases.

Legacy canvas cells accept mouse and pen input automatically. Finger drags scroll the notebook by default; enable **Touch drawing** under **Settings → Editor** to use a finger as the pen across every legacy canvas cell. The canvas owns its pointer gestures so iPadOS cannot convert a downward Apple Pencil stroke into page scrolling; when touch drawing is off, finger movement is forwarded to the notebook scroller instead.

Supported pens use pressure-sensitive pen and eraser widths and coalesced pointer samples when the browser supplies them. Each completed stroke is encoded asynchronously and saved once, keeping rapid follow-up strokes responsive. Palm and additional touch pointers are ignored while an accepted stroke is active.
