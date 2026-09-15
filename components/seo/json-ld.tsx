import { serializeJsonLd, type JsonLdRecord } from "@/lib/seo/json-ld";

export function JsonLd({ data }: { data: JsonLdRecord | JsonLdRecord[] }) {
  const items = Array.isArray(data) ? data : [data];

  return (
    <>
      {items.map((item, index) => (
        <script
          // Static JSON-LD blocks; order is stable for a given page.
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(item) }}
        />
      ))}
    </>
  );
}
