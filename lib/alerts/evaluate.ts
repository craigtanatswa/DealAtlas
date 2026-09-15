import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/db/database.types";
import { throwIfQueryError } from "@/lib/db/errors";
import { DEAL_PREVIEW_PUBLIC_SELECT } from "@/lib/db/preview-columns";
import { isProEntitlement } from "@/lib/entitlements/policy";
import { getCurrentEntitlement } from "@/lib/entitlements/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseSavedSearchFilters, type SavedSearchFilters } from "@/lib/saves/filters";
import { toAlertDto } from "@/lib/alerts/dto";
import { isDigestDue, shouldEvaluateSavedSearch } from "@/lib/alerts/dedupe";
import { NEW_MATCH_MIN_SCORE } from "@/lib/alerts/dedupe";
import {
  planAlertsForUser,
  type AlertDealContext,
  type ChangeCandidate,
  type DateCandidate,
  type MatchCandidate,
  type PlannedAlert,
} from "@/lib/alerts/plan";
import type {
  AlertRecord,
  AlertType,
  DigestCadence,
  NotificationPreferences,
} from "@/lib/alerts/types";
import { DIGEST_CADENCES } from "@/lib/alerts/types";
import { renderAlertDigest } from "@/lib/email/render";
import { createEmailSender, type EmailSender } from "@/lib/email/send";
import { getPublicEnv } from "@/lib/env/public";
import { errorMessage, structuredLog } from "@/lib/observability/log";
import { createErrorReporter, type ErrorReporter } from "@/lib/monitoring";

type AdminClient = SupabaseClient<Database>;

const MATCH_LOOKBACK_MS = 72 * 60 * 60 * 1000;
const CHANGE_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_PREVIEW_LIMIT = 400;
const ALERT_INSERT_CHUNK = 50;

type PrefRow = {
  user_id: string;
  email_enabled: boolean;
  new_match_enabled: boolean;
  deal_change_enabled: boolean;
  deadline_enabled: boolean;
  renewal_enabled: boolean;
  digest_cadence: string;
  last_digest_sent_at: string | null;
};

type SavedDealRow = { user_id: string; deal_id: string };
type ProfileRow = { id: string; user_id: string };
type SavedSearchRow = {
  id: string;
  user_id: string;
  name: string;
  filters: Json;
  alert_cadence: string;
  enabled: boolean;
  last_evaluated_at: string | null;
};

type PreviewRow = {
  deal_id: string;
  slug: string;
  preview_title: string;
  preview_summary: string;
  main_category: string | null;
  broad_region: string | null;
  value_band: string | null;
  deadline_band: string | null;
  deal_type: string | null;
  buyer_sector: string | null;
  status: string | null;
  updated_at: string;
};

