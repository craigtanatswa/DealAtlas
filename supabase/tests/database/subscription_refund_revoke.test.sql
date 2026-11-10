-- Refund/chargeback revocation for Pro subscriptions. Synthetic users only.
begin;
select no_plan();

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'sub-revoke-1@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'sub-revoke-2@example.test'),
  ('b1000000-0000-4000-8000-000000000003', 'sub-revoke-3@example.test');

insert into public.subscriptions (
  user_id,
  dodo_customer_id,
  dodo_subscription_id,
  dodo_product_id,
  plan_key,
  status,
  billing_interval,
  current_period_start,
  current_period_end,
  recurring_amount,
  recurring_currency,
  is_current
) values
  (
    'b1000000-0000-4000-8000-000000000001',
    'cus_sub_revoke_1',
    'sub_sub_revoke_1',
    'pdt_pro_monthly',
    'PRO_MONTHLY',
    'ACTIVE',
    'MONTHLY',
    now() - interval '1 day',
    now() + interval '30 days',
    3900,
    'GBP',
    true
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'cus_sub_revoke_2',
    'sub_sub_revoke_2',
    'pdt_pro_annual',
    'PRO_ANNUAL',
    'ACTIVE',
    'ANNUAL',
    now() - interval '1 day',
    now() + interval '300 days',
    35000,
    'GBP',
    true
  );

select is(
  private.is_user_pro('b1000000-0000-4000-8000-000000000001'),
  true,
  'an active paid-through subscription is Pro'
);
select is(
  (select recurring_amount from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  3900::bigint,
  'the subscription stores its recurring amount for refund classification'
);

select is(
  public.revoke_subscription_access(
    'evt_sub_refund_1',
    'sub_sub_revoke_1',
    null,
    'refund'
  ),
  'revoked',
  'a full refund revokes the subscription locally'
);
select is(
  (select status from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  'EXPIRED',
  'the revoked subscription status is EXPIRED'
);
select is(
  (select revoked_at is not null from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  true,
  'the revoked marker is durable'
);
select is(
  (select revoke_reason from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  'refund',
  'the revoke reason is recorded'
);
select is(
  private.is_user_pro('b1000000-0000-4000-8000-000000000001'),
  false,
  'a revoked subscription is no longer Pro even with a future period end'
);
select is(
  public.revoke_subscription_access('evt_sub_refund_1_replay', 'sub_sub_revoke_1', null, 'refund'),
  'already_revoked',
  'a replayed reversal is idempotent'
);
select is(
  public.revoke_subscription_access('evt_sub_refund_unknown', 'sub_unknown', null, 'refund'),
  'not_found',
  'a reversal for an unknown subscription is not found'
);
select is(
  public.revoke_subscription_access('evt_sub_refund_invalid', null, null, 'refund'),
  'invalid',
  'a reversal with no subscription or customer id is invalid'
);

-- Late provider events cannot clear the marker or re-grant Pro.
update public.subscriptions
set status = 'ACTIVE',
    revoked_at = null,
    revoke_reason = null,
    current_period_end = now() + interval '60 days'
where dodo_subscription_id = 'sub_sub_revoke_1';

select is(
  (select status from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  'EXPIRED',
  'the trigger forces a revoked row back to EXPIRED'
);
select is(
  (select revoked_at is not null from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_1'),
  true,
  'the trigger restores the revoked marker'
);
select is(
  private.is_user_pro('b1000000-0000-4000-8000-000000000001'),
  false,
  'a late provider event cannot re-grant Pro'
);

-- A customer-id fallback works when the refund payload has no subscription id.
select is(
  public.revoke_subscription_access('evt_sub_dispute_2', null, 'cus_sub_revoke_2', 'dispute'),
  'revoked',
  'a lost dispute can revoke by current customer id'
);
select is(
  (select revoke_reason from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_2'),
  'dispute',
  'the dispute revoke reason is recorded'
);
select is(
  private.is_user_pro('b1000000-0000-4000-8000-000000000002'),
  false,
  'the disputed subscription is not Pro'
);

-- Re-subscribing with a new provider subscription id is not blocked by the old revoked row.
update public.subscriptions
set is_current = false
where user_id = 'b1000000-0000-4000-8000-000000000002';

insert into public.subscriptions (
  user_id,
  dodo_customer_id,
  dodo_subscription_id,
  dodo_product_id,
  plan_key,
  status,
  billing_interval,
  current_period_start,
  current_period_end,
  recurring_amount,
  recurring_currency,
  is_current
) values (
  'b1000000-0000-4000-8000-000000000002',
  'cus_sub_revoke_2',
  'sub_sub_revoke_2_new',
  'pdt_pro_annual',
  'PRO_ANNUAL',
  'ACTIVE',
  'ANNUAL',
  now(),
  now() + interval '365 days',
  35000,
  'GBP',
  true
);

select is(
  private.is_user_pro('b1000000-0000-4000-8000-000000000002'),
  true,
  'a brand-new subscription after a revoke grants Pro again'
);
select is(
  (select revoked_at is not null from public.subscriptions where dodo_subscription_id = 'sub_sub_revoke_2'),
  true,
  'the old revoked subscription stays terminal'
);

select ok(
  not has_function_privilege('anon', 'public.revoke_subscription_access(text, text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_subscription_access(text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'private.protect_revoked_subscription()', 'execute')
  and not has_function_privilege('authenticated', 'private.protect_revoked_subscription()', 'execute'),
  'clients cannot invoke subscription revocation or the protection trigger'
);
select ok(
  has_function_privilege('service_role', 'public.revoke_subscription_access(text, text, text, text)', 'execute'),
  'service_role can revoke subscriptions'
);

select * from finish();
rollback;
