import type { PublicDealPreview } from "@/lib/search/dto";
import type { AlertCadence, SavedSearchFilters } from "@/lib/saves/filters";

export type SavedDealView = {
  id: string;
  dealId: string;
  createdAt: string;
  notes: string | null;
  preview: PublicDealPreview | null;
};

export type SavedSearchView = {
  id: string;
  name: string;
  alertCadence: AlertCadence;
  enabled: boolean;
  filters: SavedSearchFilters;
  createdAt: string;
  lastEvaluatedAt: string | null;
};
