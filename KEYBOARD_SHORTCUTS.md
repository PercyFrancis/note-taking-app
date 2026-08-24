# Keyboard Shortcuts

This document lists the shortcuts currently available in the note-taking app and recommends shortcuts for future features.

## Key Names

- `Ctrl/Cmd` means `Ctrl` on Windows and Linux, or `Cmd` on macOS.
- A **selected cell** has a blue outline and a **Selected** badge.
- Click anywhere in a cell, or focus one of its controls, to select it.
- Shortcuts marked **selection mode** do not run while typing in an input or textarea. This preserves native text editing.

## Implemented Shortcuts

### Notebook and Search

| Shortcut | Action | Context and Notes |
|---|---|---|
| `Ctrl/Cmd + F` | Open or refocus find and replace | Works anywhere in the active notebook when a modal dialog is not open. |
| `Enter` | Find next match | Works while focus is in the find field. Wraps after the last result. |
| `Shift + Enter` | Find previous match | Works while focus is in the find field. Wraps before the first result. |
| `Escape` | Close the active overlay | Closes the import dialog first, or closes find and replace. Import cannot be dismissed while an import is running. |
| `Ctrl/Cmd + Z` | Undo the last structural cell action | Works outside editable fields. Covers cell add, delete, duplicate, move, and drag-reorder. |
| `Ctrl/Cmd + Shift + Z` | Redo the last structural cell action | Works outside editable fields. Native undo/redo remains available while typing. |

### Selected Cell

| Shortcut | Action | Context and Notes |
|---|---|---|
| `Ctrl/Cmd + Enter` | Add a text cell after the selected cell | Also works while typing inside the selected cell. The new text cell receives focus. |
| `Ctrl/Cmd + Shift + Enter` | Duplicate the selected cell | Also works while typing inside the selected cell. The copy is inserted after the original. |
| `Ctrl/Cmd + Backspace` | Delete the selected cell | **Selection mode only.** Shows a confirmation and does not replace native deletion while typing. |
| `Alt + ArrowUp` | Move the selected cell up | **Selection mode only.** Does nothing while typing. |
| `Alt + ArrowDown` | Move the selected cell down | **Selection mode only.** Does nothing while typing. |

Buttons associated with these actions show their shortcuts in tooltips.

### Text Cell Editing

| Shortcut | Action | Context and Notes |
|---|---|---|
| `Tab` | Insert a tab or indent selected lines | Works inside a text-cell editor instead of moving focus. Tabs display at a width of two spaces. |
| `Shift + Tab` | Remove one leading tab or up to four leading spaces | Applies to the current line or every selected line. |

## Recommended Shortcuts

These shortcuts are proposals, not currently implemented. Add them incrementally and keep every shortcut context-sensitive.

### Highest Priority

| Proposed Shortcut | Proposed Action | Why It Is Useful |
|---|---|---|
| `Ctrl/Cmd + S` | Flush pending saves and show a saved status | Autosave should remain enabled, but an explicit save gives users confidence and follows IDE/note-app convention. The app must prevent the browser's **Save page** action. |
| `Ctrl/Cmd + K` | Open a command palette | Provides keyboard access to every action without assigning dozens of global shortcuts. When typing in a text cell, the same chord should insert a Markdown link instead. Notion uses a similar context-sensitive pattern. |
| `Ctrl/Cmd + Shift + F` | Search all notebooks | Keeps `Ctrl/Cmd + F` scoped to the active notebook and follows the IDE convention of using a broader find command for the whole workspace. |
| `?` | Open shortcut help | Only when focus is outside an editor. Makes shortcuts discoverable without colliding with browser commands. |

### Cell Navigation and Editing Modes

This app would benefit from the cell-mode pattern used by notebook and block editors:

| Proposed Shortcut | Proposed Action | Context |
|---|---|---|
| `Escape` | Leave text editing and select the current cell | When typing and no modal overlay needs to close. |
| `Enter` | Edit the selected text cell | Selection mode only. |
| `ArrowUp` | Select the previous cell | Selection mode only. |
| `ArrowDown` | Select the next cell | Selection mode only. |
| `Home` | Select the first cell | Selection mode only. |
| `End` | Select the last cell | Selection mode only. |
| `Alt + Enter` | Add a drawing cell after the selected cell | Complements `Ctrl/Cmd + Enter`, which adds a text cell. |

JupyterLab uses `Escape` and `Enter` to move between command mode and edit mode, while Notion uses `Escape`, arrows, and `Enter` for block selection and editing. This app can adopt the same mental model without using Jupyter's single-letter commands, which are easy to trigger accidentally in a web app.

