# Future Feature Roadmap

This document lays out a recommended order for adding larger note-taking features after the core notebook, cell, auth, persistence, import/export, and drawing basics are in place.

The main principle:

```text
Add high-value, low-risk editor features first.
Delay features that require a new storage model or a drawing-engine rewrite.
```

## Recommended Order

Recommended implementation order:

```text
1. Find and replace
2. Common shortcuts
3. Attach images to markdown cells
4. Scoped undo and redo
5. Mobile / stylus drawing improvements
6. Remake drawing cells with a real drawing engine
7. Optional PDF annotation/editing
```

This order gives quick wins first while avoiding a premature rewrite of the drawing system.

## Feature Value Summary

| Feature | Worth Adding? | Recommended Priority |
|---|---:|---:|
| Find and replace | Yes | High |
| Common shortcuts | Yes | High |
| Images in markdown | Yes | High |
| Undo and redo | Yes, but scoped carefully | Medium-high |
| Mobile / Apple Pencil drawing | Yes, if drawing matters | Medium |
| OneNote-like drawing remake | Maybe, but use a library | Large / late |
| PDF editing | Mostly not yet | Last |

## 1. Find And Replace

### Why This Should Come First

Find and replace is useful in nearly every note-taking app and does not require major database changes.

It mostly operates on existing text cell content:

```text
Notebook
  -> cells
    -> text cells
      -> content
```

This makes it a good feature to build before larger architectural changes.

### Suggested Scope

Start with:

```text
Find text in the active notebook
Show match count
Jump to next/previous match
Replace current match
Replace all in active notebook
```

Later add:

```text
Search all notebooks
Case-sensitive toggle
Whole-word toggle
Regex toggle
Search only headings
Search only markdown preview text
```

### Suggested Checkpoints

Checkpoint 1:

```text
Create helper functions for finding matches in text cells.
Do not modify UI yet.
```

Checkpoint 2:

```text
Add a search/find bar to the notebook editor.
Display the number of matches.
```

Checkpoint 3:

```text
Add next/previous match navigation.
Focus the matching text cell when navigating.
```

Checkpoint 4:

```text
Add replace current match.
Reuse existing text-cell update/save flow.
```

Checkpoint 5:

```text
Add replace all.
Persist changed text cells through existing API update logic.
```

### Main Caution

Avoid replacing text in drawing cells.

Also be careful with markdown syntax. A simple replace can modify URLs, table syntax, code blocks, or image links. That is acceptable for a first version, but it should be understood.

## 2. Common Shortcuts (Implemented)

See [KEYBOARD_SHORTCUTS.md](./KEYBOARD_SHORTCUTS.md) for the complete implemented shortcut reference, proposed additions, browser-conflict guidance, and implementation rules.

### Why This Should Come Early

Shortcuts make the app feel much more usable without requiring new database tables.

You already have cell actions:

```text
add text cell
add drawing cell
delete cell
duplicate cell
move cell
focus search
```

Shortcuts can call those existing functions.

### Shortcut Reference

Use `Ctrl` on Windows/Linux and `Cmd` on macOS.

| Shortcut | Action | Where It Works |
|---|---|---|
| `Ctrl/Cmd + F` | Open or refocus find and replace | Anywhere in the active notebook |
| `Ctrl/Cmd + Enter` | Add a text cell after the current cell | While focus is inside a cell, including its text editor |
| `Ctrl/Cmd + Shift + Enter` | Duplicate the selected cell | After selecting a cell, including while typing in its text editor |
| `Ctrl/Cmd + Backspace` | Delete the current cell after confirmation | While focus is inside a cell, but not while typing in an input or textarea |
| `Alt + ArrowUp` | Move the current cell up | While focus is inside a cell, but not while typing in an input or textarea |
| `Alt + ArrowDown` | Move the current cell down | While focus is inside a cell, but not while typing in an input or textarea |
| `Escape` | Close find and replace or the import dialog | While the applicable overlay or dialog is open |

