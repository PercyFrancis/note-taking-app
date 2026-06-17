# Future Note - Hybrid Local And Cloud Storage

It is possible to support both:

```text
local browser storage
authenticated cloud database storage
```

in the same app.

This is usually called a:

```text
local-first app
offline-capable app
hybrid persistence design
```

This is not being implemented now, but it may be useful later.

## Current Direction

The current app is moving toward:

```text
Client Components
  -> API routes
    -> Neon Postgres
```

with Clerk authentication planned later.

That should remain the focus for now.

Hybrid local/cloud storage should be considered only after the database-backed version works.

## Option 1: Local-Only Guest Mode

Unauthenticated users store notebooks in browser storage:

```text
guest user
  -> localStorage or IndexedDB
```

Signed-in users store notebooks in the database:

```text
signed-in user
  -> API routes
    -> Neon Postgres
```

This is the simplest hybrid model.

The app can behave like:

```text
not signed in:
  local notebooks only

signed in:
  cloud notebooks
```

If a guest later signs in, the app can offer:

```text
Move local notebooks to account
```

That would import local notebooks into the database.

## Option 2: Cloud Primary With Local Cache

In this model, Neon remains the source of truth, but the browser stores a local cache.

Flow:

```text
open app
  -> show cached notebooks immediately
  -> fetch latest notebooks from server
  -> update UI
  -> update cache
```

This can make the app feel faster.

The tradeoff is that the app needs to understand:

```text
cache freshness
server updates
stale local data
failed refreshes
```

This is more complex than pure cloud storage.

## Option 3: Offline Editing With Later Sync

This is the most powerful version.

The app writes changes locally first:

```text
edit note
  -> save locally
  -> add change to sync queue
```

When the browser is online:

```text
sync queue
  -> API routes
    -> Neon Postgres
```

This supports offline editing.

The tradeoff is much higher complexity.

The app would need to track:

```text
pending changes
sync status
server versions
last synced time
conflicts
failed sync attempts
retry behavior
```

This should not be added until the normal cloud-backed version is stable.

## Option 4: User-Selected Storage Mode

Some apps allow users to choose where a notebook lives:

```text
local-only notebook
cloud-synced notebook
```

This is flexible but adds product complexity.

The UI must clearly communicate:

```text
this notebook is only on this device
this notebook is synced to your account
```

Otherwise users may misunderstand where their data is stored.

## localStorage Versus IndexedDB

For a future hybrid design, IndexedDB is probably better than `localStorage`.

`localStorage` is useful for simple persistence because it is easy to use.

But it has limitations:

```text
synchronous API
limited storage size
not ideal for larger data
not ideal for many writes
not ideal for drawing/image data
```

IndexedDB is better for:

```text
larger local data
offline-capable apps
structured local records
queued changes
drawing data
```

So a future offline/local-first version should probably use IndexedDB instead of expanding the current `localStorage` approach.

## Most Practical Future Design

The best future path for this app would likely be:

```text
not signed in:
  use local storage or IndexedDB

signed in:
  use Neon as the source of truth
  optionally keep IndexedDB as a local cache
```

After sign-in, the app could offer:

```text
Move local notebooks to account
```

That would copy local notebooks into the user's database-backed account.

## Why Not Build This Now

Hybrid persistence adds many extra decisions:

```text
Which source wins?
How are conflicts resolved?
What happens after failed saves?
How does the UI show pending sync?
How does import/export interact with cloud data?
How are local notebooks migrated after sign-in?
```

Those questions are easier to answer after the basic database-backed app works.

For now, the priority should stay:

```text
finish Neon-backed storage
then add Clerk auth
then revisit local/offline support later
```

## Key Takeaways

- It is possible to support both local and cloud storage.
- Guest mode can use local storage while signed-in users use Neon.
- Cloud-primary storage can still use a local cache for speed.
- Full offline editing requires a sync queue and conflict handling.
- IndexedDB is a better long-term local storage option than `localStorage`.
- A future "Move local notebooks to account" flow would be useful after auth.
- Hybrid storage should wait until the normal cloud-backed version is stable.
