# Step 24 Learnings - Clerk Authentication

Step 24 added Clerk authentication to the database-backed notebook app.

The main goal was to stop using a hard-coded development user and make notebooks belong to the signed-in Clerk user.

The final auth flow is:

```text
Browser request
  -> Clerk session
    -> API route
      -> getCurrentUserId()
        -> Clerk auth()
          -> users.clerk_user_id
            -> users.id
              -> notebook and cell queries
```

## What Changed

Step 24 touched or added:

- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `app/layout.tsx`
- `app/page.tsx`
- `proxy.ts`
- `lib/server/current-user.ts`
- `lib/server/user-repository.ts`
- `db/migrations/001_create_users.sql`

The main features added were:

- Install Clerk's Next.js package.
- Add Clerk environment variable placeholders.
- Wrap the app in `ClerkProvider`.
- Add sign-in, sign-up, and user account controls.
- Protect API routes with Clerk middleware in `proxy.ts`.
- Gate `NotebookApp` so it only renders for signed-in users.
- Replace the development-user boundary with Clerk auth.
- Lazily create a database user row for new Clerk users.
- Keep using the app's internal `users.id` UUID for notebook ownership.
- Manually verify user isolation between Clerk accounts.

## Clerk Client Components And Server Helpers

Clerk has different imports for client-facing UI and server-side auth logic.

Client-facing components come from:

```ts
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
```

These are used in React UI files such as `app/layout.tsx` and `app/page.tsx`.

Server auth helpers come from:

```ts
import { auth } from "@clerk/nextjs/server";
```

This belongs in server-side code such as `lib/server/current-user.ts`.

The rule is:

```text
UI components/hooks -> @clerk/nextjs
server auth helpers -> @clerk/nextjs/server
```

## `Show` Instead Of `SignedIn` And `SignedOut`

In the installed Clerk version, `SignedIn` and `SignedOut` were not available from `@clerk/nextjs`.

The working pattern is:

```tsx
<Show when="signed-in">
  <NotebookApp />
</Show>

<Show when="signed-out">
  ...
</Show>
```

This is used to prevent signed-out users from mounting `NotebookApp`, which would otherwise try to call protected API routes.

## Route Protection

The current quick-fix route structure is:

```text
/        public
/api/*   protected
```

The proxy protects API routes:

```ts
const isProtectedRoute = createRouteMatcher(["/api(.*)"]);
```

This means signed-out users can visit `/`, but cannot load, create, update, delete, or reorder notebooks through the API.

The app also sets:

```tsx
<ClerkProvider afterSignOutUrl="/">
```

The important rule is:

```text
afterSignOutUrl must point to a public route.
```

This fixed the sign-out issue where Clerk cleared the session and then tried to navigate to a route that required authentication.

## The Auth Boundary

Before this step, the app had a useful boundary:

```ts
getCurrentUserId()
```

API routes already called this helper before repository functions.

That made it possible to change auth behavior in one central place instead of rewriting every API route.

The helper now does:

```text
read Clerk auth state
require a signed-in Clerk user
map Clerk user id to internal database user id
return users.id
```

It should not silently fall back to the development user.

## Clerk IDs Versus Database IDs

Clerk gives an id shaped like:

```text
user_abc123
```

The app database uses UUIDs:

```text
users.id = 2b89f1c7-...
```

Notebook ownership still uses:

```text
notebooks.user_id -> users.id
```

So the app needs this mapping:

```text
Clerk userId
  -> users.clerk_user_id
    -> users.id
```

The repository functions should continue receiving the internal database UUID, not the Clerk `user_...` id.

## Handling Missing Clerk Users

`auth()` can return a null `userId` when there is no signed-in user.

The correct behavior is to stop immediately:

```text
null Clerk user id -> unauthenticated request
string Clerk user id -> authenticated request
```

The app should not do this:

```text
missing Clerk user -> use development user
```

That would risk mixing real users into the old dev account.

## SQL Query Results

`sql.query(...)` returns an array of row objects.

For a query like:

```sql
select id
from users
where clerk_user_id = $1
```

the result is shaped like:

