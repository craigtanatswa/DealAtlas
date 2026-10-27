export const TED_SOURCE_KEY = "ted";

export const TED_ATTRIBUTION =
  "Source: Tenders Electronic Daily (TED), Publications Office of the European Union. © European Union. Reused under Commission Decision 2011/833/EU.";

export function TedAttribution({
  sourceKey,
}: {
  sourceKey: string | null | undefined;
}) {
  if (sourceKey !== TED_SOURCE_KEY) {
    return null;
  }

  return <p className="text-sm text-muted-foreground">{TED_ATTRIBUTION}</p>;
}
