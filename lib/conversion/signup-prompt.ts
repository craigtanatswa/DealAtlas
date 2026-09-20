export const SIGNUP_PROMPT_DELAY_MS = 60_000;
export const SIGNUP_PROMPT_STORAGE_KEY = "dealatlas.signup-prompt.v1";

export type SignupPromptState = {
  elapsedMs: number;
  dismissed: boolean;
};

export function parseSignupPromptState(raw: string | null): SignupPromptState {
  if (!raw) {
    return { elapsedMs: 0, dismissed: false };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SignupPromptState>;
    return {
      elapsedMs:
        typeof parsed.elapsedMs === "number" && Number.isFinite(parsed.elapsedMs)
          ? Math.max(0, parsed.elapsedMs)
          : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return { elapsedMs: 0, dismissed: false };
  }
}

export function shouldOpenSignupPrompt(state: SignupPromptState): boolean {
  return !state.dismissed && state.elapsedMs >= SIGNUP_PROMPT_DELAY_MS;
}

export function accumulateVisibleTime(
  state: SignupPromptState,
  deltaMs: number,
  visible: boolean,
): SignupPromptState {
  if (state.dismissed || !visible || deltaMs <= 0) {
    return state;
  }

  return {
    ...state,
    elapsedMs: state.elapsedMs + deltaMs,
  };
}
