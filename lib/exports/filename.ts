const FILENAME_DATE = /^dealatlas-deals-\d{4}-\d{2}-\d{2}\.csv$/;

export function utcDateStamp(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dealExportFilename(now: Date = new Date()): string {
  return `dealatlas-deals-${utcDateStamp(now)}.csv`;
}

export function isDealExportFilename(value: string): boolean {
  return FILENAME_DATE.test(value);
}

export function contentDisposition(filename: string): string {
  const safe = filename.replace(/["\r\n]/g, "");
  return `attachment; filename="${safe}"`;
}
