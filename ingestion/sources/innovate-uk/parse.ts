import { IngestionError } from "@/ingestion/core/errors";
import { decodeHtml, buildGrantCandidate, parseGrantDate } from "@/ingestion/sources/grant-notice/map";
import {
  INNOVATE_UK_SOURCE_KEY,
  innovateUkCompetitionUrl,
} from "@/ingestion/sources/innovate-uk/constants";

export type InnovateCompetition = {
  id: string;
  path: string;
  title: string;
  summary: string;
  statusLabel: string | null;
  opensAt: string | null;
  closesAt: string | null;
};

export type InnovateSearchPage = {
  competitions: InnovateCompetition[];
  nextPage: number | null;
};

export function extractInnovateSearchPage(html: string): InnovateSearchPage {
  const competitions: InnovateCompetition[] = [];
  const chunks = html.split(/<li\b/i).slice(1);
  chunks.forEach((chunk, index) => {
    const end = chunk.search(/<\/li>/i);
    const li = end >= 0 ? chunk.slice(0, end) : chunk;
    if (!/\/competition\/\d+\/overview\//i.test(li)) return;
    const href = /href="(\/competition\/(\d+)\/overview\/([0-9a-f-]+))"/i.exec(li);
    const title = /<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(li);
    const summary = /<div class="wysiwyg-styles[^"]*">([\s\S]*?)<\/div>/i.exec(li);
    const status = /<h3\b[^>]*>\s*([^<]+?)\s*<\/h3>\s*<dl/i.exec(li);
    const opens = /<dt>\s*Opens:\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/i.exec(li);
    const closes = /<dt>\s*Closes:\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)/i.exec(li);
    const id = href?.[3] || href?.[2] || `unidentified-${index + 1}`;
    competitions.push({
      id,
      path: href?.[1] ?? "",
      title: decodeHtml(title?.[1] ?? ""),
      summary: decodeHtml(summary?.[1] ?? ""),
      statusLabel: status?.[1] ? decodeHtml(status[1]) : null,
      opensAt: parseGrantDate(opens?.[1] ? decodeHtml(opens[1]) : null),
      closesAt: parseGrantDate(closes?.[1] ? decodeHtml(closes[1]) : null),
    });
  });
  if (competitions.length === 0 && !/competition\/search/i.test(html)) {
    throw new IngestionError({
      message: "Innovation Funding Service search page had no competition list.",
      stage: "discover",
      code: "COMPETITION_PAGE_INVALID",
      retryable: false,
    });
  }
  const next = /<a\b[^>]*href="([^"]+)"[^>]*rel="next"|<a\b[^>]*rel="next"[^>]*href="([^"]+)"/i.exec(
    html,
  );
  const nextHref = next?.[1] || next?.[2] || "";
  const nextPage = /[?&]page=(\d+)/.exec(nextHref);
  return {
    competitions,
    nextPage: nextPage ? Number(nextPage[1]) : null,
  };
}

export function mapInnovateCompetition(record: InnovateCompetition, now: Date) {
  return buildGrantCandidate({
    sourceKey: INNOVATE_UK_SOURCE_KEY,
    id: record.id,
    title: record.title,
    description: record.summary,
    sourceUrl: record.path
      ? innovateUkCompetitionUrl(record.path)
      : innovateUkCompetitionUrl("/competition/search"),
    funder: "Innovate UK",
    opensAt: record.opensAt,
    closesAt: record.closesAt,
    statusLabel: record.statusLabel,
    reference: record.path || record.id,
    mainCategory: "Funding",
    now,
  });
}
