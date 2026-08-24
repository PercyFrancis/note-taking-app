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

The first version stores the authenticated image URL directly in Markdown. Removing the Markdown or deleting its cell does not delete the underlying Blob yet. JSON exports preserve image references but do not copy the files, and another user cannot access the original owner's private images.
