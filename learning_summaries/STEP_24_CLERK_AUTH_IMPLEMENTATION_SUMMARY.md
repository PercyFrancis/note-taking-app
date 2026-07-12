# Step 24 Summary - Clerk Authentication Implementation

Step 24 added Clerk authentication to the notebook app and connected signed-in Clerk users to the existing Neon Postgres data model.

The final goal was:

```text
Signed-in Clerk user
  -> internal users.id row
    -> notebooks.user_id
      -> that user's notebooks and cells
```

## Main Files Changed

The main files involved were:

- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `app/layout.tsx`
- `app/page.tsx`
- `proxy.ts`
- `components/notebook/NotebookSidebar.tsx`
- `lib/server/current-user.ts`
- `lib/server/user-repository.ts`
- `db/migrations/001_create_users.sql`

## Clerk Setup

Clerk was added with:

```text
@clerk/nextjs
```

The environment variable placeholders were added to `.env.example`:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
```

The app also still requires:

```text
DATABASE_URL
```

for the Neon database.

## ClerkProvider

`ClerkProvider` was added in `app/layout.tsx`.

The final layout keeps the provider high in the app tree:

```tsx
<ClerkProvider afterSignOutUrl="/">
  {children}
</ClerkProvider>
```

This gives the app access to Clerk auth state and sets sign-out to redirect to `/`.

The important rule learned was:

```text
afterSignOutUrl should point to a public route.
```

## Clerk UI Components

The installed Clerk version uses `Show` for signed-in and signed-out branching.

The app uses:

```ts
import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
```

for the signed-out page.

It uses:

```ts
import { UserButton } from "@clerk/nextjs";
```

inside the notebook sidebar.

The important distinction was:

```text
Clerk UI components -> @clerk/nextjs
server auth helper  -> @clerk/nextjs/server
```

## Public Root Page

The root page `/` was kept public.

The final behavior is:

```text
signed in  -> render NotebookApp
signed out -> render a centered sign-in/sign-up view
```

This avoids mounting `NotebookApp` for signed-out users. That matters because `NotebookApp` fetches protected API routes.

The signed-out view uses:

- full-height centered layout
- app-like slate background
- `SignInButton`
- `SignUpButton`
- existing shared button classes

## UserButton Placement

The `UserButton` was moved out of the global `layout.tsx` header and into `NotebookSidebar.tsx`.

This fixed the layout problem caused by:

```text
global h-16 header + NotebookApp min-h-screen
```

That combination made the page taller than the viewport.

The better final structure is:

```text
layout.tsx provides Clerk context
NotebookApp owns the app shell
NotebookSidebar owns the signed-in user control
```

## Route Protection

Because the quick-fix route structure keeps `/` public, `proxy.ts` protects API routes only:

```ts
const isProtectedRoute = createRouteMatcher(["/api(.*)"]);
```

The final route model is:

```text
/        public
/api/*   protected
```

This means signed-out users can visit the root page, but cannot load or mutate notebook data.

The API routes are also protected at the data layer because they call:

```ts
getCurrentUserId()
```

## Replacing The Development User

Before Clerk, `getCurrentUserId()` returned a hard-coded development UUID.

The Clerk version uses:

```ts
import { auth } from "@clerk/nextjs/server";
```

The helper now does:

```text
read Clerk auth state
if no Clerk user id, throw "Not signed in"
map Clerk user id to internal users.id
return users.id
```

The app no longer falls back to the development user.

## Clerk ID Versus App User ID

Clerk gives ids like:

```text
user_abc123
```

The database uses UUIDs like:

```text
users.id = 2b89f1c7-...
```

The notebook tables still use the internal UUID:

```text
notebooks.user_id -> users.id
```

So the app maps:

```text
Clerk userId
  -> users.clerk_user_id
    -> users.id
```

The repository functions continue receiving the internal database user id.

## User Repository

The database user lookup and creation logic was moved to:

```text
lib/server/user-repository.ts
```

This separates responsibilities:

```text
current-user.ts
  -> Clerk auth/session logic

user-repository.ts
  -> users table identity logic
```

## Race-Safe User Creation

The final user repository uses a single Postgres upsert:

```sql
insert into users (clerk_user_id)
values ($1)
on conflict (clerk_user_id) do update
set clerk_user_id = excluded.clerk_user_id
returning id
```

This handles both cases:

```text
new Clerk user      -> insert users row -> return new users.id
existing Clerk user -> conflict         -> return existing users.id
```

The `returning id` clause returns the internal database UUID to TypeScript.

This fixed the race condition that could happen with:

```text
select first
then insert if missing
```

because two simultaneous requests could both select no row and then both try to insert the same `clerk_user_id`.

## Dev User Cleanup

The development user fallback was removed from the active auth flow.

The old development-user export in `current-user.ts` was commented out and later noted as cleanup.

The old migration insert in `001_create_users.sql` was also commented out:

```sql
-- insert into users (id, email, name)
-- values (
--   '00000000-0000-0000-0000-000000000001',
--   'dev@example.com',
--   'Development User'
-- )
-- on conflict (id) do nothing;
```

Commenting this out prevents fresh databases from inserting the dev user, but it does not delete an existing dev-user row from an already-created database.

## User Isolation Testing

Manual user-isolation testing was completed.

The important test was:

```text
sign in as user A
create data
sign out
sign in as user B
confirm user A's data is not visible
create user B data
sign back in as user A
confirm user B's data is not visible
```

This confirmed:

- Clerk auth works
- each Clerk account maps to a separate `users.id`
- notebooks are scoped by `notebooks.user_id`
- user data is isolated

## Deployment Fix

After deploying to Vercel, the app returned:

```text
Internal Server Error
```

The likely cause was production environment configuration.

The required production environment variables are:

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
DATABASE_URL
```

After confirming the variables and redeploying, the deployed app started working.

Important deployment lesson:

```text
Changing environment variables in Vercel requires a new deployment.
```

## Verification

The final implementation was verified with:

```bash
pnpm check
pnpm exec tsc --noEmit
pnpm build
```

The deployed app was also manually checked after redeploying with the production environment variables.

## Future Improvements

Future auth improvements could include:

- Remove the commented-out dev-user code entirely.
- Move the signed-in app to a protected `/app` route.
- Add dedicated `/sign-in` and `/sign-up` routes.
- Use `currentUser()` or Clerk webhooks to store email/name later.
- Add webhook handling for user profile updates or deletions.
- Create a cleanup migration if an existing development user row should be removed from the database.

The current implementation is complete for the first production-ready Clerk auth pass.
