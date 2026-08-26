export function normalizeFolderName(value: string): string | null {
  const name = value.normalize("NFKC").trim();
  const hasControlCharacter = Array.from(name).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

  if (
    name.length === 0 ||
    name.length > 100 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    hasControlCharacter
  ) {
    return null;
  }

  return name;
}
