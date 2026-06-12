# Step 13 Learnings - Focus And Keyboard Behavior

Step 13 made the notebook editor smoother to use with focus behavior and keyboard shortcuts.

Before this step, new text cells appeared but did not automatically receive keyboard focus. Cell actions were also mostly button-driven. After this step, new text cells can focus themselves automatically, and common cell actions can be triggered from the keyboard.

The main goal was to learn how React coordinates focus, refs, effects, and keyboard events without interfering with normal text editing.

## What Changed

Step 13 updated:

- `components/notebook/NotebookApp.tsx`
- `components/notebook/NotebookEditor.tsx`
- `components/notebook/CellList.tsx`
- `components/notebook/CellFrame.tsx`
- `components/notebook/TextCellEditor.tsx`

The main features added were:

- Track which text cell should receive focus.
- Focus a new text cell after it is created.
- Clear the focus request after it is handled.
- Add keyboard shortcuts for adding text and drawing cells.
- Add a guarded keyboard shortcut for deleting a cell.
- Avoid deleting cells while the user is typing inside an editable element.

## Main Concept: Focus

Focus means:

```text
Which element receives keyboard input right now?
```

For example, when a textarea is focused, typing goes into that textarea.

Step 13 added behavior like this:

```text
User creates a new text cell.
React renders the new text cell.
The new cell's textarea receives focus.
The user can immediately start typing.
```

This makes notebook editing feel less clumsy.

## Main Concept: `focusedCellId`

The app now tracks which cell should receive focus:

```ts
const [focusedCellId, setFocusedCellId] = useState<string | null>(null);
```

This state means:

```text
null:
  no pending focus request.

"cell-id":
  the text cell with this id should focus itself.
```

This state lives in `NotebookApp` because `NotebookApp` creates new cells and owns the notebook state.

## Main Concept: Creating A Cell And Remembering Its ID

To focus a new text cell, the code needs the new cell's ID.

Instead of creating the cell inline:

```ts
cells: [...activeNotebook.cells, createTextCell()]
```

the code stores it in a variable:

```ts
const newCell = createTextCell();
```

Then it inserts the cell:

```ts
updateNotebook({
  cells: [...activeNotebook.cells, newCell],
});
```

Then it requests focus:

```ts
setFocusedCellId(newCell.id);
```

This means:

```text
Create the text cell.
Add it to the notebook.
Remember that this exact cell should receive focus.
```

The same pattern is used when adding a text cell below another cell.

## Main Concept: Passing Focus Props Down

The focus request starts in `NotebookApp`, but the textarea lives in `TextCellEditor`.

So the focus state travels down this component chain:

```text
NotebookApp
  -> NotebookEditor
  -> CellList
  -> CellFrame
  -> TextCellEditor
```

The main props are:

```ts
focusedCellId: string | null;
onFocusedCellHandled: () => void;
```

`focusedCellId` says:

```text
This is the cell that should focus.
```

`onFocusedCellHandled` says:

```text
The focus request was handled, so it can be cleared.
```

## Main Concept: Turning An ID Into A Boolean

`CellFrame` knows which cell it is rendering.

So it converts:

```ts
focusedCellId
```

into a simpler boolean:

```tsx
shouldFocus={focusedCellId === cell.id}
```

This keeps `TextCellEditor` simple.

`TextCellEditor` does not need to know about all possible cell IDs. It only needs to know:

```text
Should I focus myself?
```

## Main Concept: `useRef` For Textarea Focus

To focus a DOM element, React needs a ref:

```tsx
const textareaRef = useRef<HTMLTextAreaElement | null>(null);
```

The ref is attached to the textarea:

```tsx
<textarea ref={textareaRef} />
```

After React renders, `textareaRef.current` points to the real browser textarea element.

Then the code can call:

```ts
textareaRef.current?.focus();
```

This tells the browser:

```text
Put keyboard focus inside this textarea.
```

## Main Concept: `useEffect` For Focus Timing

The textarea cannot be focused until it exists in the DOM.

That is why focusing happens inside `useEffect`:

```tsx
useEffect(() => {
  if (!shouldFocus) return;

  textareaRef.current?.focus();
  onFocusHandled();
}, [shouldFocus, onFocusHandled]);
```

This means:

```text
After render, check whether this textarea should focus.
If yes, focus it.
Then tell the parent the focus request is complete.
```

The effect dependency array means:

```text
Run this effect when shouldFocus or onFocusHandled changes.
```

## Main Concept: Clearing The Focus Request

After the textarea focuses, the editor calls:

```ts
onFocusHandled();
```

In `NotebookApp`, that clears the state:

```tsx
onFocusedCellHandled={() => setFocusedCellId(null)}
```

This matters because focusing should be a one-time request.

The flow is:

```text
focusedCellId is set to a new text cell id.
TextCellEditor focuses the textarea.
TextCellEditor reports that focus was handled.
NotebookApp resets focusedCellId to null.
```

Without clearing it, the same cell could try to focus again on later renders.

## Main Concept: Keyboard Events

Keyboard shortcuts are handled with:

```tsx
onKeyDown={handleKeyDown}
```

The event object gives information such as:

```ts
event.key
event.ctrlKey
event.metaKey
event.shiftKey
```

`ctrlKey` detects Control.

