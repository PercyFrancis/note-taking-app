import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  ExcalidrawImperativeAPI,
  PointerDownState,
} from "@excalidraw/excalidraw/types";

export const PEN_STROKE_WIDTHS = [0.25, 0.5, 1, 2, 4] as const;

export type PenStrokeWidth = (typeof PEN_STROKE_WIDTHS)[number];
export type PenPressureMode = "dynamic" | "constant";

export function normalizeNewConstantWidthStroke(
  api: ExcalidrawImperativeAPI,
  pointerDownState: PointerDownState,
) {
  let changed = false;
  const updatedAt = Date.now();
  const elements = api.getSceneElementsIncludingDeleted().map((element) => {
    if (
      element.type !== "freedraw" ||
      pointerDownState.originalElements.has(element.id)
    ) {
      return element;
    }

    changed = true;
    return {
      ...element,
      simulatePressure: false,
      pressures: element.points.map(() => 0.5),
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: updatedAt,
    } as OrderedExcalidrawElement;
  });

  if (!changed) return;
  api.updateScene({ elements, captureUpdate: "NEVER" });
  api.refresh();
}
