# Step 24 Guide - Clerk Webhooks

This guide explains what webhooks are, how they fit into the current Clerk auth implementation, and how to implement them later in the note-taking app.

The key idea is:

```text
Current auth flow gives immediate access.
Webhooks keep local database data synced over time.
```

## Official Resources

Useful Clerk docs:

- Clerk webhooks overview: https://clerk.com/docs/guides/development/webhooks/overview
- Sync Clerk data with webhooks: https://clerk.com/docs/guides/development/webhooks/syncing
- Clerk middleware route protection: https://clerk.com/docs/reference/nextjs/clerk-middleware

The syncing guide was last checked on July 1, 2026.

## What A Webhook Is

A webhook is an event-driven HTTP request from one service to another.

Normal API flow:

```text
Your app asks Clerk for data.
```

Webhook flow:

```text
Something happens in Clerk.
Clerk sends your app a POST request.
Your app reacts to the event.
```

For example:

```text
Clerk user created
  -> Clerk sends POST /api/webhooks/clerk
    -> app verifies request
      -> app updates users table
```

Webhooks are asynchronous. They usually happen quickly, but they are not guaranteed to happen before the user reaches your app.

That matters for this project.

## Why Webhooks Should Not Replace Lazy User Creation

The app already has this reliable path:

```text
API route
  -> getCurrentUserId()
    -> Clerk auth()
      -> findOrCreateUserIdByClerkUserId()
        -> users.id
```

Keep this flow.

It is strongly consistent for normal app requests because the user row is created when the signed-in user actually uses the app.

Do not depend only on `user.created` webhooks to create users, because:

- webhook delivery can be delayed
- webhook delivery can fail and be retried
- the user might sign in and reach the app before the webhook finishes

Recommended design:

```text
Lazy creation in getCurrentUserId()
  -> required for normal app correctness

Clerk webhooks
  -> optional sync layer for profile updates, deletion state, and future features
```

## Best Uses For Clerk Webhooks In This App

### 1. `user.created`

Use this to create or upsert a row in `users` when Clerk creates a new user.

This is useful, but not strictly required because the app already lazily creates users.

Possible database update:

```text
clerk_user_id
email
name
```

### 2. `user.updated`

Use this to keep local profile fields in sync.

Examples:

```text
email changed
name changed
profile image changed
```

This only matters if the app stores and displays local user profile data.

For the current note-taking app, this is optional because notebooks only need `users.id`.

### 3. `user.deleted`

Use this to decide what happens when a Clerk user is deleted.

Options:

```text
soft-delete the local user
mark the user as deleted
anonymize the user
delete the user's notebooks
do nothing immediately but log the event
```

Do not automatically delete notebooks unless you are certain that is the desired product behavior.

For a learning project, a soft-delete flag is usually safer than immediate destructive deletion.

### 4. Future Billing Webhooks

Clerk also supports billing-related webhook events.

These could be useful later for:

```text
free versus paid notebook limits
storage limits
premium export features
collaboration features
```

Do not implement billing webhooks until the app has a clear paid feature.

### 5. Future Organization Webhooks

If the app later supports team notebooks, organization events could be useful.

Examples:

```text
organization created
organization membership created
organization membership deleted
```

These are not needed for the current personal note-taking app.

## Current App State

Relevant current files:

```text
proxy.ts
lib/server/current-user.ts
lib/server/user-repository.ts
db/migrations/001_create_users.sql
app/api/*
```

Current user table:

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

Current auth mapping:

```text
Clerk user id
  -> users.clerk_user_id
    -> users.id
      -> notebooks.user_id
```

The webhook should respect this same mapping.

## Implementation Roadmap

### Checkpoint 1 - Decide The First Webhook Scope

Start small.

Recommended first scope:

```text
Handle user.created.
Optionally handle user.updated.
Do not delete notebook data on user.deleted yet.
```

For the current schema, the practical first version can sync:

```text
clerk_user_id
email
name
```

If you want profile images later, add a database column such as:

```text
image_url text
```

If you want safe deletion handling later, add a column such as:

```text
deleted_at timestamptz
```

You do not need these extra columns for the first webhook checkpoint.

### Checkpoint 2 - Add The Webhook Secret

Clerk webhook verification needs a signing secret.

Add this to `.env.example`:

```text
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

Add the real value to `.env.local`.

For Vercel, add the real value in:

```text
Project Settings
  -> Environment Variables
    -> Production
```

After changing Vercel environment variables, redeploy.

### Checkpoint 3 - Create A Clerk Webhook Endpoint In The Dashboard

In the Clerk Dashboard:

```text
Webhooks
  -> Add Endpoint
