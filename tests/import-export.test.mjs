import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredExcalidrawScene } from "../lib/excalidraw-scene.ts";
import { createNotebookImportInput } from "../lib/notebook-import.ts";
import {
  createScopedFolderExport,
  createScopedNotebookExport,
  hasValidScopedFolderHierarchy,
} from "../lib/scoped-workspace-transfer.ts";
import { DEFAULT_USER_SETTINGS, isUserSettings } from "../lib/settings.ts";

const validScene = JSON.stringify({
  version: 1,
  source: "excalidraw",
  elements: [{ id: "shape-1", type: "rectangle" }],
  appState: { gridModeEnabled: false },
  files: {},
});

test("notebook import preserves every cell engine", () => {
  const [notebook] = createNotebookImportInput(
    [
      {
        id: "notebook-1",
        title: "Mixed cells",
        folderId: null,
        createdAt: 1,
        updatedAt: 2,
        cells: [
          {
            id: "text-1",
            type: "text",
            content: "hello",
            heightPx: 180,
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: "legacy-1",
            type: "drawing",
            drawing: "data:image/png;base64,abc",
            heightPx: 240,
            createdAt: 1,
            updatedAt: 2,
          },
          {
            id: "excalidraw-1",
            type: "excalidraw",
            drawing: validScene,
            heightPx: 360,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
    ],
    "append",
  ).notebooks;

  assert.deepEqual(
    notebook.cells.map((cell) => cell.type),
    ["text", "drawing", "excalidraw"],
  );
  assert.equal(notebook.cells[2].drawing, validScene);
});

test("Excalidraw scene validation accepts the stored envelope", () => {
  assert.equal(isValidStoredExcalidrawScene(validScene), true);
  assert.equal(isValidStoredExcalidrawScene(null), true);
});

test("Excalidraw scene validation rejects malformed or legacy data", () => {
  assert.equal(isValidStoredExcalidrawScene("not json"), false);
  assert.equal(isValidStoredExcalidrawScene("{}"), false);
  assert.equal(
    isValidStoredExcalidrawScene(
      JSON.stringify({ version: 1, source: "excalidraw", elements: {} }),
    ),
    false,
  );
  assert.equal(
    isValidStoredExcalidrawScene("data:image/png;base64,abc"),
    false,
  );
});

test("a scoped notebook export contains only the selected notebook", () => {
  const workspace = createScopedNotebookExport({
    id: "notebook-1",
    title: "Selected",
    folderId: "10000000-0000-4000-8000-000000000001",
    cells: [],
    createdAt: 1,
    updatedAt: 2,
  });

  assert.equal(workspace.kind, "notebook");
  assert.equal(workspace.notebooks.length, 1);
  assert.equal(workspace.notebooks[0].folderId, null);
});

test("a scoped folder export preserves only its complete subtree", () => {
  const rootId = "10000000-0000-4000-8000-000000000001";
  const childId = "10000000-0000-4000-8000-000000000002";
  const outsideId = "10000000-0000-4000-8000-000000000003";
  const folders = [
    {
      id: rootId,
      name: "Root",
      parentId: outsideId,
      position: 0,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: childId,
      name: "Child",
      parentId: rootId,
      position: 0,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: outsideId,
      name: "Outside",
      parentId: null,
      position: 0,
      createdAt: 1,
      updatedAt: 2,
    },
  ];
  const notebook = (id, title, folderId) => ({
    id,
    title,
    folderId,
    cells: [],
    createdAt: 1,
    updatedAt: 2,
  });

  const workspace = createScopedFolderExport(rootId, folders, [
    notebook("note-1", "Root note", rootId),
    notebook("note-2", "Child note", childId),
    notebook("note-3", "Outside note", outsideId),
  ]);

  assert.ok(workspace);
  assert.deepEqual(
    workspace.folders.map((folder) => folder.id),
    [rootId, childId],
  );
  assert.equal(workspace.folders[0].parentId, null);
  assert.deepEqual(
    workspace.notebooks.map((item) => item.title),
    ["Root note", "Child note"],
  );
  assert.equal(
    hasValidScopedFolderHierarchy(workspace.folders, workspace.rootFolderId),
    true,
  );
});

test("scoped import rejects cyclic folder exports", () => {
  const firstId = "10000000-0000-4000-8000-000000000001";
  const secondId = "10000000-0000-4000-8000-000000000002";
  const folders = [
    { id: firstId, name: "First", parentId: secondId },
    { id: secondId, name: "Second", parentId: firstId },
  ];

  assert.equal(hasValidScopedFolderHierarchy(folders, firstId), false);
});

test("settings validation accepts complete preferences", () => {
  assert.equal(isUserSettings(DEFAULT_USER_SETTINGS), true);
  assert.equal(
    isUserSettings({
      ...DEFAULT_USER_SETTINGS,
      accent: "violet",
      theme: "dark",
    }),
    true,
  );
  assert.equal(
    isUserSettings({
      ...DEFAULT_USER_SETTINGS,
      pdfMaxZoomPercent: 1000,
    }),
    true,
  );
});

test("settings validation rejects unknown themes and incomplete values", () => {
  assert.equal(
    isUserSettings({ ...DEFAULT_USER_SETTINGS, theme: "midnight" }),
    false,
  );
  assert.equal(isUserSettings({ theme: "system", accent: "blue" }), false);
  assert.equal(
    isUserSettings({
      ...DEFAULT_USER_SETTINGS,
      pdfMaxZoomPercent: 1200,
    }),
    false,
  );
});
