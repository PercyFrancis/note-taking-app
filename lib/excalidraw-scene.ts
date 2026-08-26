function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isValidStoredExcalidrawScene(drawing: string | null): boolean {
  if (drawing === null) return true;

  try {
    const scene: unknown = JSON.parse(drawing);
    if (!isRecord(scene)) return false;

    return (
      scene.version === 1 &&
      scene.source === "excalidraw" &&
      Array.isArray(scene.elements) &&
      (scene.appState === undefined || isRecord(scene.appState)) &&
      (scene.files === undefined || isRecord(scene.files))
    );
  } catch {
    return false;
  }
}