`metaKey` detects Command on macOS.

So the code checks both:

```ts
const isModifierPressed = event.ctrlKey || event.metaKey;
```

This makes shortcuts work on Windows/Linux and macOS.

## Main Concept: Cell-Level Shortcuts

Shortcuts are handled in `CellFrame` because they are relative to one cell.

The shortcuts are:

```text
Ctrl/Cmd + Enter:
  add text cell below the current cell.

Ctrl/Cmd + Shift + D:
  add drawing cell below the current cell.

Ctrl/Cmd + Backspace:
  delete the current cell, with confirmation.
```

For example:

```ts
if (event.key === "Enter") {
  event.preventDefault();
  onAddTextCellAfter(cell.id);
  return;
}
```

This means:

```text
If the shortcut happened inside this cell,
add a new text cell below this cell.
```

## Main Concept: `preventDefault`

The shortcut handler uses:

```ts
event.preventDefault();
```

This tells the browser:

```text
Do not run the browser's default behavior for this key combination.
The app is handling it.
```

This is useful for shortcuts like `Ctrl/Cmd + Enter` because the app wants that combination to create a new cell instead of doing something else in the focused element.

## Main Concept: Avoiding Editable Target Conflicts

The app contains editable controls:

```text
textarea
input
color picker
range slider
contenteditable elements, if added later
```

Step 13 added a helper:

```ts
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target.tagName === "TEXTAREA" ||
    target.tagName === "INPUT" ||
    target.isContentEditable
  );
}
```

This checks whether the keyboard event came from an editable element.

That is important because some shortcuts have normal editing meanings.

## Main Concept: Guarding Delete While Typing

`Ctrl/Cmd + Backspace` can mean:

```text
Delete the previous word.
```

inside a textarea.

The app should not unexpectedly delete the whole cell while the user is typing.

So the delete shortcut is guarded:

```ts
if (event.key === "Backspace" && !isTypingInEditableElement) {
  event.preventDefault();

  const shouldDelete = window.confirm("Delete this cell?");
  if (shouldDelete) {
    onRemoveCell(cell.id);
  }
}
```

This means:

```text
If focus is inside an editable element, do not hijack Backspace.
If focus is not inside an editable element, allow the cell delete shortcut.
Ask for confirmation before deleting.
```

## Main Concept: Accessibility And `tabIndex`

An early version used:

```tsx
tabIndex={0}
```

on an `article`.

Biome flagged this because `article` is non-interactive and should not usually be added to the tab order.

The fix was to remove `tabIndex`.

Keyboard events still bubble up from focused child elements like:

```text
textarea
button
input
```

So `CellFrame` can still handle shortcuts without making the whole `article` focusable.

This is better for accessibility because it avoids adding confusing keyboard stops.

## Main Concept: Event Bubbling

Even though the `article` itself is not focusable, it can still receive keydown events from focused child elements.

For example:

```text
textarea receives keydown
event bubbles up to article
article's onKeyDown handler runs
```

That is why the shortcut handler can stay on:

```tsx
<article onKeyDown={handleKeyDown}>
```

without:

```tsx
tabIndex={0}
```

## What Was Verified

Step 13 was checked with:

```bash
pnpm check
```

and:

```bash
pnpm exec tsc --noEmit
```

Both passed.

The app also responded successfully at:

```text
http://localhost:3000
```

## What Step 13 Did Not Do

Step 13 did not add:

- Full keyboard navigation between cells.
- Arrow-key movement between cells.
- Undo and redo.
- Focus restoration after deleting a cell.
- Keyboard shortcuts for move up/down.
- Visible shortcut hints in the UI.
- Custom accessible announcements for drag-and-drop or reordering.

Those can be added later.

## Mental Model To Keep

Step 13 introduced this focus flow:

```text
User creates a text cell
  -> NotebookApp creates the cell
  -> NotebookApp stores focusedCellId
  -> focusedCellId passes down to TextCellEditor
  -> TextCellEditor focuses its textarea
  -> TextCellEditor reports focus handled
  -> NotebookApp clears focusedCellId
```

It also introduced this shortcut flow:

```text
User presses a shortcut inside a cell
  -> focused child element receives the key event
  -> event bubbles to CellFrame
  -> CellFrame checks modifier keys and target type
  -> CellFrame calls the correct cell callback
  -> NotebookApp updates the notebook state
```

The most important idea is:

```text
Focus should be intentional and one-time.
Keyboard shortcuts should speed up editing without stealing normal typing behavior.
```

## Key Takeaways

- Focus is about which element receives keyboard input.
- `focusedCellId` is a good way to request focus for a specific cell.
- Newly created text cells need to be stored in a variable so their ID can be used.
- `useRef` gives access to the real textarea element.
- `useEffect` is the right place to focus after render.
- Focus requests should be cleared after they are handled.
- Keyboard shortcuts belong near the UI context they affect.
- `Ctrl/Cmd` support requires checking both `ctrlKey` and `metaKey`.
- Destructive shortcuts need extra care.
- Shortcut handlers should avoid interfering with normal input behavior.
- `tabIndex` should not be added to non-interactive elements just to catch shortcuts.
- Event bubbling lets the cell frame handle shortcuts from focused child controls.
- Step 13 completed basic focus and keyboard behavior.