Click anywhere in a cell, or focus one of its controls, to select it. The selected cell has a blue outline and remains selected until another cell is chosen. Cell shortcuts act on this selection.

The delete and move shortcuts deliberately do not run while typing. This preserves native word deletion, cursor movement, and text-selection behavior. Duplicate uses `Ctrl/Cmd + Shift + Enter` instead of `Ctrl/Cmd + Shift + D`, because Chrome reserves the latter for bookmarking all open tabs. Shortcut hints also appear in the relevant button tooltips.

### Implemented Scope

Start with:

```text
Ctrl/Cmd + F -> open find bar
Ctrl/Cmd + Enter -> add text cell after current cell
Ctrl/Cmd + Shift + Enter -> duplicate selected cell
Ctrl/Cmd + Backspace -> delete current cell after confirmation
Alt + ArrowUp -> move current cell up
Alt + ArrowDown -> move current cell down
Escape -> close overlays/dialogs
```

Later consider:

```text
Ctrl/Cmd + Z -> app-level undo
Ctrl/Cmd + Shift + Z -> app-level redo
Ctrl/Cmd + S -> flush pending saves
Ctrl/Cmd + K -> command palette
```

### Suggested Checkpoints

Checkpoint 1:

```text
Decide which shortcuts should work globally and which should only work when a cell is focused.
```

Checkpoint 2:

```text
Create a keyboard event handler at the notebook app/editor level.
```

Checkpoint 3:

```text
Prevent shortcuts from breaking normal textarea behavior.
```

Checkpoint 4:

```text
Add one shortcut at a time and test each manually.
```

### Main Caution

Do not override browser/editor shortcuts while typing unless the behavior is intentional.

For example:

```text
Ctrl/Cmd + F
```

normally opens browser find. If you override it, your app's find feature should be good enough to justify that.

## 3. Attach Images To Markdown Cells (Implemented)

The implementation uses private Vercel Blob storage with authenticated client uploads and authenticated image delivery. It accepts JPEG, PNG, WebP, and GIF files up to 10 MB, inserts Markdown at the current cursor position, uses the filename for default alt text, and displays upload progress.

An authenticated image library in the notebook toolbar lists the signed-in user's uploads directly from Blob storage. It provides newest-first thumbnails, filename search, pagination, source notebook/cell labels when available, recovery of images from deleted cells, URL and Markdown copying, previews, and insertion into the selected text cell. Permanent deletion remains deferred until attachment references can be tracked safely.

