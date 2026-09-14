export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  const header = rows[0];
  if (!header || header.length === 0) {
    return [];
  }
  const keys = header.map((cell) => cell.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (!key) {
        continue;
      }
      record[key] = row[index] ?? "";
    }
    return record;
  });
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    current.push(field);
    field = "";
  };
  const pushRow = () => {
    if (current.length === 1 && current[0] === "" && rows.length === 0) {
      current = [];
      return;
    }
    pushField();
    if (current.some((cell) => cell.trim() !== "")) {
      rows.push(current);
    }
    current = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length > 0 || current.length > 0) {
    pushRow();
  }
  return rows;
}
