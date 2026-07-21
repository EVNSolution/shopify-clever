const PRINT_TEXT_UNITS_PER_LINE = 88;

export function getInventoryPrintTextLineCount(value, unitsPerLine = PRINT_TEXT_UNITS_PER_LINE) {
  if (typeof value !== "string" || value.trim() === "") return 0;
  return value.split(/\r?\n/u).reduce((total, line) => {
    const widthUnits = Array.from(line).reduce(
      (sum, character) => sum + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1),
      0,
    );
    return total + Math.max(1, Math.ceil(widthUnits / unitsPerLine));
  }, 0);
}