function asPrefs(row: PrefRow): NotificationPreferences {
  const cadence = DIGEST_CADENCES.includes(row.digest_cadence as DigestCadence)
    ? (row.digest_cadence as DigestCadence)
    : "DAILY";
  return {
    emailEnabled: row.email_enabled,
    newMatchEnabled: row.new_match_enabled,
    dealChangeEnabled: row.deal_change_enabled,
    deadlineEnabled: row.deadline_enabled,
    renewalEnabled: row.renewal_enabled,
    digestCadence: cadence,
    lastDigestSentAt: row.last_digest_sent_at,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function previewMatchesFilters(
  preview: PreviewRow,
  filters: SavedSearchFilters,
): boolean {
  if (filters.buyerSector && preview.buyer_sector !== filters.buyerSector) {
    return false;
  }
  if (filters.region && preview.broad_region !== filters.region) {
    return false;
  }
  if (filters.valueBand && preview.value_band !== filters.valueBand) {
    return false;
  }
  if (filters.deadlineBand && preview.deadline_band !== filters.deadlineBand) {
    return false;
  }
  if (filters.dealType && preview.deal_type !== filters.dealType) {
    return false;
  }
  if (filters.status && preview.status !== filters.status) {
    return false;
  }
  if (filters.query) {
    const haystack =
      `${preview.preview_title} ${preview.preview_summary} ${preview.main_category ?? ""}`.toLowerCase();
    if (!haystack.includes(filters.query.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function contextFromPreview(row: PreviewRow): AlertDealContext {
  return {
    dealId: row.deal_id,
    previewTitle: row.preview_title,
    previewSummary: row.preview_summary,
    deadlineBand: row.deadline_band,
    valueBand: row.value_band,
    category: row.main_category,
    region: row.broad_region,
    slug: row.slug,
  };
}

async function insertPlannedAlerts(
  admin: AdminClient,
  alerts: PlannedAlert[],
): Promise<{ created: number; duplicates: number }> {
  let created = 0;
  let duplicates = 0;
  for (const group of chunk(alerts, ALERT_INSERT_CHUNK)) {
    const { error } = await admin.from("alerts").insert(
      group.map((alert) => ({
        user_id: alert.userId,
        deal_id: alert.dealId,
        alert_type: alert.alertType,
        status: "UNREAD" as const,
        title: alert.title,
        message: alert.message,
        protected_payload: alert.protectedPayload as Json,
        dedupe_key: alert.dedupeKey,
      })),
    );
    if (!error) {
      created += group.length;
      continue;
    }
    if (error.code === "23505") {
      for (const alert of group) {
        const { error: oneError } = await admin.from("alerts").insert({
          user_id: alert.userId,
          deal_id: alert.dealId,
          alert_type: alert.alertType,
          status: "UNREAD",
          title: alert.title,
          message: alert.message,
          protected_payload: alert.protectedPayload as Json,
          dedupe_key: alert.dedupeKey,
        });
        if (!oneError) {
          created += 1;
        } else if (oneError.code === "23505") {
          duplicates += 1;
        } else {
          throwIfQueryError("Failed to insert alert", { data: true, error: oneError });
        }
      }
      continue;
    }
    throwIfQueryError("Failed to insert alerts", { data: true, error });
  }
  return { created, duplicates };
}

async function loadCanonicalContext(
  admin: AdminClient,
  dealIds: string[],
): Promise<Map<string, AlertDealContext>> {
  const contexts = new Map<string, AlertDealContext>();
  if (dealIds.length === 0) {
    return contexts;
  }
  for (const ids of chunk(dealIds, 100)) {
    const { data: previews, error: previewError } = await admin
      .from("deal_previews")
      .select(DEAL_PREVIEW_PUBLIC_SELECT)
      .in("deal_id", ids);
    const previewRows = throwIfQueryError("Failed to load alert preview context", {
      data: (previews as PreviewRow[] | null) ?? [],
      error: previewError,
    });
    for (const row of previewRows) {
      contexts.set(row.deal_id, contextFromPreview(row));
    }

    const { data: deals, error: dealError } = await admin
      .from("deals")
      .select(
        "id, source_title, reference, source_url, application_url, submission_deadline, exact_value_text, estimated_renewal_date, buyer_organization_id",
      )
      .in("id", ids);
    const dealRows = throwIfQueryError("Failed to load alert deal context", {
      data: deals ?? [],
      error: dealError,
    });
    const orgIds = dealRows
      .map((row) => row.buyer_organization_id)
      .filter((id): id is string => Boolean(id));
    const orgNames = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs, error: orgError } = await admin
        .from("organizations")
        .select("id, canonical_name")
        .in("id", orgIds);
      const orgRows = throwIfQueryError("Failed to load alert buyer context", {
        data: orgs ?? [],
        error: orgError,
      });
      for (const org of orgRows) {
        orgNames.set(org.id, org.canonical_name);
      }
    }
    for (const deal of dealRows) {
      const current = contexts.get(deal.id) ?? { dealId: deal.id };
      contexts.set(deal.id, {
        ...current,
        dealId: deal.id,
        sourceTitle: deal.source_title ?? current.sourceTitle,
        reference: deal.reference,
        sourceUrl: deal.source_url,
        applicationUrl: deal.application_url,
        exactDeadline: deal.submission_deadline,
        exactValue: deal.exact_value_text,
        estimatedRenewalDate: deal.estimated_renewal_date,
        buyerName: deal.buyer_organization_id
          ? orgNames.get(deal.buyer_organization_id)
          : current.buyerName,
      });
    }
  }
  return contexts;
}

export async function evaluateAlerts(options?: {
  admin?: AdminClient;
  now?: Date;
  sender?: EmailSender;
  appUrl?: string;
  dryRun?: boolean;
  reporter?: ErrorReporter;
}): Promise<{
  created: number;
  duplicates: number;
  digested: number;
  deliveryFailures: number;
  planned: number;
  dryRun: boolean;
}> {
  const admin = options?.admin ?? createSupabaseAdminClient();
  const now = options?.now ?? new Date();
  const matchSince = new Date(now.getTime() - MATCH_LOOKBACK_MS).toISOString();
  const changeSince = new Date(now.getTime() - CHANGE_LOOKBACK_MS).toISOString();

  const { data: prefData, error: prefError } = await admin
    .from("notification_preferences")
    .select(
      "user_id, email_enabled, new_match_enabled, deal_change_enabled, deadline_enabled, renewal_enabled, digest_cadence, last_digest_sent_at",
    );
  const prefs = throwIfQueryError("Failed to load notification preferences", {
    data: (prefData as PrefRow[] | null) ?? [],
    error: prefError,
  });
  if (prefs.length === 0) {
    return {
      created: 0,
      duplicates: 0,
      digested: 0,
      deliveryFailures: 0,
      planned: 0,
      dryRun: Boolean(options?.dryRun),
    };
  }

  const { data: savedDealData, error: savedDealError } = await admin
    .from("saved_deals")
    .select("user_id, deal_id");
  const savedDeals = throwIfQueryError("Failed to load saved deals for alerts", {
    data: (savedDealData as SavedDealRow[] | null) ?? [],
    error: savedDealError,
  });

  const { data: profileData, error: profileError } = await admin
    .from("company_profiles")
    .select("id, user_id");
  const profiles = throwIfQueryError("Failed to load company profiles for alerts", {
    data: (profileData as ProfileRow[] | null) ?? [],
    error: profileError,
  });

  const { data: searchData, error: searchError } = await admin
    .from("saved_searches")
    .select("id, user_id, name, filters, alert_cadence, enabled, last_evaluated_at");
  const savedSearches = throwIfQueryError("Failed to load saved searches for alerts", {
    data: (searchData as SavedSearchRow[] | null) ?? [],
    error: searchError,
  });

  const profileIdToUser = new Map<string, string>();
  for (const profile of profiles) {
    profileIdToUser.set(profile.id, profile.user_id);
  }

  const matchesByUser = new Map<string, MatchCandidate[]>();
  const profileIds = profiles.map((profile) => profile.id);
  for (const ids of chunk(profileIds, 50)) {
    if (ids.length === 0) {
      break;
    }
    const { data, error } = await admin
      .from("deal_matches")
      .select("company_profile_id, deal_id, relevance_score, calculated_at")
      .in("company_profile_id", ids)
      .gte("relevance_score", NEW_MATCH_MIN_SCORE)
      .gte("calculated_at", matchSince);
    const rows = throwIfQueryError("Failed to load recent deal matches", {
      data: data ?? [],
      error,
    });
    for (const row of rows) {
      const userId = profileIdToUser.get(row.company_profile_id);
      if (!userId) {
        continue;
      }
      const list = matchesByUser.get(userId) ?? [];
      list.push({
        dealId: row.deal_id,
        score: Number(row.relevance_score),
      });
      matchesByUser.set(userId, list);
    }
  }

  const { data: recentPreviews, error: recentError } = await admin
    .from("deal_previews")
    .select(
      "deal_id, slug, preview_title, preview_summary, main_category, broad_region, value_band, deadline_band, deal_type, buyer_sector, status, updated_at",
    )
    .eq("is_published", true)
    .eq("leakage_risk", "LOW")
    .gte("updated_at", matchSince)
    .order("updated_at", { ascending: false })
    .limit(RECENT_PREVIEW_LIMIT);
  const recent = throwIfQueryError("Failed to load recent previews for saved searches", {
    data: (recentPreviews as PreviewRow[] | null) ?? [],
    error: recentError,
  });

  const searchesToMark: string[] = [];
  for (const search of savedSearches) {
    const cadence = search.alert_cadence;
    const alertCadence =
      cadence === "NONE" || cadence === "IMMEDIATE" || cadence === "DAILY" || cadence === "WEEKLY"
        ? cadence
        : "WEEKLY";
    if (
      !shouldEvaluateSavedSearch(
        {
          enabled: search.enabled,
          alertCadence,
          lastEvaluatedAt: search.last_evaluated_at,
        },
        now,
      )
    ) {
      continue;
    }
    searchesToMark.push(search.id);
    const filters = parseSavedSearchFilters(search.filters);
    const since = search.last_evaluated_at ?? matchSince;
    const hits = recent.filter((preview) => {
      if (preview.updated_at < since || !previewMatchesFilters(preview, filters)) {
        return false;
      }
      if (filters.minScore == null) {
        return true;
      }
      const scored = (matchesByUser.get(search.user_id) ?? []).find(
        (match) => match.dealId === preview.deal_id,
      );
      return (scored?.score ?? 0) >= filters.minScore;
    });
    const list = matchesByUser.get(search.user_id) ?? [];
    for (const hit of hits) {
      list.push({
        dealId: hit.deal_id,
        score: 100,
        savedSearchId: search.id,
        savedSearchName: search.name,
      });
    }
    matchesByUser.set(search.user_id, list);
  }

  if (searchesToMark.length > 0) {
    const { error } = await admin
      .from("saved_searches")
      .update({ last_evaluated_at: now.toISOString() })
      .in("id", searchesToMark);
    throwIfQueryError("Failed to mark saved searches evaluated", {
      data: true,
      error,
    });
  }

  const savedByUser = new Map<string, string[]>();
  for (const row of savedDeals) {
    const list = savedByUser.get(row.user_id) ?? [];
    list.push(row.deal_id);
    savedByUser.set(row.user_id, list);
  }

  const watchedDealIds = [...new Set(savedDeals.map((row) => row.deal_id))];
  const changesByDeal = new Map<string, ChangeCandidate[]>();
  for (const ids of chunk(watchedDealIds, 100)) {
    if (ids.length === 0) {
      break;
    }
    const { data, error } = await admin
      .from("data_changes")
      .select("id, deal_id, change_type, field_name, occurred_at")
      .in("deal_id", ids)
      .eq("material", true)
      .gte("occurred_at", changeSince);
    const rows = throwIfQueryError("Failed to load material deal changes", {
      data: data ?? [],
      error,
    });
    for (const row of rows) {
      const list = changesByDeal.get(row.deal_id) ?? [];
      list.push({
        changeId: row.id,
        dealId: row.deal_id,
        changeType: row.change_type,
        fieldName: row.field_name,
      });
      changesByDeal.set(row.deal_id, list);
    }
  }

  const deadlinesByDeal = new Map<string, DateCandidate>();
  const renewalsByDeal = new Map<string, DateCandidate[]>();
  for (const ids of chunk(watchedDealIds, 100)) {
    if (ids.length === 0) {
      break;
    }
    const { data: deals, error: dealError } = await admin
      .from("deals")
      .select("id, submission_deadline, estimated_renewal_date")
      .in("id", ids);
    const dealRows = throwIfQueryError("Failed to load deadline fields", {
      data: deals ?? [],
      error: dealError,
    });
    for (const deal of dealRows) {
      if (deal.submission_deadline) {
        deadlinesByDeal.set(deal.id, {
          dealId: deal.id,
          isoDate: deal.submission_deadline,
        });
      }
      if (deal.estimated_renewal_date) {
        const list = renewalsByDeal.get(deal.id) ?? [];
        list.push({ dealId: deal.id, isoDate: deal.estimated_renewal_date });
        renewalsByDeal.set(deal.id, list);
      }
    }

    const { data: insights, error: insightError } = await admin
      .from("deal_insights")
      .select("deal_id, estimated_renewal_date")
      .in("deal_id", ids)
      .not("estimated_renewal_date", "is", null);
    const insightRows = throwIfQueryError("Failed to load renewal insights", {
      data: insights ?? [],
      error: insightError,
    });
    for (const row of insightRows) {
      if (!row.estimated_renewal_date) {
        continue;
      }
      const list = renewalsByDeal.get(row.deal_id) ?? [];
      list.push({ dealId: row.deal_id, isoDate: row.estimated_renewal_date });
      renewalsByDeal.set(row.deal_id, list);
    }

    const { data: contracts, error: contractError } = await admin
      .from("contracts")
      .select("deal_id, end_date, extension_end_date")
      .in("deal_id", ids);
    const contractRows = throwIfQueryError("Failed to load contract renewal dates", {
      data: contracts ?? [],
      error: contractError,
    });
    for (const row of contractRows) {
      const iso = row.extension_end_date ?? row.end_date;
      if (!iso) {
        continue;
      }
      const list = renewalsByDeal.get(row.deal_id) ?? [];
      list.push({ dealId: row.deal_id, isoDate: iso });
      renewalsByDeal.set(row.deal_id, list);
    }
  }

  const planned: PlannedAlert[] = [];
  const dealIdsNeeded = new Set<string>();

  for (const pref of prefs) {
    const userMatches = matchesByUser.get(pref.user_id) ?? [];
    const userSaved = savedByUser.get(pref.user_id) ?? [];
    const userChanges: ChangeCandidate[] = [];
    const userDeadlines: DateCandidate[] = [];
    const userRenewals: DateCandidate[] = [];
    for (const dealId of userSaved) {
      userChanges.push(...(changesByDeal.get(dealId) ?? []));
      const deadline = deadlinesByDeal.get(dealId);
      if (deadline) {
        userDeadlines.push(deadline);
      }
      userRenewals.push(...(renewalsByDeal.get(dealId) ?? []));
    }
    for (const match of userMatches) {
      dealIdsNeeded.add(match.dealId);
    }
    for (const change of userChanges) {
      dealIdsNeeded.add(change.dealId);
    }
    for (const deadline of userDeadlines) {
      dealIdsNeeded.add(deadline.dealId);
    }
    for (const renewal of userRenewals) {
      dealIdsNeeded.add(renewal.dealId);
    }
    void userMatches;
  }

  const contexts = await loadCanonicalContext(admin, [...dealIdsNeeded]);

  for (const pref of prefs) {
    const userMatches = matchesByUser.get(pref.user_id) ?? [];
    const userSaved = savedByUser.get(pref.user_id) ?? [];
    const userChanges: ChangeCandidate[] = [];
    const userDeadlines: DateCandidate[] = [];
    const userRenewals: DateCandidate[] = [];
    for (const dealId of userSaved) {
      userChanges.push(...(changesByDeal.get(dealId) ?? []));
      const deadline = deadlinesByDeal.get(dealId);
      if (deadline) {
        userDeadlines.push(deadline);
      }
      userRenewals.push(...(renewalsByDeal.get(dealId) ?? []));
    }
    planned.push(
      ...planAlertsForUser({
        userId: pref.user_id,
        prefs: asPrefs(pref),
        matches: userMatches,
        changes: userChanges,
        deadlines: userDeadlines,
        renewals: userRenewals,
        contexts,
        now,
      }),
    );
  }

  if (options?.dryRun) {
    return {
      created: 0,
      duplicates: 0,
      digested: 0,
      deliveryFailures: 0,
      planned: planned.length,
      dryRun: true,
    };
  }

  const insertResult = await insertPlannedAlerts(admin, planned);
  const delivery = await sendDueDigests({
    admin,
    prefs,
    now,
    sender: options?.sender,
    appUrl: options?.appUrl,
    reporter: options?.reporter,
  });

  return {
    ...insertResult,
    digested: delivery.digested,
    deliveryFailures: delivery.failures,
    planned: planned.length,
    dryRun: false,
  };
}

async function sendDueDigests(input: {
  admin: AdminClient;
  prefs: PrefRow[];
  now: Date;
  sender?: EmailSender;
  appUrl?: string;
  reporter?: ErrorReporter;
}): Promise<{ digested: number; failures: number }> {
  const sender = input.sender ?? createEmailSender();
  const reporter = input.reporter ?? createErrorReporter();
  const appUrl = input.appUrl ?? getPublicEnv().NEXT_PUBLIC_APP_URL;
  let digested = 0;
  let failures = 0;

  for (const pref of input.prefs) {
    if (!pref.email_enabled) {
      continue;
    }
    const { data, error } = await input.admin
      .from("alerts")
      .select(
        "id, user_id, deal_id, alert_type, status, title, message, protected_payload, created_at, read_at, sent_at, dedupe_key",
      )
      .eq("user_id", pref.user_id)
      .is("sent_at", null)
      .order("created_at", { ascending: false })
      .limit(40);
    const rows = throwIfQueryError("Failed to load unsent alerts", {
      data: (data as AlertRecord[] | null) ?? [],
      error,
    });
    const cadence = DIGEST_CADENCES.includes(pref.digest_cadence as DigestCadence)
      ? (pref.digest_cadence as DigestCadence)
      : "DAILY";
    if (!isDigestDue(cadence, pref.last_digest_sent_at, input.now, rows.length)) {
      continue;
    }

    const { data: profile, error: profileError } = await input.admin
      .from("profiles")
      .select("email")
      .eq("id", pref.user_id)
      .maybeSingle();
    const profileRow = throwIfQueryError("Failed to load digest recipient", {
      data: profile,
      error: profileError,
    });
    if (!profileRow?.email) {
      continue;
    }

    const { data: authUser, error: authError } =
      await input.admin.auth.admin.getUserById(pref.user_id);
    if (authError || !authUser.user?.email_confirmed_at) {
      continue;
    }

    const entitlement = await getCurrentEntitlement(pref.user_id, input.now);
    const dtos = rows.map((row) => toAlertDto(row, entitlement));
    if (!isProEntitlement(entitlement)) {
      for (const dto of dtos) {
        delete dto.sourceTitle;
        delete dto.buyerName;
        delete dto.sourceUrl;
        delete dto.applicationUrl;
        delete dto.reference;
        delete dto.exactDeadline;
        delete dto.exactValue;
        delete dto.changeType;
        delete dto.renewalDate;
      }
    }

    const rendered = renderAlertDigest({
      plan: entitlement.plan,
      alerts: dtos,
      appUrl,
    });

    try {
      await sender.send({
        to: profileRow.email,
        ...rendered,
      });
    } catch (error) {
      failures += 1;
      structuredLog({
        job: "alerts",
        msg: "alert_delivery_failed",
        level: "error",
        error: errorMessage(error),
      });
      await reporter.captureException(error, { job: "alerts" });
      continue;
    }

    const ids = rows.map((row) => row.id);
    const sentAt = input.now.toISOString();
    const { error: sentError } = await input.admin
      .from("alerts")
      .update({ sent_at: sentAt })
      .in("id", ids)
      .eq("user_id", pref.user_id);
    throwIfQueryError("Failed to mark alerts sent", { data: true, error: sentError });

    const { error: digestError } = await input.admin
      .from("notification_preferences")
      .update({ last_digest_sent_at: sentAt })
      .eq("user_id", pref.user_id);
    throwIfQueryError("Failed to mark digest sent", { data: true, error: digestError });
    digested += 1;
  }

  return { digested, failures };
}

export type { AlertType };
