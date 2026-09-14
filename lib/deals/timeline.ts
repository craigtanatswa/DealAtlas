export type PaidTimelineKind = "notice" | "deadline" | "lifecycle" | "change";

export type PaidTimelineEventDto = {
  id: string;
  occurredAt: string;
  label: string;
  kind: PaidTimelineKind;
  detail: string | null;
};

type TimelineInput = {
  firstPublishedAt: string | null;
  latestSourceAt: string | null;
  enquiryDeadline: string | null;
  submissionDeadline: string | null;
  awardDecisionDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  extensionEndDate: string | null;
  nextProcurementDate: string | null;
  estimatedRenewalDate: string | null;
  notices: Array<{
    id: string;
    noticeType: string | null;
    noticeStage: string | null;
    publishedAt: string | null;
    modifiedAt: string | null;
    isCurrentVersion: boolean;
  }>;
  changes: Array<{
    id: string;
    changeType: string;
    fieldName: string | null;
    occurredAt: string;
    material: boolean;
  }>;
};

function pushIfDate(
  events: PaidTimelineEventDto[],
  id: string,
  occurredAt: string | null,
  label: string,
  kind: PaidTimelineKind,
  detail: string | null = null,
) {
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    return;
  }
  events.push({ id, occurredAt, label, kind, detail });
}

function noticeLabel(notice: TimelineInput["notices"][number]): string {
  const type = notice.noticeType?.trim() || "Notice";
  const stage = notice.noticeStage?.trim();
  const current = notice.isCurrentVersion ? "current version" : "previous version";
  return stage ? `${type} (${stage}, ${current})` : `${type} (${current})`;
}

function changeLabel(change: TimelineInput["changes"][number]): string {
  const field = change.fieldName?.trim();
  const type = change.changeType.trim() || "Update";
  if (field) {
    return `${type}: ${field}`;
  }
  return type;
}

export function buildPaidTimeline(input: TimelineInput): PaidTimelineEventDto[] {
  const events: PaidTimelineEventDto[] = [];

  pushIfDate(
    events,
    "lifecycle:first-published",
    input.firstPublishedAt,
    "First published",
    "lifecycle",
  );
  pushIfDate(
    events,
    "lifecycle:latest-source",
    input.latestSourceAt,
    "Latest source update",
    "lifecycle",
  );
  pushIfDate(
    events,
    "deadline:enquiry",
    input.enquiryDeadline,
    "Enquiry deadline",
    "deadline",
  );
  pushIfDate(
    events,
    "deadline:submission",
    input.submissionDeadline,
    "Submission deadline",
    "deadline",
  );
  pushIfDate(
    events,
    "deadline:award",
    input.awardDecisionDate,
    "Award decision",
    "deadline",
  );
  pushIfDate(
    events,
    "lifecycle:contract-start",
    input.contractStartDate,
    "Contract start",
    "lifecycle",
  );
  pushIfDate(
    events,
    "lifecycle:contract-end",
    input.contractEndDate,
    "Contract end",
    "lifecycle",
  );
  pushIfDate(
    events,
    "lifecycle:extension-end",
    input.extensionEndDate,
    "Extension end",
    "lifecycle",
  );
  pushIfDate(
    events,
    "lifecycle:next-procurement",
    input.nextProcurementDate,
    "Next procurement",
    "lifecycle",
  );
  pushIfDate(
    events,
    "lifecycle:estimated-renewal",
    input.estimatedRenewalDate,
    "Estimated renewal",
    "lifecycle",
  );

  for (const notice of input.notices) {
    pushIfDate(
      events,
      `notice:${notice.id}:published`,
      notice.publishedAt,
      noticeLabel(notice),
      "notice",
    );
    if (notice.modifiedAt && notice.modifiedAt !== notice.publishedAt) {
      pushIfDate(
        events,
        `notice:${notice.id}:modified`,
        notice.modifiedAt,
        `${noticeLabel(notice)} updated`,
        "notice",
      );
    }
  }

  for (const change of input.changes) {
    pushIfDate(
      events,
      `change:${change.id}`,
      change.occurredAt,
      changeLabel(change),
      "change",
      change.material ? "Material change" : null,
    );
  }

  return events.sort((left, right) => {
    const delta = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    if (delta !== 0) {
      return delta;
    }
    return left.id.localeCompare(right.id);
  });
}
