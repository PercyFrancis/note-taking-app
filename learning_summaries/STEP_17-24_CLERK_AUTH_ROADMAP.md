# Step 17-24 Roadmap - Clerk Authentication

This roadmap is for adding Clerk authentication to the notebook app while preserving the existing database-backed notebook and cell system.

The app already has a useful boundary:

```text
API route
  -> getCurrentUserId()
    -> repository function
      -> Neon Postgres
```

Right now, `getCurrentUserId()` returns a hard-coded development user. Step 24 should replace that hard-coded user with the signed-in Clerk user.

## Current App State

Important current facts:

```text
@clerk/nextjs is not installed yet.
The users table already exists.
The users table already has clerk_user_id.
Most API routes already call getCurrentUserId().
Repository functions already scope data by user_id.
app/layout.tsx does not yet use ClerkProvider.
There is no proxy.ts yet.
```

The current `users` table is already close to what Clerk needs:

```sql
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique,
  email text,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

The important distinction is:

```text
Clerk user ID: external auth provider ID, such as user_...
Internal user ID: your database UUID from users.id
```

The app should keep using the internal UUID as `notebooks.user_id`.

## Recommended Design

Use Clerk for authentication and keep your own `users` table for app ownership.

Recommended mapping:

```text
Clerk authenticated user
  -> Clerk userId
    -> users.clerk_user_id
      -> users.id
        -> notebooks.user_id
```

The repository should continue receiving:

```ts
userId: string
```

where `userId` means:

```text
internal database users.id
```

not:

```text
Clerk user_...
```

This avoids rewriting every notebook and cell query.

## Why Not Store Clerk IDs Directly Everywhere?

You could store Clerk IDs directly in `notebooks.user_id`, but your schema already uses UUID foreign keys:

```sql
user_id uuid not null references users(id)
```

Keeping that structure is cleaner because:

```text
database relationships stay normal
foreign keys still work
notebooks still belong to users.id
Clerk remains an auth provider, not the whole app data model
future user metadata can live in users
```

So the better plan is:

```text
Clerk identifies the signed-in person.
Your users table identifies the app owner row.
Repository functions use the app owner row.
```

## Checkpoint A - Install Clerk

Goal:

```text
Add Clerk's Next.js SDK and environment variables.
```

Expected tasks:

```text
install @clerk/nextjs
add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
add CLERK_SECRET_KEY
update .env.example with placeholder names
do not commit real secret values
```

Useful command:

```bash
pnpm add @clerk/nextjs
```

Files likely touched:

```text
package.json
pnpm-lock.yaml
.env.example
.env.local
```

Verification:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

You may not be able to fully build if required Clerk env vars are missing locally.

## Checkpoint B - Add ClerkProvider

Goal:

```text
Make Clerk context available to the app.
```

This belongs in:

```text
app/layout.tsx
```

Clerk's provider should wrap the app body content:

```tsx
<ClerkProvider>
  {children}
