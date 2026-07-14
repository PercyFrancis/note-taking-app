# Notebook Title Persistence Learnings

This summary covers the fix that made notebook title edits persist to the database.

Before this fix, changing a notebook title updated React state, so the UI changed immediately, but the title was not saved to Neon. Refreshing the page loaded the old database title again.

The final goal was:

```text
type in title input
  -> update React state immediately
    -> debounce remote save
      -> PATCH /api/notebooks/:notebookId
        -> update notebooks.title in Neon
```

## Main Files Involved

The main files involved were:

- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `lib/client/notebook-api.ts`
- `app/api/notebooks/[notebookId]/route.ts`
- `lib/server/notebook-repository.ts`

Most of the server/API path already existed. The missing piece was wiring title changes in `NotebookApp.tsx` to the existing client API helper.

## Existing Server Path

The app already had a client helper:

```ts
updateRemoteNotebook(notebookId, { title })
```

That sends:

```text
PATCH /api/notebooks/:notebookId
```

The API route:

```text
gets the signed-in user id
validates the title input
calls updateNotebookTitle(userId, notebookId, title)
```

The repository updates the database:

```sql
update notebooks
set title = $1,
    updated_at = now()
where id = $2
  and user_id = $3
```

The `user_id` condition matters because it prevents one user from renaming another user's notebook.

## Controlled Title Input

The title input in `NotebookEditor.tsx` is a controlled input:

```text
value comes from notebook.title
onChange reports the new title upward
```

The title edit flows upward:

```text
NotebookEditor input
  -> onUpdateNotebook({ title: event.target.value })
    -> NotebookApp.updateNotebook(...)
```

Controlled inputs do not save by themselves. They only report changes.

## Optimistic UI

`updateNotebook(fields)` first updates local React state:

```text
setNotebooks(...)
```

This makes the UI feel instant.

The title changes on screen before the database save finishes.

This is called an optimistic update:

```text
update UI first
save to server in the background
handle failure if needed
```

## Debouncing

Saving on every keystroke would create too many requests.

Example without debounce:

```text
N
No
Not
Note
Notes
```

This could send five PATCH requests.

Debouncing changes the behavior to:

```text
user types
cancel previous timer
start new timer
if user stops typing for 600ms
save the latest title
```

The app already used this idea for cell saves with `queueCellSave`.

The title fix reused the same strategy.

## Timer Refs

The fix added a ref for notebook title save timers:

```text
notebookTitleSaveTimersRef
```

The shape is:

```text
Map<notebookId, timer>
```

This means each notebook can have its own pending title save.

This matters if a user renames one notebook, switches notebooks, and renames another before the first save fires.

## Why `useRef`

`useRef` is useful for timers because:

```text
timer data must survive renders
changing timer data should not rerender the component
```

Timer state is operational state, not display state.

So it belongs in a ref, not `useState`.

## `queueNotebookTitleSave`

The title-save queue function takes:

```text
notebookId
title update input
```

The important strategy is:

```text
look up existing timer for this notebook
clear it if it exists
create a new timer
inside the timer, call updateRemoteNotebook(...)
when finished, remove the timer from the map
```

The timer callback is the function passed to `setTimeout`.

That callback runs later, after the debounce delay.

## Why There Is No Pending Title Ref

Cell saves use:

```text
pendingCellUpdatesRef
```

because cells can have multiple pending fields:

```text
content
drawing
heightPx
```

Those fields may need to be merged before saving.

Notebook title saves only save one field:

```text
title
```

There is nothing to merge.

The latest title is captured by the latest timer callback. When the user types again, the old timer is cleared and replaced.

## Storing The Timer

One bug was that the timer was created but not stored.

The important line is conceptually:

```text
notebookTitleSaveTimersRef.current.set(notebookId, nextTimer)
```

Without this, the next title edit cannot find and cancel the previous timer.

That would mean every keystroke could still schedule its own save.

## Guarding Empty Active Notebook IDs

Title saves are queued from `updateNotebook(fields)`.

The final guard checks:

```text
fields.title is not undefined
activeNotebookId is not empty
```

This prevents trying to save a title when there is no active notebook.

The title check uses:

```text
fields.title !== undefined
```

instead of a truthy check because an empty string is still a valid edited title.

This would be wrong:

```ts
if (fields.title) {
  ...
}
```

because it skips:

```text
""
```

The correct concept is:

```text
does the title property exist?
```

not:

```text
is the title truthy?
```

## Async Timer Cleanup Guard

The timer's `finally` block checks whether the current timer is still the same timer before deleting it.

Conceptually:

```text
if timer map still points to this timer
  delete this timer
```

This prevents an older async save from deleting a newer timer.

Example:

```text
Timer A starts saving
user types again
Timer B replaces Timer A in the map
Timer A finishes
Timer A should not delete Timer B
```

The identity check prevents that.

## Unmount Cleanup

The app clears pending title timers when `NotebookApp` unmounts.

This prevents delayed saves from firing after the component is gone.

The cleanup pattern is:

```text
when component unmounts
  loop over pending timers
  clear each timer
```

This was already done for cell timers and was added for notebook title timers too.

## Tradeoff Of Debounce Cleanup

If a user types a title and signs out before the 600ms timer fires, cleanup may cancel the pending save.

That means the latest change may not persist.

This is a known tradeoff of debounce-only persistence.

Possible stronger future improvements:

- save title immediately on blur
- flush pending title saves before sign-out
- add save status indicators
- retry failed saves

For now, debounce is acceptable and matches the current cell-save behavior.

## Final Behavior

The final title persistence behavior is:

```text
rename notebook
UI updates immediately
old title save timer is cancelled
new save timer starts
after 600ms, title is PATCHed to the server
refresh page
renamed title remains
```

## Verification

The implementation was checked with:

```bash
pnpm check
pnpm exec tsc --noEmit
```

Manual verification should include:

```text
rename notebook
wait at least one second
refresh page
confirm title persists
```

Additional useful tests:

```text
type quickly and confirm the final title saves
rename multiple notebooks
switch notebooks before debounce completes
confirm cell editing still works
confirm notebook creation/deletion/reordering still works
```

## Main Lesson

Notebook title persistence reused an existing pattern from cell persistence:

```text
optimistic state update
debounced remote save
timer stored in useRef
cleanup on unmount
server-side ownership check
```

The important difference is that title saves are simpler than cell saves because there is only one field to persist.
