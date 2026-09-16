export type E2EAccount = {
  id: string;
  email: string;
  password: string;
};

export type E2ESeed = {
  suffix: string;
  searchToken: string;
  previewTitle: string;
  publishedDealId: string;
  publishedSlug: string;
  xssDealId: string;
  xssSlug: string;
  unpublishedDealId: string;
  organizationId: string;
  sourceId: string;
  free: E2EAccount;
  pro: E2EAccount;
  admin: E2EAccount;
};