Setup and current limitations are documented in [README.md](./README.md#private-image-storage).

### Why This Is High Value

Markdown image support makes text cells much more useful.

The desired user flow:

```text
User chooses image
  -> app uploads image to storage
    -> storage returns a URL
      -> app inserts markdown image syntax into the text cell
```

Example inserted markdown:

```markdown
![diagram](https://example-storage-url/image.png)
```

### Storage Requirement

Images should not be stored directly inside the markdown string as base64.

Avoid:

```text
giant base64 strings inside cell.content
```

Prefer:

```text
upload image to object storage
store URL in markdown
```

Since the app is deployed on Vercel, Vercel Blob is a natural storage option.

Useful resources:

```text
https://vercel.com/docs/vercel-blob
https://vercel.com/docs/vercel-blob/client-upload
```

### Suggested Data Model

Simplest version:

```text
No new database table.
Markdown cell stores image URL directly in content.
```

More structured future version:

```text
attachments table
  id
  user_id
  cell_id
  url
  filename
  content_type
  size
  created_at
```

Start simple unless you need deletion tracking, quotas, or attachment management.

### Suggested Checkpoints

Checkpoint 1:

```text
Confirm markdown preview can render image URLs correctly.
```

Checkpoint 2:

```text
Create storage upload route or Vercel Blob client upload flow.
```

Checkpoint 3:

```text
Add an "Insert image" button to text cells.
```

Checkpoint 4:

```text
Upload selected file and insert markdown image syntax into the current cursor position.
```

Checkpoint 5:

```text
Persist the updated text cell content.
```

Checkpoint 6:

```text
Test export/import behavior with image markdown.
```

### Main Caution

If imported markdown contains image URLs, import/export does not automatically copy the image files.

That is acceptable for a first version, but later you may want a real attachment export format.

## 4. Scoped Undo And Redo (Implemented)

The initial implementation keeps up to 50 structural actions per notebook in memory. It covers adding, deleting, duplicating, moving, and drag-reordering cells. Undo and redo persist every change to the server before updating the interface, and a failed request leaves both the visible notebook and history stacks unchanged.

Deleted cells are restored with their original ID, type, content, drawing data, height, timestamps, and position. Preserving the ID also preserves private image references associated with a restored text cell. History is cleared on page reload, sign-out, and notebook import.

The notebook toolbar shows Undo and Redo buttons with the next action in their tooltips. `Ctrl/Cmd + Z` and `Ctrl/Cmd + Shift + Z` operate on structural history only when focus is outside an editable field, so native text and title undo remain available while typing.

### Why This Should Not Be First

Undo/redo sounds simple, but becomes complicated when the app has:

```text
text editing
drawing editing
cell add/delete
cell reorder
database saves
debounced updates
import/replace
```

Textareas already have native undo/redo for typing. The first app-level undo/redo should not try to replace that.

### Suggested Initial Scope

Start with app-level structural actions:

```text
add cell
delete cell
duplicate cell
move cell
reorder cells
maybe notebook title changes
```

Delay:

```text
every text keystroke
every drawing stroke
import/replace undo
cross-notebook undo
```

### Future Scope Expansion

Increase the scope in stages rather than turning every state update into a history entry:

1. **Notebook titles:** Coalesce consecutive title edits into time-bounded entries so a word or editing session is undone instead of one character at a time. Flush the pending title save before crossing a structural history boundary.
2. **Find and replace:** Record Replace Current as one content entry and Replace All as one atomic multi-cell entry. Add a transactional batch API so the database cannot be left half-replaced if one update fails.
3. **Markdown editing:** Keep native textarea undo as the immediate typing history. If app-level content history is later required, capture selection and scroll state, group input by editing session, handle paste and IME composition, and coordinate entries with debounced saves.
4. **Drawing strokes:** Add command-based stroke history only after the drawing data model can represent individual strokes or objects. Bitmap snapshots are too large for a useful high-frequency history stack.
5. **Imports and bulk operations:** Store compact before/after notebook snapshots and persist the entire operation transactionally. Add size limits so large imports do not exhaust browser memory.
6. **Durable or cross-device history:** Replace in-memory stacks with a server-side action log containing user, notebook, sequence, action payload, and retention metadata. Define multi-tab conflict behavior before enabling this.
7. **Attachments:** Keep blobs available while an image insertion can still be redone. Add attachment reference tracking and delayed orphan cleanup before undo is allowed to delete stored files.
8. **History interface:** Add a history menu with action names and timestamps after there are enough action types to make non-linear inspection useful.

Any expansion should preserve the current persistence rule: an action enters history only after its original server mutation succeeds, and undo/redo moves an entry between stacks only after its inverse mutation succeeds.

### Possible Design

Use history stacks:

```text
undoStack
redoStack
```

Each entry describes an action that can be reversed:

```text
action type
affected notebook/cell id
before state
after state
```

### Suggested Checkpoints

Checkpoint 1:

```text
Define which actions are undoable.
```

Checkpoint 2:

```text
Create a local history model without UI.
```

Checkpoint 3:

```text
Wire undo/redo buttons.
```

Checkpoint 4:

```text
Wire keyboard shortcuts.
```

Checkpoint 5:

```text
Make undo/redo cooperate with API persistence.
```

### Main Caution

Undo/redo and database persistence need a clear rule.

For example:

```text
If delete cell succeeds remotely, undo should recreate it remotely.
```

Avoid an undo system that only changes React state while the database remains different.

## 5. Mobile / Stylus Drawing Improvements (Implemented)

Drawing cells now distinguish mouse, pen, and touch pointers. Mouse and pen input draw automatically, while one-finger gestures scroll the page unless **Touch drawing** is enabled in the notebook toolbar. The global preference applies to every drawing cell, is remembered in the current browser, and defaults to off.

Each canvas accepts one active pointer and captures it for the full gesture. The canvas disables native touch gestures so iPadOS cannot convert a downward Apple Pencil stroke into page scrolling. When touch drawing is off, finger movement is forwarded to the notebook's scroll container; when it is on, the same movement draws. Palm and additional touch input are ignored while drawing. Single taps still create dots, and leaving the canvas no longer ends a captured stroke.

Pen and eraser widths respond to pressure when a device reports it. Mouse and finger strokes keep the selected fixed width. Coalesced pointer samples are used when supported to make fast pen strokes smoother. PNG serialization now runs asynchronously after a stroke, and obsolete encodes are discarded when another stroke begins, allowing rapid strokes without changing the existing data URL storage format.

### Why This Comes Before A Drawing Rewrite

If you want drawing to matter, first improve input quality on phones/tablets.

This can teach you what the current canvas editor can and cannot support before deciding whether to replace it.

### Useful Browser Concepts

Pointer events can distinguish input types:

```text
mouse
pen
touch
```

Resource:

```text
https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pointerType
```

Useful event properties may include:

```text
pointerType
pressure
tiltX
tiltY
pointerId
```

Support varies by browser/device.

### Suggested Scope

Start with:

```text
better touch scrolling behavior around canvas
pen drawing support
finger drawing/touch handling
single-tap dot drawing
responsive canvas sizing
avoid page scrolling while actively drawing
```

Later:

```text
tilt-aware brushes
stylus barrel-button behavior
high-DPI canvas backing storage
device testing across iPadOS, Android, and Windows pen hardware
```

### Suggested Checkpoints

Checkpoint 1:

```text
Audit current pointer event handling in DrawingCellEditor.
```

Checkpoint 2:

```text
Test on mobile/tablet hardware.
```

Checkpoint 3:

```text
Improve pointer capture and touch-action CSS.
```

Checkpoint 4:

```text
Add pressure-aware brush size if the device supports pressure.
```

Checkpoint 5:

```text
Retest resize, save, reload, and import/export behavior.
```

### Main Caution

Do not over-invest in bitmap canvas if you plan to move to a vector drawing editor later.

Bitmap canvas is good for simple freehand drawing. It is not ideal for selectable strokes, text boxes, layers, or object editing.

## 6. Remake Drawing Cells With A Real Drawing Engine

### Why This Is Large

Making drawing cells similar to OneNote means adding features like:

```text
selectable strokes
movable objects
text boxes
layers
shape selection
eraser modes
resize handles
undo/redo
copy/paste
image insertion
export
```

That is no longer a simple canvas. It is a drawing editor.

### Strong Recommendation

Use an existing drawing engine rather than hand-rolling this.

Options to investigate:

```text
tldraw
Excalidraw
custom SVG/canvas hybrid
```

tldraw is likely the best fit if you want a richer editor with shapes, assets, selection, tools, history, and editor APIs.

Useful resources:

```text
https://tldraw.dev/installation
https://tldraw.dev/docs/editor
https://docs.excalidraw.com/
```

### Major Architecture Question

Your current drawing cell probably stores something like:

```text
drawing: string | null
```

For a real editor, drawing data may become structured JSON:

```text
shapes
bindings
assets
pages
editor state
```

This may require:

```text
new database storage format
migration path from old drawing cells
new validation
new import/export support
larger save payloads
possibly throttled/debounced saves
```

### Suggested Checkpoints

Checkpoint 1:

```text
Research tldraw and Excalidraw integration models.
```

Checkpoint 2:

```text
Prototype one isolated drawing editor component outside the notebook flow.
```

Checkpoint 3:

```text
Decide storage shape for drawing cell data.
```

Checkpoint 4:

```text
Create a new drawing-cell version or migration strategy.
```

Checkpoint 5:

```text
Wire one drawing cell to the new editor.
```

Checkpoint 6:

```text
Persist/reload drawing content.
```

Checkpoint 7:

```text
Update import/export.
```

### Main Caution

This feature may reshape the entire drawing-cell architecture.

Do not start it until basic note-taking, search, shortcuts, imports, and image attachments feel stable.

## 7. Optional PDF Editing

### Why This Should Be Last

Full PDF editing is a separate product category.

It can involve:

```text
PDF rendering
page management
text extraction
annotations
drawing overlays
exporting modified PDFs
large file storage
permissions
performance issues
```

For this app, full PDF editing is probably not worthwhile soon.

### More Realistic Scope

Instead of "PDF editing", consider:

```text
PDF attachment
PDF preview
drawing annotations over PDF pages
export annotated PDF or keep annotations in app
```

### Suggested Checkpoints

Checkpoint 1:

```text
Allow attaching a PDF file to a notebook or cell.
```

Checkpoint 2:

```text
Render PDF pages for viewing.
```

Checkpoint 3:

```text
Allow drawing annotations over a page.
```

Checkpoint 4:

```text
Persist annotations separately from the original PDF.
```

Checkpoint 5:

```text
Optionally export annotated PDF.
```

### Main Caution

Do not start PDF support until image attachment and drawing architecture decisions are stable.

## Cross-Feature Dependencies

Some features affect each other:

```text
Images in markdown
  -> affects export/import
  -> may need file storage
  -> may later affect PDF/image attachment model

Undo/redo
  -> affects cell actions
  -> affects drawing editor
  -> affects database save strategy

Drawing rewrite
  -> affects storage
  -> affects import/export
  -> affects undo/redo
  -> affects mobile/stylus support

PDF support
  -> likely depends on file storage
  -> likely depends on drawing/annotation architecture
```

This is why the recommended order avoids starting with the drawing rewrite or PDF support.

## Suggested Milestone Plan

### Milestone 1: Editor Productivity

Build:

```text
find and replace
common shortcuts
```

Goal:

```text
Make the app faster to use without changing the storage model much.
```

### Milestone 2: Richer Markdown

Build:

```text
image attachments for markdown cells
```

Goal:

```text
Support image-heavy notes while learning file uploads/storage.
```

### Milestone 3: Editing Safety

Build:

```text
scoped undo and redo
```

Goal:

```text
Make structural editing safer without trying to undo every keystroke.
```

### Milestone 4: Drawing Input Quality

Build:

```text
mobile/stylus drawing improvements
```

Goal:

```text
Improve the existing drawing cell enough to understand whether it should be kept or replaced.
```

### Milestone 5: Drawing Architecture Decision

Decide:

```text
keep improving current canvas
or replace with tldraw/Excalidraw
```

Goal:

```text
Avoid hand-rolling a complex drawing editor if a library solves the problem better.
```

### Milestone 6: Optional Documents

Consider:

```text
PDF preview/annotation
```

Goal:

```text
Only add PDF features if they clearly fit the app's direction.
```

## Decision Guide

When choosing what to build next, ask:

```text
Does this improve the app for most notes?
Does this require a database migration?
Does this require a new storage service?
Does this affect import/export?
Does this interact with undo/redo?
Can I test it manually without complex setup?
Can it be shipped in a smaller version first?
```

Prefer features where the answer is:

```text
high user value
small data-model change
clear manual tests
small first version
```

## Current Recommendation

Start with:

```text
Find and replace
```

Then:

```text
Common shortcuts
```

Then:

```text
Images in markdown
```

This gives useful editor improvements before taking on file storage, undo history, drawing architecture, or PDF complexity.

