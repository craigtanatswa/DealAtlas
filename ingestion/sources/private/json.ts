import { asArray, asRecord } from "@/ingestion/normalizers/text";

export function recordsFromJsonPayload(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (!record) {
    return asArray(payload);
  }
  for (const key of ["projects", "records", "items", "data", "releases"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  if (record.project || record.record) {
    return [record.project ?? record.record];
  }
  return collectObjectArrays(payload);
}

export function collectObjectArrays(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        found.push(item);
      }
      collectObjectArrays(item, found);
    }
    return found;
  }

  const record = asRecord(value);
  if (!record) {
    return found;
  }
  for (const nested of Object.values(record)) {
    collectObjectArrays(nested, found);
  }
  return found;
}

export function recordsWithProjectId(payload: unknown): unknown[] {
  const collected = collectObjectArrays(payload);
  const withId = collected.filter((item) => {
    const record = asRecord(item);
    return Boolean(record && (record.project_id || record.projectId || record.id));
  });
  if (withId.length > 0) {
    return withId;
  }
  return recordsFromJsonPayload(payload);
}