</ClerkProvider>
```

For a first version, keep the UI minimal. A `UserButton` can eventually live in the app layout or sidebar.

Useful Clerk components:

```text
ClerkProvider
SignedIn
SignedOut
SignInButton
SignUpButton
UserButton
```

Design recommendation:

```text
Avoid building a big auth landing page.
Keep the notebook app as the main experience.
Show sign-in/sign-up controls only when needed.
```

Files likely touched:

```text
app/layout.tsx
possibly components/notebook/NotebookSidebar.tsx
```

Verification:

```text
App still renders.
Signed-out state shows sign-in/sign-up entry points.
Signed-in state shows user/account control.
```

## Checkpoint C - Add proxy.ts

Goal:

```text
Enable Clerk middleware integration and route protection.
```

Because this project uses Next.js 16, Clerk's current docs use:

```text
proxy.ts
```

not:

```text
middleware.ts
```

The proxy file belongs at the project root:

```text
note-taking-app/proxy.ts
```

The proxy is where route protection rules live.

For this app, there are two reasonable early options:

```text
Option A: protect all app and API routes immediately.
Option B: leave the homepage public but protect API routes and app data.
```

Recommended for this project:

```text
Protect the app and API routes.
```

Reason:

```text
The notebook UI depends on authenticated database data.
The API routes should not expose dev-user data to signed-out requests.
```

Future caveat:

```text
If you add Clerk webhooks later, the webhook route must be public.
```

Webhook requests come from Clerk, not from a signed-in browser session.

## Checkpoint D - Replace The Development User Boundary

Goal:

```text
Stop returning DEVELOPMENT_USER_ID for normal authenticated requests.
```

Main file:

```text
lib/server/current-user.ts
```

Current shape:

```ts
export const DEVELOPMENT_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function getCurrentUserId(): Promise<string> {
  return DEVELOPMENT_USER_ID;
}
```

Target concept:

```text
read Clerk auth
get Clerk userId
find or create matching row in users
return users.id
```

Important behavior:

```text
If there is no signed-in Clerk user, do not fall back to the dev user.
Return unauthorized or throw a controlled auth error.
```

Why this file is the right boundary:

```text
API routes already call getCurrentUserId().
Repository functions already receive userId.
Changing this helper upgrades many routes at once.
```

## Checkpoint E - Add A User Repository Helper

Goal:

```text
Find or create the internal database user for a Clerk user.
```

Possible file:

```text
lib/server/user-repository.ts
```

Useful helper concept:

```ts
getOrCreateUserForClerkUser(...)
```

Inputs may include:

```text
clerkUserId
email
name
```

Output should be:

```text
users.id
```

The database logic should be idempotent:

```text
If user exists, return it.
If user does not exist, insert it.
If another request inserts it first, still return the existing row.
```

This is usually handled with:

```sql
insert ...
on conflict (clerk_user_id) do update ...
returning id
```

or:

```sql
insert ...
on conflict (clerk_user_id) do nothing
```

followed by a select.

For learning, either pattern is acceptable.

## Checkpoint F - Decide How Much Clerk User Data To Fetch

There are two common approaches:

```text
1. Use auth() only.
2. Use currentUser() when you need email/name.
```

`auth()` is better for frequent route protection because it gives you authentication state and the Clerk user ID.

`currentUser()` gives richer user data, such as email/name, but Clerk documents that it uses a backend API request and can count against rate limits.

Recommended early approach:

```text
Use auth() for userId.
Only use currentUser() if you want to store email/name immediately.
```

If you want a simple first version, your database user can be created with:

```text
clerk_user_id only
```

and you can add email/name syncing later.

## Checkpoint G - Protect The API Routes

Goal:

```text
Signed-out users cannot load, create, update, delete, or reorder notebooks.
```

Most routes already call:

```ts
const userId = await getCurrentUserId();
```

So once that helper requires Clerk auth, the API routes become protected at the data layer.

The proxy should also protect API routes at the request layer.

Two layers are useful:

```text
proxy.ts blocks obvious signed-out requests early
getCurrentUserId protects server logic even if route structure changes later
```

Expected behavior:

```text
Signed-out API request -> unauthorized/redirect behavior
Signed-in API request -> uses that user's database UUID
```

## Checkpoint H - User Isolation Test

Goal:

```text
Confirm each Clerk account sees only its own notebooks.
```

Manual test:

```text
Sign in as user A.
Create notebook A1.
Sign out.
Sign in as user B.
Confirm A1 is not visible.
Create notebook B1.
Sign out.
Sign back in as user A.
Confirm A1 is visible and B1 is not.
```

This validates:

```text
Clerk auth is working.
getCurrentUserId maps to the right users.id.
Repository user_id filters are working.
Data is isolated per user.
```

## Checkpoint I - Remove Or Quarantine Dev User Fallback

The development user was useful before auth:

```text
00000000-0000-0000-0000-000000000001
```

After Clerk is active, it becomes dangerous if production can silently fall back to it.

Recommended rule:

```text
No dev-user fallback in production.
```

If you want to keep a local fallback temporarily, guard it very explicitly:

```text
only in development
only when a specific env var enables it
never by default
```

Example concept:

```text
ALLOW_DEVELOPMENT_USER=true
```

Do not add that fallback unless you have a clear reason. The cleaner learning path is to require sign-in.

## Checkpoint J - Defer Webhooks

Clerk webhooks can sync user-created, user-updated, and user-deleted events into your database.

Do not start there unless you need it immediately.

Reasons to defer:

```text
local webhook testing needs a tunnel such as ngrok
webhooks are eventually consistent
webhook verification adds extra moving parts
lazy user creation is enough for this app's first auth version
```

Use webhooks later if you want:

```text
keep email/name/avatar synced
handle deleted Clerk users
support social/user-visible features
build admin views
```

## How This Affects Steps 22 And 23

You wanted to look at Clerk before cleaning up data persistence issues.

That makes sense because auth changes the meaning of persistence:

```text
Before auth:
all data belongs to the dev user