```ts
[
  { id: "some-uuid" }
]
```

not:

```ts
[
  "some-uuid"
]
```

That is why a row type such as this is useful:

```ts
type UserIdRow = {
  id: string;
};
```

## User Repository

The database user logic was moved into:

```text
lib/server/user-repository.ts
```

This keeps responsibilities separated:

```text
current-user.ts
  -> Clerk auth/session logic

user-repository.ts
  -> users table lookup/creation logic
```

This makes `getCurrentUserId()` easier to understand and keeps SQL out of the auth boundary.

## Upsert And Race Conditions

The first implementation used a select-then-insert flow:

```text
select user by clerk_user_id
if missing, insert user
```

That has a race condition.

Two requests for the same new Clerk user could run at the same time:

```text
Request A selects no row.
Request B selects no row.
Request A inserts the user.
Request B tries to insert the same user.
Request B hits a unique constraint conflict.
```

The fixed version uses one Postgres upsert statement:

```sql
insert into users (clerk_user_id)
values ($1)
on conflict (clerk_user_id) do update
set clerk_user_id = excluded.clerk_user_id
returning id
```

This handles both cases:

```text
new user -> insert row -> return new users.id
existing user -> conflict -> return existing users.id
```

The second request does not replace the existing `id`. The query only updates the column in the `set` clause:

```sql
set clerk_user_id = excluded.clerk_user_id
```

So the existing database UUID remains stable.

## `returning`

Postgres `returning` sends values back from an `insert`, `update`, or `delete`.

In this step:

```sql
returning id
```

means:

```text
After inserting or reusing the user row, return users.id to TypeScript.
```

The result is still an array of row objects:

```ts
[
  { id: "database-user-uuid" }
]
```

## User Isolation

The important manual test was:

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

This verifies that:

- Clerk auth is working.
- Each Clerk user maps to a different `users.id`.
- Notebook queries are still scoped by `notebooks.user_id`.
- User data is isolated.

## Webhooks Were Deferred

Clerk webhooks can sync profile updates, user deletions, and richer metadata later.

They were intentionally deferred because:

- lazy user creation is enough for this app right now
- local webhook testing adds extra setup
- webhook delivery is eventually consistent
- profile syncing is not needed yet

The current app only stores:

```text
clerk_user_id
```

Email and name can be added later with `currentUser()` or webhooks.

## Future Route Structure

The current quick fix keeps `/` public and protects `/api/*`.

A cleaner future structure would be:

```text
/              public landing or signed-out page
/sign-in       public Clerk sign-in route
/sign-up       public Clerk sign-up route
/app           protected notebook app
/api/*         protected API routes
```

That route plan is recorded separately in:

```text
learning_summaries/STEP_24_FUTURE_AUTH_ROUTE_STRUCTURE.md
```

## Verification

The Step 24 auth work was verified with:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

Manual user-isolation testing was also completed.

## Commented-Out Dev Code To Remove Later

The old development user code is intentionally commented out for now.

Remove this later from:

```text
lib/server/current-user.ts
```

Current commented line:

```ts
// export const DEVELOPMENT_USER_ID = "00000000-0000-0000-0000-000000000001";
```

Also remove this commented migration block later from:

```text
db/migrations/001_create_users.sql
```

Current commented block:

```sql
-- insert into users (id, email, name)
-- values (
--   '00000000-0000-0000-0000-000000000001',
--   'dev@example.com',
--   'Development User'
-- )
-- on conflict (id) do nothing;
```

Important note:

```text
Commenting out the migration insert does not delete an existing development user row from an already-created database.
```

If the row already exists in Neon, it would need to be removed manually or with a future cleanup migration.

## Remaining Cleanup Ideas

These are not required for the current auth checkpoint, but may be useful later:

- Replace the bare signed-out page with a small polished signed-out state.
- Move the app to a protected `/app` route.
- Remove commented dev-user code entirely.
- Decide whether `UserIdRow` should stay in `lib/types.ts` or move into `user-repository.ts`.
- Add profile syncing later if email/name are needed.
- Add Clerk webhooks later if user metadata must stay synced.
