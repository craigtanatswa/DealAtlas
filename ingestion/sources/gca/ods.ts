import { inflateRawSync } from "node:zlib";

import { IngestionError } from "@/ingestion/core/errors";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZipText(bytes: Uint8Array, entryName: string): string {
  const buf = Buffer.from(bytes);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  for (let index = 0; index < count; index += 1) {
    if (buf.readUInt32LE(offset) !== CENTRAL) {
      break;
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressed = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name !== entryName) {
      continue;
    }
    return inflateLocal(buf, localOffset, method, compressed);
  }
  throw new IngestionError({
    message: "Spreadsheet archive has no content entry.",
    stage: "parse",
    code: "ODS_CONTENT_MISSING",
    retryable: false,
  });
}

export function odsRows(xml: string): string[][] {
  const rows: string[][] = [];
  const rowRe = /<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g;
  for (const rowMatch of xml.matchAll(rowRe)) {
    const cells: string[] = [];
    const cellRe = /<table:table-cell\b([^>]*)(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g;
    for (const cellMatch of rowMatch[1].matchAll(cellRe)) {
      const repeated = Number(/table:number-columns-repeated="(\d+)"/.exec(cellMatch[1])?.[1] ?? "1");
      const count = Number.isFinite(repeated) ? Math.min(Math.max(repeated, 1), 40) : 1;
      const text = cellText(cellMatch[2] ?? "");
      if (repeated > 40 && !text) {
        break;
      }
      for (let index = 0; index < count; index += 1) {
        cells.push(text);
      }
    }
    if (cells.some((cell) => cell)) {
      rows.push(cells);
    }
  }
  return rows;
}

function cellText(inner: string): string {
  const parts: string[] = [];
  for (const match of inner.matchAll(/<text:p\b[^>]*>([\s\S]*?)<\/text:p>/g)) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) {
      parts.push(decodeXml(text));
    }
  }
  return parts.join(" ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let index = buf.length - 22; index >= min; index -= 1) {
    if (buf.readUInt32LE(index) === EOCD) {
      return index;
    }
  }
  throw new IngestionError({
    message: "Spreadsheet archive is not a zip file.",
    stage: "parse",
    code: "ODS_ZIP_INVALID",
    retryable: false,
  });
}

function inflateLocal(buf: Buffer, localOffset: number, method: number, compressed: number): string {
  if (buf.readUInt32LE(localOffset) !== LOCAL) {
    throw new IngestionError({
      message: "Spreadsheet archive entry is unreadable.",
      stage: "parse",
      code: "ODS_ZIP_INVALID",
      retryable: false,
    });
  }
  const nameLength = buf.readUInt16LE(localOffset + 26);
  const extraLength = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const slice = buf.subarray(start, start + compressed);
  const raw = method === 0 ? slice : inflateRawSync(slice);
  return raw.toString("utf8");
}
