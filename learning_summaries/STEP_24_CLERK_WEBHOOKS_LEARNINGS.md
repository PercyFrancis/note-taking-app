# Step 24 Learnings - Clerk Webhooks

This summary covers the Clerk webhook implementation for syncing Clerk user events into the app's Neon Postgres database.

The main goal was to keep local user profile/deletion state synced with Clerk while preserving the existing auth flow:

```text
Normal app request
  -> Clerk session
    -> getCurrentUserId()
      -> users.id

Webhook event
  -> Clerk server request
    -> verifyWebhook()
      -> sync users table
```

Webhooks are a sync layer. They do not replace `getCurrentUserId()` or lazy user creation.

## What Changed

Webhook work touched:

- `db/migrations/004_add_user_webhook_fields.sql`
- `.env.example`
- `.env.local`
- `proxy.ts`
- `app/api/webhooks/clerk/route.ts`
- `lib/server/user-repository.ts`
- `lib/types.ts`
- Vercel environment variables
- Clerk Dashboard webhook endpoint settings
- ngrok local webhook tunnel

The final webhook events handled are:

```text
user.created
user.updated
user.deleted
```

## Schema Changes

A new migration added webhook-related user fields:

```sql
alter table users
add column if not exists image_url text;

alter table users
add column if not exists deleted_at timestamptz;

alter table users
add column if not exists clerk_synced_at timestamptz;
```

The meaning of these fields is:

```text
image_url       -> synced Clerk profile image URL
deleted_at      -> soft-delete timestamp when Clerk user is deleted
clerk_synced_at -> last time Clerk webhook data updated the row
```

Because migration `004` has already been applied, future schema changes should use a new migration file such as `005_...sql`.

## Webhook Secret

Webhook verification uses:

```env
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

This is different from:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

The webhook signing secret comes from the specific Clerk webhook endpoint.

Important details:

- Local/ngrok endpoint and production endpoint can have different signing secrets.
- `.env.example` should contain only a placeholder.
- `.env.local` should contain the real development secret.
- Vercel should contain the real production secret.
- Restart `pnpm dev` after changing `.env.local`.
- Redeploy Vercel after changing Vercel environment variables.

## ngrok Setup

ngrok was used so Clerk could send webhook requests to the local Next.js dev server.

The local flow is:

```text
pnpm dev
  -> http://localhost:3000

ngrok http 3000
  -> https://some-ngrok-domain.ngrok-free.dev

Clerk webhook endpoint
  -> https://some-ngrok-domain.ngrok-free.dev/api/webhooks/clerk
