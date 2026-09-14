import { load } from "cheerio";

export type HtmlTableSpec = {
  rowSelector: string;
  fields: Record<string, string>;
  linkField?: string;
  linkSelector?: string;
};

export function extractHtmlTableRecords(
  html: string,
  spec: HtmlTableSpec,
): Record<string, string>[] {
  const $ = load(html);
  const records: Record<string, string>[] = [];

  $(spec.rowSelector).each((_, row) => {
    const record: Record<string, string> = {};
    for (const [field, selector] of Object.entries(spec.fields)) {
      record[field] = $(row).find(selector).first().text().replace(/\s+/g, " ").trim();
    }
    if (spec.linkField && spec.linkSelector) {
      const href = $(row).find(spec.linkSelector).first().attr("href");
      if (href) {
        record[spec.linkField] = href;
      }
    }
    if (Object.values(record).some((value) => value.trim() !== "")) {
      records.push(record);
    }
  });

  return records;
}