### Markdown Editing

These should operate only inside a text-cell textarea and should wrap the selected text with Markdown syntax:

| Proposed Shortcut | Proposed Action | Markdown Result |
|---|---|---|
| `Ctrl/Cmd + B` | Toggle bold | `**text**` |
| `Ctrl/Cmd + I` | Toggle italic | `*text*` |
| `Ctrl/Cmd + K` | Insert or edit a link | `[text](url)` |
| `Ctrl/Cmd + Shift + X` | Toggle strikethrough | `~~text~~` |
| `Ctrl/Cmd + Shift + 7` | Toggle numbered list | `1. item` |
| `Ctrl/Cmd + Shift + 8` | Toggle bulleted list | `- item` |
| `Ctrl/Cmd + Shift + 9` | Toggle task item | `- [ ] item` |
| `Ctrl/Cmd + Alt + P` | Toggle Write/Preview for the current text cell | Avoids `Ctrl/Cmd + Shift + V`, which users expect to paste without formatting. |

### Later, When the Features Exist

| Proposed Shortcut | Proposed Action | Dependency |
|---|---|---|
| `Ctrl/Cmd + Alt + N` | Create a notebook | Notebook creation; chosen instead of browser-reserved `Ctrl/Cmd + N`. |
| `Ctrl/Cmd + Alt + A` | Attach an image to the current text cell | Image attachments. Recheck operating-system and accessibility conflicts before implementation. |
| `Ctrl/Cmd + Shift + E` | Export the active notebook | Active-notebook export rather than the current all-notebook export. |
| `Shift + ArrowUp/ArrowDown` | Extend a multi-cell selection | Requires a multi-cell selection model and bulk actions. |
| `Ctrl + Y` | Redo on Windows/Linux | Optional platform alias for the implemented structural redo command. |

## Shortcuts to Avoid in the Web App

Web apps should not casually replace established browser behavior. Avoid these unless there is an exceptionally strong reason and clear UI feedback:

| Shortcut | Common Browser Behavior |
|---|---|
| `Ctrl/Cmd + D` | Bookmark the current page. |
| `Ctrl/Cmd + Shift + D` | Bookmark all open tabs in Chrome. This is why cell duplication uses `Ctrl/Cmd + Shift + Enter`. |
| `Ctrl/Cmd + N` | Open a new browser window. |
| `Ctrl/Cmd + T` | Open a new tab. |
| `Ctrl/Cmd + W` | Close the current tab. |
| `Ctrl/Cmd + P` | Print the page. |
| `Ctrl + H` | Open browser history on Windows/Linux. |
| `Ctrl/Cmd + L` | Focus the address bar. |
| `Ctrl/Cmd + R` | Reload the page. |
| `Ctrl/Cmd + Shift + V` | Paste without formatting in many editors. |

Some browser shortcuts cannot be overridden reliably. A command palette is safer than assigning every action a global chord.

## Implementation Rules for Future Shortcuts

1. Preserve native copy, cut, paste, selection, cursor movement, deletion, and undo while typing.
2. Check whether focus is in the selected cell, another input, a modal, or the cell-selection surface.
3. Give modal dialogs priority over notebook-level shortcuts.
4. Call `preventDefault()` only when the app actually handles the command.
5. Show shortcuts in button tooltips and in the future command palette.
6. Keep Windows/Linux and macOS labels visible in the UI.
7. Test each shortcut in Chrome, Firefox, Safari, and Edge before treating it as stable.
8. Provide a clickable alternative for every keyboard-only action.

## Design References

- [Visual Studio Code default keyboard shortcuts](https://code.visualstudio.com/docs/reference/default-keybindings): command palette, explicit save, find navigation, Markdown/editor conventions, and contextual shortcuts.
- [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts): page search, selected-block navigation, Markdown formatting, and block actions.
- [JupyterLab notebook modes](https://jupyterlab.readthedocs.io/en/stable/user/notebook.html): distinct cell command and edit modes.
- [JupyterLab commands](https://jupyterlab.readthedocs.io/en/stable/user/commands.html): centralized commands shared by menus, palettes, and shortcuts.
- [OneNote keyboard shortcuts](https://support.microsoft.com/en-US/accessibility/onenote/keyboard-shortcuts-in-onenote): notebook-wide search, save/sync, navigation, and accessibility guidance.
- [Apple Notes keyboard shortcuts](https://support.apple.com/en-gb/guide/notes/apd46c25187e/mac): note creation, attachments, links, lists, headings, and other note-editor conventions.