```

The ngrok inspector runs at:

```text
http://localhost:4040
```

This helped reveal a configuration mistake: Clerk was initially sending:

```text
POST /
```

instead of:

```text
POST /api/webhooks/clerk
```

The fix was to include the full route path in the Clerk webhook endpoint URL.

## Public Webhook Route

The app protects normal API routes with Clerk session auth:

```text
/api/*
```

But webhook requests come from Clerk's server, not from a signed-in browser session.

So `proxy.ts` was updated to keep webhook routes public:

```text
/api/webhooks/*
```

The security model is:

```text
normal app APIs -> protected by Clerk browser session
webhook API     -> public route, protected by webhook signature verification
```

The webhook route should not call:

```ts
getCurrentUserId()
```

There is no browser session on a Clerk webhook request.

## Webhook Route

The webhook route lives at:

```text
app/api/webhooks/clerk/route.ts
```

It accepts:

```text
POST /api/webhooks/clerk
```

The route uses:

```ts
verifyWebhook(request)
```

from:

```ts
@clerk/nextjs/webhooks
```

The route has two phases:

```text
1. Verify the webhook request.
2. Process the verified event.
```

This matters because different failures should return different status codes.

## Status Codes

The route uses these response meanings:

```text
400 -> webhook verification failed
500 -> verified event, but database processing failed
200 -> event processed successfully or intentionally ignored
```

This distinction matters because webhook systems use response status codes to decide whether to retry.

Do not return `200` before important database writes finish.

That is why repository calls must be awaited:

```ts
await syncUserFromClerk(...)
await markUserDeletedFromClerkWebhook(...)
```

## Event Handling

The route handles:

```text
user.created -> sync user profile fields into users
user.updated -> sync user profile fields into users
user.deleted -> mark users.deleted_at
```

Unhandled valid events return `200` because they were intentionally ignored.

Verification has already succeeded by that point, so ignored valid events should not return `400`.

## Type Narrowing

`verifyWebhook()` returns a `WebhookEvent`.

The type for `event.data` depends on `event.type`.

For this app:

```text
user.created -> User webhook data
user.updated -> User webhook data
user.deleted -> deleted user data
```

A useful type was derived with:

```ts
type ClerkUserWebhookData = Extract<
  WebhookEvent,
  { type: "user.created" | "user.updated" }
>["data"];
```

This avoided a type mismatch that happened when importing `UserJSON` from `@clerk/nextjs/types`.

The important lesson:

```text
Use the same event-data type family returned by verifyWebhook().
```

Two types with the same name from different Clerk packages may not be compatible.

## Helper Functions

Several small helpers convert Clerk's webhook payload into the app's simpler sync input.

The repository expects:

```ts
interface ClerkUserSyncInput {
  clerkUserId: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}
```

### Primary Email

Clerk user data stores email objects in an array.

The field:

```text
primary_email_address_id
```

is not the email address. It points to one item in:

```text
email_addresses
```

The helper uses `.find()`:

```text
find the email object whose id matches primary_email_address_id
return email_address
fallback to first email
fallback to null
```

### Display Name

The display name helper combines:

```text
first_name
last_name
```

Then falls back to:

```text
username
email
null
```

This turns Clerk's multiple name fields into the app's single `users.name` column.

### Image URL

The image helper reads:

```text
image_url
```

and normalizes missing values to:

```text
null
```

### Build Sync Input

The final helper builds:

```text
clerkUserId
email
name
imageUrl
```

and passes that object to the repository.

## Repository Helpers

Webhook database logic lives in:

```text
lib/server/user-repository.ts
```

This keeps SQL out of the webhook route.

The route decides:

```text
which event happened
```

The repository decides:

```text
how to update the users table
```

## Sync User SQL

`syncUserFromClerk` handles both `user.created` and `user.updated`.

It uses an upsert:

```sql
insert into users (clerk_user_id, email, name, image_url)
values ($1, $2, $3, $4)
on conflict (clerk_user_id) do update
set
email = excluded.email,
name = excluded.name,
image_url = excluded.image_url,
updated_at = now(),
clerk_synced_at = now(),
deleted_at = null
```

The meaning is:

```text
if user is missing -> insert local row
if user exists    -> update local profile fields
```

`deleted_at = null` means a created/updated event treats the user as active again.

One lesson: TypeScript and Biome cannot verify SQL string column names. SQL strings must be tested against the database or through real webhook events.

## Deletion Policy

For `user.deleted`, the app uses soft deletion:

```sql
update users
set deleted_at = now(), updated_at = now(), clerk_synced_at = now()
where clerk_user_id = $1
```

This preserves notebooks and cells.

The app does not automatically delete user notes when Clerk sends `user.deleted`.

This is safer while the data policy is still evolving.

## Local Testing

Local testing used:

```text
pnpm dev
ngrok http 3000
Clerk Dashboard test events
ngrok inspector
Neon SQL editor
```

Useful ngrok inspector checks:

```text
method is POST
path is /api/webhooks/clerk
status is 200
response body says which branch ran
```

Useful database query:

```sql
select id, clerk_user_id, email, name, image_url, deleted_at, clerk_synced_at
from users
order by created_at desc
limit 20;
```

Do not filter only by `clerk_synced_at` during early testing, because inserted rows may not show exactly what is expected until the sync SQL is finalized.

## Testing Deletion

Generic `user.deleted` test events may use a fake Clerk user id that does not exist in the local database.

If the row does not exist, the delete update affects zero rows.

To test deletion properly:

```text
create a disposable Clerk user
confirm the user exists in users table
delete the user from Clerk Dashboard
confirm deleted_at is set
```

The delete action is done from:

```text
Clerk Dashboard -> Users -> selected test user -> Delete user
```

Use a throwaway user, not a main account.

## Production Testing

Production testing used:

```text
production Clerk environment
production webhook endpoint
production webhook signing secret
Vercel environment variables
Vercel redeploy
production Neon database
```

Production endpoint:

```text
https://note-taking-app-mu-bice.vercel.app/api/webhooks/clerk
```

Vercel needs:

```text
DATABASE_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
```

After changing Vercel env vars, redeploy.

## Vercel Logs

Vercel logs were used to check for runtime errors.

One log showed:

```text
@clerk/nextjs: Missing publishableKey
```

That means the deployment that produced the log did not have:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

available.

If the current site works, this can be an old deployment log. The important thing is to check whether the error is still happening on the latest production deployment.

## Common Mistakes Found

### Missing Webhook Path

Incorrect Clerk endpoint:

```text
https://ngrok-domain.ngrok-free.dev
```

Correct Clerk endpoint:

```text
https://ngrok-domain.ngrok-free.dev/api/webhooks/clerk
```

### Sign-In Buttons On ngrok

The ngrok page showed a Next dev warning about blocked cross-origin dev resources:

```text
Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr
```

This can affect the interactive ngrok page, but it is separate from webhook testing.

For webhook testing, Clerk only needs to reach:

```text
POST /api/webhooks/clerk
```

### Wrong Type Import

Using `UserJSON` from `@clerk/nextjs/types` caused a mismatch with the user payload returned by `verifyWebhook()`.

The fix was to derive the type from:

```text
WebhookEvent
```

### Not Awaiting Database Work

Webhook handlers should await database work before returning `200`.

Otherwise Clerk may think the webhook succeeded even if the database write fails afterward.

## Verification

The implementation was checked with:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

Runtime verification included:

```text
Clerk Dashboard delivery success
ngrok inspector requests
Neon database row updates
production Vercel endpoint
actual website usage
Vercel logs
```

## Final State

The webhook implementation is complete for the current app scope.

It now:

- accepts Clerk webhook events
- verifies Clerk signatures
- keeps webhook route public in session-auth terms
- syncs user profile fields
- soft-deletes local users
- preserves notebooks/cells on user deletion
- works locally through ngrok
- works in production on Vercel

Future improvements could include:

- Move webhook payload helpers into a separate file if `route.ts` grows.
- Add more explicit logging around event type and Clerk user id.
- Decide whether deleted users should be blocked from app access if they somehow still have sessions.
- Add stricter tests around webhook repository helpers.
- Add cleanup policy for users deleted in Clerk after a retention period.
