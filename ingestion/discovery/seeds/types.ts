import type { Database } from "@/lib/db/database.types";

export type DiscoverySeed = {
  sourceKey: string;
  name: string;
  sourceType: Database["public"]["Enums"]["source_type"];
  accessMethod: Database["public"]["Enums"]["access_method"];
  baseUrl: string;
  termsUrl?: string | null;
  licenceName?: string | null;
  licenceUrl?: string | null;
  country?: string;
  industry?: string | null;
  parserConfig?: Record<string, unknown>;
};
