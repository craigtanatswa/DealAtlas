/**
 * Back from checkout (?upgraded=1) and the server entitlement is not Pro yet.
 * Display only: Pro access still comes only from the webhook-backed entitlement.
 * A Pro user never sees the pending state.
 */
export function paymentPendingFor(input: {
  signedIn: boolean;
  upgraded: boolean;
  isPro: boolean;
}): boolean {
  return input.signedIn && input.upgraded && !input.isPro;
}