After auth:
data belongs to the signed-in Clerk user
```

Steps 22 and 23 should happen after the auth boundary is clearer, because import/export, title persistence, and other save fixes should target the real signed-in user's data.

## Files To Expect

Likely changed or created files:

```text
package.json
pnpm-lock.yaml
.env.example
app/layout.tsx
proxy.ts
lib/server/current-user.ts
lib/server/user-repository.ts
possibly app/page.tsx
possibly components/notebook/NotebookSidebar.tsx
```

Files that should mostly stay stable:

```text
lib/server/notebook-repository.ts
app/api/notebooks/... routes
app/api/cells/... routes
```

Those already accept an internal `userId`, which is the boundary you want to preserve.

## Common Mistakes To Avoid

Avoid mixing Clerk IDs and internal UUIDs:

```text
Do not pass Clerk user_... IDs into repository functions that expect users.id UUIDs.
```

Avoid trusting client state for ownership:

```text
Do not send user IDs from the browser to the API.
```

Avoid fallback auth:

```text
Do not silently use the dev user when no Clerk user is signed in.
```

Avoid overusing `currentUser()`:

```text
Use it only when you need rich user data in server code.
```

Avoid making webhook routes protected:

```text
Webhook routes must be public because Clerk calls them without a user session.
```

## Useful Resources

Official Clerk resources:

```text
Next.js quickstart:
https://clerk.com/docs/nextjs/getting-started/quickstart

clerkMiddleware / proxy reference:
https://clerk.com/docs/reference/nextjs/clerk-middleware

auth() reference:
https://clerk.com/docs/reference/nextjs/app-router/auth

currentUser() reference:
https://clerk.com/docs/reference/nextjs/app-router/current-user

Webhook syncing guide:
https://clerk.com/docs/guides/development/webhooks/syncing
```

Useful local files:

```text
lib/server/current-user.ts
db/migrations/001_create_users.sql
app/layout.tsx
app/api/notebooks/route.ts
app/api/notebooks/[notebookId]/route.ts
app/api/cells/[cellId]/route.ts
lib/server/notebook-repository.ts
```

## Suggested Prompt Sequence

Use these as checkpoints:

```text
Look at Step 24 Checkpoint A: installing Clerk and env vars.
Can you verify Checkpoint A?

Look at Step 24 Checkpoint B: ClerkProvider.
Can you verify Checkpoint B?

Look at Step 24 Checkpoint C: proxy.ts route protection.
Can you verify Checkpoint C?

Look at Step 24 Checkpoint D/E: replacing getCurrentUserId and creating users.
Can you verify Checkpoint D/E?

Look at Step 24 Checkpoint H: testing user isolation.
Can you verify the auth flow end to end?
```

## Final Goal

Step 24 is complete when:

```text
users must sign in before using the app
API routes use the signed-in Clerk user
each Clerk user maps to one row in users
notebooks and cells are scoped to that internal users.id
user A cannot see user B's notebooks
dev-user fallback is removed or safely quarantined
pnpm check passes
pnpm exec tsc --noEmit passes
pnpm build passes
```
