/**
 * PF-07 planted leaks. Each function returns a copy of a real response with
 * one extra occurrence of `text` in a position that is not an echo of the
 * request: a result card, og:description, or the RSC (flight) payload. The
 * reflection-parity verdict on the planted copy must fail.
 */

export type PlantSite = "card" | "og:description" | "rsc" | "json-item";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function insertBefore(body: string, markers: string[], insert: string): string {
  for (const marker of markers) {
    const at = body.lastIndexOf(marker);
    if (at >= 0) return body.slice(0, at) + insert + body.slice(at);
  }
  return body + insert;
}

export function plantCard(html: string, text: string): string {
  const card = `<article class="pf07-card"><a href="/deals/pf07-planted-card"><h3>${escapeHtml(text)}</h3></a></article>`;
  return insertBefore(html, ["</main>", "</body>"], card);
}

/** Appends to the existing og:description, or adds one in <head> when the page has none. */
export function plantOgDescription(html: string, text: string): string {
  const re = /(<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["'])([^"']*)(["'])/i;
  if (re.test(html)) return html.replace(re, (_m, open: string, content: string, close: string) => `${open}${content} ${escapeHtml(text)}${close}`);
  const reversed = /(<meta\b[^>]*\bcontent=["'])([^"']*)(["'][^>]*\bproperty=["']og:description["'])/i;
  if (reversed.test(html)) {
    return html.replace(reversed, (_m, open: string, content: string, close: string) => `${open}${content} ${escapeHtml(text)}${close}`);
  }
  return insertBefore(html, ["</head>"], `<meta property="og:description" content="${escapeHtml(text)}"/>`);
}

/**
 * HTML: a new `self.__next_f.push` chunk carrying an RSC row. An x-component
 * body: a new row. Either way the token sits only in the flight payload.
 */
export function plantRsc(body: string, text: string, contentType = ""): string {
  const row = `a7:["$","p",null,{"children":${JSON.stringify(text)}}]\n`;
  if (contentType.includes("text/x-component")) return `${body}${body.endsWith("\n") ? "" : "\n"}${row}`;
  const chunk = `<script>self.__next_f.push([1,${JSON.stringify(row).replace(/</g, "\\u003c")}])</script>`;
  return insertBefore(body, ["</body>"], chunk);
}

/** /api/search: the token inside a result item's summary (a new item when there are none). */
export function plantJsonItem(body: string, text: string): string {
  const json = JSON.parse(body) as { items?: Array<Record<string, unknown>> };
  const items = Array.isArray(json.items) ? json.items : [];
  if (items.length > 0) items[0] = { ...items[0], previewSummary: `${String(items[0].previewSummary ?? "")} ${text}`.trim() };
  else items.push({ slug: "pf07-planted-item", previewTitle: "Planted item", previewSummary: text });
  return JSON.stringify({ ...json, items });
}

export function plant(site: PlantSite, body: string, text: string, contentType = ""): string {
  switch (site) {
    case "card":
      return plantCard(body, text);
    case "og:description":
      return plantOgDescription(body, text);
    case "rsc":
      return plantRsc(body, text, contentType);
    case "json-item":
      return plantJsonItem(body, text);
  }
}
