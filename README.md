### This is a full-stack note taking app for learning React and Next.js.
- Notebooks consist of "cells" like jupyter notebook cells.
- The cells can contain drawings or markdown text.
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

Use **Image library** in the notebook toolbar to browse every image uploaded by the signed-in user. The library is sorted newest first and supports filename search, pagination, full-size previews, copying the authenticated URL or complete Markdown, and inserting an existing image at the selected text cell's last caret position. Images whose original upload cell no longer exists remain available and are labeled **Unattached**.

The authenticated URLs copied by the library are recoverable note references, not public sharing links. They only render when the image owner is signed in.

The library lists Blob metadata directly and does not require an attachments database table. It loads up to 20,000 images; if an account grows beyond that, the UI reports the limit and a database-backed attachment index should be added.

Removing Markdown or deleting its cell does not delete the underlying Blob. The image library deliberately does not provide permanent deletion yet because an image may still be referenced by another cell, an export, or redo history. JSON exports preserve image references but do not copy the files, and another user cannot access the original owner's private images.

## Mobile And Stylus Drawing

Drawing cells accept mouse and pen input automatically. Finger drags scroll the notebook by default; enable **Touch drawing** in the notebook toolbar to use a finger as the pen across every drawing cell. The touch preference is remembered in that browser. The canvas owns its pointer gestures so iPadOS cannot convert a downward Apple Pencil stroke into page scrolling; when touch drawing is off, finger movement is forwarded to the notebook scroller instead.

Supported pens use pressure-sensitive pen and eraser widths and coalesced pointer samples when the browser supplies them. Each completed stroke is encoded asynchronously and saved once, keeping rapid follow-up strokes responsive. Palm and additional touch pointers are ignored while an accepted stroke is active.
