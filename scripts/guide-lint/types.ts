/** One lint failure. Every failure names a file, a 1-based line and a rule id. */
export type GuideLintFailure = {
  file: string;
  line: number;
  rule: string;
  message: string;
};

export type RouteTable = {
  /** Static routes from the app/ tree, e.g. "/pricing". Route groups are removed. */
  staticRoutes: Set<string>;
  /** Dynamic route patterns from the app/ tree, e.g. ["categories", "[slug]"]. */
  dynamicRoutes: string[][];
  /** Known values for a dynamic route, keyed by its pattern ("/categories/[slug]"). */
  dynamicParams: Map<string, Set<string>>;
};

export type GuideLintContext = {
  /** Slugs of guides with `published: true` in the guides directory. */
  publishedGuideSlugs: Set<string>;
  routes: RouteTable;
  /** Buyer names that must never appear in a guide. See BUYER_NAME_DENYLIST. */
  buyerDenylist: readonly string[];
};

/** A markdown body line with its 1-based line number in the source file. */
export type SourceLine = { line: number; text: string };
