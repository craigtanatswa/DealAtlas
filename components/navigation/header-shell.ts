export const HEADER_BAR_CLASS =
  "sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md";

export const HEADER_BAR_INNER_CLASS =
  "mx-auto flex h-16 w-full max-w-[80rem] flex-nowrap items-center gap-x-3 px-4 sm:px-6 xl:gap-x-5 xl:px-8";

export const HEADER_BRAND_CLASS = "shrink-0";

/** Desktop search. Hidden until the lockup, links and actions fit on one row. */
export const HEADER_SEARCH_CLASS =
  "hidden min-w-0 w-48 max-w-xs flex-1 xl:block";

/** Workspace links need the wider row, so search returns at 1440px. */
export const HEADER_SEARCH_APP_CLASS =
  "hidden min-w-0 w-40 max-w-[14rem] flex-1 min-[1440px]:block";

export const HEADER_NAV_CLASS =
  "hidden shrink-0 items-center justify-center gap-x-7 whitespace-nowrap xl:flex";

export const HEADER_NAV_APP_CLASS =
  "hidden shrink-0 items-center justify-center gap-x-4 whitespace-nowrap min-[1440px]:flex";

export const HEADER_ACTIONS_CLASS =
  "hidden shrink-0 items-center gap-x-3 whitespace-nowrap xl:flex";

export const HEADER_ACTIONS_APP_CLASS =
  "hidden shrink-0 items-center whitespace-nowrap min-[1440px]:flex";

export const HEADER_MOBILE_CLASS = "ml-auto shrink-0 xl:hidden";

export const HEADER_MOBILE_APP_CLASS = "ml-auto shrink-0 min-[1440px]:hidden";
