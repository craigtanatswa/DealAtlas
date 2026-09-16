export const CSV_UTF8_BOM = "\uFEFF";

const FORMULA_LEADING = /^[=+\-@\t\r]/;
const LEADING_SPACE = /^[\u0000-\u0020\u00a0\u2028\u2029]+/;

function needsFormulaEscape(value: string): boolean {
  if (FORMULA_LEADING.test(value)) {
    return true;
  }
  const trimmed = value.replace(LEADING_SPACE, "");
  return trimmed !== value && FORMULA_LEADING.test(trimmed);
}

/**
 * Escape a CSV field for spreadsheet clients.
 * Prefix formula-leading values so Excel/Sheets do not execute them.
 */
export function escapeCsvCell(value: string): string {
  let cell = value.normalize("NFC");
  if (needsFormulaEscape(cell)) {
    cell = `'${cell}`;
  }

  if (/[",\n\r]/.test(cell) || cell.startsWith("'")) {
    return `"${cell.replaceAll('"', '""')}"`;
  }

  return cell;
}

export function csvCellValue(
  value: string | number | boolean | null | undefined,
): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  return value;
}

export function buildUtf8Csv(headers: readonly string[], rows: string[][]): string {
  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")),
  ];
  return `${CSV_UTF8_BOM}${lines.join("\r\n")}\r\n`;
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}
