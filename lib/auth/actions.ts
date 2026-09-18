"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AUTH_HOME_PATH,
  VERIFY_EMAIL_PATH,
  sanitizeRedirectPath,
} from "@/lib/auth/redirect";
import {
  companyProfileSchema,
  displayNameSchema,
  forgotPasswordSchema,
  loginSchema,
  parseBuyerSectors,
  parseDelimitedList,
  parseAllowedList,
  parseOptionalNumber,
  resetPasswordSchema,
  signupFormSchema,
} from "@/lib/auth/schemas";
import { getProfileForUser } from "@/lib/auth/profile";
import { getAuthUser } from "@/lib/auth/session";
import { mapAuthError, type ActionState } from "@/lib/auth/messages";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_NEXT_COOKIE_MAX_AGE_SECONDS,
  PASSWORD_RESET_COOKIE,
} from "@/lib/auth/cookies";
import { authCallbackUrl, authCallbackUrlForRequest, authResetCallbackUrl } from "@/lib/auth/urls";
import { queueCompanyProfileMatches } from "@/lib/matching/recalculate";
import { parseInputSafe } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEAL_CATEGORY_SLUGS } from "@/lib/matching/categories";
import { UK_REGION_OPTIONS } from "@/lib/search/filters";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInputSafe(loginSchema, {
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password.", success: null };
  }

  const next = sanitizeRedirectPath(formString(formData, "next") || AUTH_HOME_PATH);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: mapAuthError(error), success: null };
  }

  const user = (await supabase.auth.getUser()).data.user;
  if (user) {
    await getProfileForUser(user);
  }

  redirect(next);
}

export async function signInWithGoogleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const next = sanitizeRedirectPath(formString(formData, "next") || AUTH_HOME_PATH);
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: OAUTH_NEXT_COOKIE_MAX_AGE_SECONDS,
  });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrlForRequest((await headers()).get("origin")),
      queryParams: {
        prompt: "select_account",
      },
    },
  });

  if (error || !data.url) {
    return { error: mapAuthError(error), success: null };
  }

  redirect(data.url);
}

export async function signUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInputSafe(signupFormSchema, {
    email: formString(formData, "email"),
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
    displayName: formString(formData, "displayName") || undefined,
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return {
      error: firstIssue ?? "Check your details and try again.",
      success: null,
    };
  }

  const next = sanitizeRedirectPath(formString(formData, "next") || AUTH_HOME_PATH);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: authCallbackUrl(),
      data: parsed.data.displayName
        ? { name: parsed.data.displayName }
        : {},
    },
  });

  if (error) {
    console.error("DealAtlas sign-up failed", error.code ?? "", error.message);
    return { error: mapAuthError(error), success: null };
  }

  if (data.user && data.session) {
    try {
      await getProfileForUser(data.user);
    } catch (cause) {
      console.error("DealAtlas profile load after sign-up failed", cause);
    }
    redirect(next);
  }

  const email = encodeURIComponent(parsed.data.email);
  redirect(`${VERIFY_EMAIL_PATH}?email=${email}`);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInputSafe(forgotPasswordSchema, {
    email: formString(formData, "email"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authResetCallbackUrl(),
  });

  if (error) {
    return { error: mapAuthError(error), success: null };
  }

  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RESET_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });

  return {
    error: null,
    success:
      "If an account exists for that email, we have sent a reset link. Check your inbox.",
  };
}

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    return {
      error: "That reset link is invalid or has expired. Request a new one.",
      success: null,
    };
  }

  const parsed = parseInputSafe(resetPasswordSchema, {
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return {
      error: firstIssue ?? "Check your new password and try again.",
      success: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: mapAuthError(error), success: null };
  }

  redirect(AUTH_HOME_PATH);
}

export async function resendVerificationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseInputSafe(forgotPasswordSchema, {
    email: formString(formData, "email"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo: authCallbackUrl(),
    },
  });

  if (error) {
    return { error: mapAuthError(error), success: null };
  }

  return {
    error: null,
    success: "If that email needs verification, we have sent a new link.",
  };
}

export async function updateDisplayNameAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = parseInputSafe(displayNameSchema, {
    displayName: formString(formData, "displayName"),
  });
  if (!parsed.success) {
    return { error: "Display name must be 80 characters or fewer.", success: null };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName || null })
    .eq("id", user.id);

  if (error) {
    return { error: "We could not update your display name.", success: null };
  }

  revalidatePath("/app/profile");
  return { error: null, success: "Display name saved." };
}

export async function saveCompanyProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getAuthUser();
  if (!user) {
    redirect("/login");
  }

  const parsed = parseInputSafe(companyProfileSchema, {
    company_name: formString(formData, "company_name") || null,
    company_description: formString(formData, "company_description") || null,
    company_size: formString(formData, "company_size") || null,
    products_services: parseDelimitedList(formData.get("products_services")),
    keywords: parseDelimitedList(formData.get("keywords")),
    negative_keywords: parseDelimitedList(formData.get("negative_keywords")),
    preferred_regions: parseAllowedList(formData, "preferred_regions", UK_REGION_OPTIONS),
    preferred_category_slugs: parseAllowedList(
      formData,
      "preferred_category_slugs",
      DEAL_CATEGORY_SLUGS,
    ),
    preferred_cpv_codes: parseDelimitedList(formData.get("preferred_cpv_codes")),
    certifications: parseDelimitedList(formData.get("certifications")),
    framework_memberships: parseDelimitedList(formData.get("framework_memberships")),
    preferred_buyer_sectors: parseBuyerSectors(formData),
    minimum_deal_value: parseOptionalNumber(formData.get("minimum_deal_value")),
    maximum_deal_value: parseOptionalNumber(formData.get("maximum_deal_value")),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return {
      error: firstIssue ?? "Check the company profile and try again.",
      success: null,
    };
  }

  const supabase = await createSupabaseServerClient();
  const existing = await supabase
    .from("company_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error) {
    return { error: "We could not load your company profile.", success: null };
  }

  let profileId = existing.data?.id ?? null;

  if (existing.data) {
    const { error } = await supabase
      .from("company_profiles")
      .update(parsed.data)
      .eq("user_id", user.id);
    if (error) {
      return { error: "We could not save your company profile.", success: null };
    }
  } else {
    const { data, error } = await supabase
      .from("company_profiles")
      .insert({
        ...parsed.data,
        user_id: user.id,
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return { error: "We could not save your company profile.", success: null };
    }
    profileId = data.id;
  }

  if (profileId) {
    await queueCompanyProfileMatches(profileId);
  }

  revalidatePath("/app/profile");
  revalidatePath("/app/search");
  revalidatePath("/deals");
  return { error: null, success: "Company profile saved. Relevance scores are updating." };
}
