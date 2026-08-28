# PDF Editor View and Annotation Redesign

## Purpose

Correct the PDF editor's coordinate system and restructure its controls so PDF viewing, drawing, fullscreen, and continuous scrolling behave as one coherent editor.

This work must be implemented and verified one stage at a time. Do not begin a later stage until the current stage has passed its acceptance checks.

## Reported problems

1. Browser/CSS zoom visually scales the annotation canvas without updating Excalidraw's pointer coordinate system, so the cursor and resulting stroke do not align.
2. The current zoomed surface changes the layout dimensions and creates unwanted scrolling because the viewport is not sized to the PDF.
3. Fullscreen targets the complete application instead of only the PDF workspace.
4. Excalidraw controls still overlap the PDF and obstruct content and drawing areas.
5. Continuous mode mounts an independent Excalidraw interface for each page instead of using one shared drawing toolbar and tool state.
6. The notebook sidebar should remain attached to the viewport while the notebook content scrolls.

## Required design invariants

- Pointer coordinates, rendered ink, saved scene coordinates, and flattened-export coordinates must remain aligned at every supported zoom level.
- PDF zoom must not be implemented by applying a CSS transform to an interactive Excalidraw surface.
- Annotation elements remain associated with a specific PDF page.
- Switching pages or view modes must flush pending annotation changes without creating save loops or overlapping writes.
- Excalidraw controls must occupy dedicated UI space outside PDF page bounds.
- Single-page and continuous modes must use one shared tool selection and drawing-style state.
- Fullscreen must target the PDF workspace and its controls, not the application header or document-library sidebar unless explicitly approved.
- Continuous mode must lazily render pages near the viewport so large PDFs remain usable.
- Export must preserve annotation placement and stroke padding at every supported PDF zoom level.

## Implementation order

### Stage 1 — Coordinate-safe zoom and viewport sizing

- Remove CSS scaling from interactive Excalidraw canvases.
- Establish one canonical page-coordinate system based on PDF points.
- Resize/re-render the PDF and annotation viewport without changing pointer mapping.
- Define fit-width, fit-page, minimum, and maximum zoom behavior.
- Prevent Excalidraw's internal wheel pan/zoom from moving annotations independently of the PDF.

Acceptance checks:

- At 50%, 100%, 150%, 200%, and the maximum zoom, a stroke starts directly beneath the pointer.
- Zooming does not change saved element placement relative to the PDF.
- Zooming does not create unnecessary scrolling when the page can fit inside the available viewport.
- Existing saved annotations remain aligned.

### Stage 2 — Dedicated PDF workspace and fullscreen

- Create a bounded PDF workspace containing the viewer, shared annotation controls, and viewer controls.
- Make fullscreen target that workspace only.
- Keep PDF zoom and view-mode controls available in fullscreen.
- Restore focus and scroll position when fullscreen exits.

Acceptance checks:

- The application header and document-library sidebar are excluded from fullscreen.
- Entering or exiting fullscreen does not remount the active annotation scene or trigger an unnecessary save.
- Escape exits fullscreen normally.

### Stage 3 — External shared annotation toolbar

- Replace page-overlaid Excalidraw taskbars with one toolbar outside the PDF page.
- Keep the active tool, stroke/fill colors, width, style, and other supported drawing preferences when switching pages.
- Ensure dialogs and property panels do not block the page's drawing area.
- Retain keyboard-accessible labels, focus states, and touch-sized controls.

Acceptance checks:

- No persistent annotation controls overlap PDF content.
- The selected tool and style remain unchanged when moving between pages.
- Undo/redo apply to the active page and are clearly scoped.

### Stage 4 — Continuous scrolling with shared tools

- Use the same shared toolbar and tool state for every page.
- Keep separate per-page annotation scenes and persistence records.
- Lazily mount pages and annotation canvases near the viewport.
- Track the active page as the viewport moves and direct toolbar actions to it.
- Flush the prior page safely when the active page changes.

Acceptance checks:

- Scrolling between pages never creates a second toolbar.
- Drawing on one page cannot place elements into another page's scene.
- Tool and style selections persist across page boundaries.
- A large PDF does not mount every Excalidraw canvas at once.

### Stage 5 — Sticky notebook sidebar

- Keep the notebook sidebar attached to the viewport on desktop while the notebook editor scrolls independently.
- Preserve the current responsive/mobile layout.
- Ensure sidebar folder trees and notebook lists retain their own usable overflow areas.

Acceptance checks:

- Scrolling a long notebook does not move the desktop sidebar out of view.
- Sidebar content remains independently scrollable.
- Mobile layout is unchanged unless separately approved.

### Stage 6 — Regression verification and documentation

- Re-test annotation autosave, editable project export/import, flattened PDF export, fullscreen, page switching, and guest/cloud storage.
- Update `README.md` and `FUTURE_FEATURE_ROADMAP.md` to describe the final controls and behavior.
- Record any browser, touch, Apple Pencil, or rotated-page limitations still requiring physical testing.

## Confirmed decisions

- **Fit width** is the default PDF zoom. A dedicated **100%** option remains available.
- `Ctrl/Cmd + wheel` zooms in both single-page and continuous modes. An unmodified wheel scrolls normally and must never pan the Excalidraw scene independently.
- Fullscreen contains the PDF viewer, viewer controls, shared drawing toolbar, and a collapsible page-thumbnail rail. It excludes the application header and PDF document library.
- The shared annotation toolbar can dock to the top, left, right, or bottom so it can be moved away from the area being annotated.
- The sticky-sidebar request applies to the main note-taker notebook/folder sidebar, not the PDF editor sidebar. Desktop behavior changes; mobile remains responsive.

## Current progress

- **Implemented; awaiting physical verification:** Stage 1 — Coordinate-safe zoom and viewport sizing.
  - Fit width is the default and recalculates from the active viewer width and PDF page width.
  - The percentage control provides the requested 100% option; zoom buttons switch to a bounded custom zoom between 25% and 300%.
  - `Ctrl/Cmd + wheel` zooms in both view modes. An unmodified wheel scrolls and is blocked from Excalidraw's internal wheel pan.
  - PDF.js re-renders at the selected scale and Excalidraw receives that same scale through its own application state. Interactive canvases are no longer CSS-scaled.
  - Viewer zoom remounts only the inner Excalidraw surface from the latest in-memory draft. It does not call Excalidraw's imperative scene-update API during React updates, avoiding nested `_App` state updates.
  - The Excalidraw compatibility patch keeps its two-pointer canvas translation inside one pure React state updater. This prevents React 19's `_App` warning while resizing or manipulating annotations.
  - The temporary viewer scale is removed before scene persistence, so it does not change saved or exported annotation coordinates.
  - The PDF workspace is constrained to the dynamic browser viewport and owns its scrolling, preventing simultaneous page-level and viewer-level scrolling.
  - A non-passive wheel capture isolates ordinary scrolling from `Ctrl/Cmd + wheel` PDF zoom and prevents browser/Excalidraw zoom leakage.
  - Selecting the displayed zoom percentage opens a focused numeric field for custom values from 25% through 300%.
- **Verification required:** Physically test pointer/stroke alignment, wheel isolation, and viewport sizing at several zoom levels. Automated browser interaction was unavailable during implementation.
- **Pending:** Stages 2–6. Begin Stage 2 only after Stage 1 pointer verification.