```

For local testing with ngrok, use a URL like:

```text
https://your-ngrok-domain.ngrok-free.app/api/webhooks/clerk
```

For production, use:

```text
https://note-taking-app-mu-bice.vercel.app/api/webhooks/clerk
```

Subscribe to the first event:

```text
user.created
```

Later, add:

```text
user.updated
user.deleted
```

Copy the endpoint signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

### Checkpoint 4 - Make The Webhook Route Public

The current `proxy.ts` protects:

```text
/api/*
```

A Clerk webhook route cannot require a signed-in browser user because Clerk sends it server-to-server.

So this route must be public:

```text
/api/webhooks/clerk
```

The route is still protected by webhook signature verification.

Conceptual route protection logic:

```text
if request is /api/webhooks/clerk:
  do not require Clerk browser auth

else if request is /api/*:
  require Clerk browser auth
```

The security model becomes:

```text
normal app APIs -> protected by Clerk session auth
webhook API     -> protected by signed webhook verification
```

Do not skip signature verification just because the route is public.

### Checkpoint 5 - Create The Route Handler

Recommended file:

```text
app/api/webhooks/clerk/route.ts
```

The route should:

```text
accept POST requests
verify the webhook signature
inspect evt.type
call the correct repository helper
return 2xx only after successful processing
return 400 for invalid signatures or bad payloads
```

Clerk's current Next.js docs use:

```ts
import { verifyWebhook } from "@clerk/nextjs/webhooks";
```

Conceptual route flow:

```text
POST /api/webhooks/clerk
  -> verifyWebhook(request)
    -> evt.type
      -> user.created
      -> user.updated
      -> user.deleted
```

The route should not call:

```text
getCurrentUserId()
```

because there is no signed-in browser session on a webhook request.

### Checkpoint 6 - Add Repository Helpers

Keep webhook database logic out of the route handler when it gets larger.

Possible helper names:

```text
syncUserFromClerkWebhook(...)
markUserDeletedFromClerkWebhook(...)
```

For `user.created` and `user.updated`, use an upsert.

Conceptual SQL:

```sql
insert into users (clerk_user_id, email, name)
values ($1, $2, $3)
on conflict (clerk_user_id) do update
set
  email = excluded.email,
  name = excluded.name,
  updated_at = now()
returning id;
```

This keeps the local `users` row updated if Clerk sends either a creation or update event.

### Checkpoint 7 - Extract Email And Name Carefully

Clerk user webhook payloads can contain multiple email addresses.

For this app, use the primary email if available.

Conceptual extraction:

```text
primary_email_address_id
  -> find matching item in email_addresses
    -> email_address
```

For name:

```text
first_name + last_name
```

Fallbacks:

```text
username
email
null
```

Keep this extraction in a small helper if it makes the route easier to read.

### Checkpoint 8 - Decide What To Do With `user.deleted`

Do not rush this one.

The main options are:

```text
Option A: do nothing except log it
Option B: set deleted_at on users
Option C: anonymize email/name
Option D: delete the user's notebooks and cells
```

Recommended early choice:

```text
Option A or B
```

Option D is destructive and should only be used if the app's data policy clearly says account deletion removes all note data.

If you want Option B, add a migration:

```sql
alter table users
add column if not exists deleted_at timestamptz;
```

Then `user.deleted` can do:

```sql
update users
set deleted_at = now(),
    updated_at = now()
where clerk_user_id = $1;
```

### Checkpoint 9 - Handle Return Codes Correctly

Webhook services use status codes to decide whether delivery succeeded.

Return:

```text
2xx -> event processed successfully
4xx/5xx -> event failed and may be retried
```

Examples:

```text
valid event, handled             -> 200
valid event, ignored intentionally -> 200
invalid signature                -> 400
temporary database failure       -> 500
```

If you return `200` before database work finishes, Clerk may think the event succeeded even though your database did not update.

### Checkpoint 10 - Test Locally

Local webhook testing needs a public URL that forwards to your local dev server.

Clerk's guide recommends ngrok.

Typical flow:

```text
start Next dev server on localhost:3000
start ngrok forwarding to port 3000
create Clerk webhook endpoint using the ngrok URL
send test event from Clerk Dashboard
watch local terminal logs
inspect local database
```

Example endpoint shape:

```text
https://your-ngrok-domain.ngrok-free.app/api/webhooks/clerk
```

### Checkpoint 11 - Test In Production

For production:

```text
create production Clerk webhook endpoint
use deployed Vercel URL
copy production webhook signing secret
add CLERK_WEBHOOK_SIGNING_SECRET to Vercel
redeploy
send test event from Clerk Dashboard
check Vercel function logs
check Neon database
```

Production endpoint:

```text
https://note-taking-app-mu-bice.vercel.app/api/webhooks/clerk
```

Remember:

```text
Vercel env var changes require redeployment.
```

### Checkpoint 12 - Verify With Real Events

After dashboard test events work, trigger real events:

```text
create a new Clerk user
update that user's name/email
delete a test user if safe
```

Verify:

```text
users row exists
email/name update as expected
no duplicate users are created
normal sign-in still works
notebook ownership still uses users.id
```

## Suggested First Implementation Plan For This App

Recommended first pass:

```text
1. Add CLERK_WEBHOOK_SIGNING_SECRET.
2. Add /api/webhooks/clerk public route exception.
3. Create app/api/webhooks/clerk/route.ts.
4. Verify webhook with verifyWebhook().
5. Handle user.created with an upsert into users.
6. Handle user.updated with the same upsert.
7. Ignore user.deleted with a 200 response for now, or log it.
8. Test with Clerk Dashboard.
9. Test by creating a real user.
10. Deploy and configure production webhook.
```

This gives useful sync behavior without changing the current auth flow.

## Example Event Handling Shape

Keep the route handler organized around `evt.type`.

Conceptual structure:

```ts
if (evt.type === "user.created") {
  // extract id, email, name
  // upsert users row
  // return 200
}

if (evt.type === "user.updated") {
  // extract id, email, name
  // update/upsert users row
  // return 200
}

if (evt.type === "user.deleted") {
  // decide later
  // return 200 if intentionally ignored
}

return new Response("Ignored event", { status: 200 });
```

Important:

```text
Ignoring an event intentionally should still return 200.
Failing to verify or failing to write required data should not return 200.
```

## Database Design Options

### Current Minimal Shape

Current table:

```text
id
clerk_user_id
email
name
created_at
updated_at
```

This is enough for:

```text
user.created
user.updated
basic profile sync
```

### Add Profile Image

If the sidebar or future sharing UI displays avatars:

```sql
alter table users
add column if not exists image_url text;
```

### Add Deleted State

If you want safe deletion handling:

```sql
alter table users
add column if not exists deleted_at timestamptz;
```

### Add Last Synced Time

If you want to debug sync behavior:

```sql
alter table users
add column if not exists clerk_synced_at timestamptz;
```

This can help answer:

```text
When did the app last receive a Clerk event for this user?
```

Do not add columns before you need them.

## Common Mistakes

### Mistake 1 - Protecting The Webhook Route With Browser Auth

Wrong:

```text
/api/webhooks/clerk requires signed-in user
```

Clerk's server-to-server webhook request has no browser session.

Correct:

```text
/api/webhooks/clerk is public in proxy.ts
request is verified with webhook signature
```

### Mistake 2 - Trusting The JSON Body Without Verification

Webhook payloads must be treated as untrusted until verified.

Always verify the signature before using the payload.

### Mistake 3 - Replacing Lazy User Creation

Do not remove `findOrCreateUserIdByClerkUserId()`.

Webhooks are not guaranteed to arrive before the user makes app requests.

### Mistake 4 - Returning 200 Too Early

Only return success after required database work has succeeded.

### Mistake 5 - Destructive User Deletion Too Soon

Do not immediately delete notebooks on `user.deleted` unless the product policy is clear.

For learning, prefer logging or soft deletion.

### Mistake 6 - Forgetting Vercel Redeploy

Adding `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel is not enough by itself.

Redeploy after changing environment variables.

## Relationship To Existing Auth

Existing request flow:

```text
browser API request
  -> Clerk session auth
    -> getCurrentUserId()
      -> users.id
```

Webhook flow:

```text
Clerk server event
  -> public webhook route
    -> verify webhook signature
      -> update users table
```

These are different entry points.

Do not call browser-session helpers from the webhook route.

## Useful Checkpoints To Ask For Review

Suggested prompts:

```text
Let's look at Clerk webhook checkpoint 1: deciding scope.
Can you verify my webhook env variables and dashboard endpoint plan?
Can you verify my proxy.ts public webhook exception?
Can you verify my webhook route handler before I add database writes?
Can you verify my user.created upsert helper?
Can you verify my user.updated handling?
Can you verify my local webhook test results?
Can you verify my production webhook setup?
```

## Final Success Criteria

Webhook work is complete when:

```text
CLERK_WEBHOOK_SIGNING_SECRET exists locally and in Vercel
/api/webhooks/clerk is public in proxy.ts
route handler verifies Clerk webhook signatures
user.created creates or updates users row
user.updated updates synced fields
user.deleted has an intentional policy
dashboard test event succeeds
real Clerk event succeeds
Vercel production endpoint succeeds
normal sign-in and notebook loading still work
pnpm check passes
pnpm exec tsc --noEmit passes
pnpm build passes
```

For this app, webhooks are a sync improvement, not a replacement for the existing Clerk auth boundary.
