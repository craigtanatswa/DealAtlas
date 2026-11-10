-- Lifetime grants replace the founding annual subscription. Synthetic users only.
begin;
select no_plan();

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'lifetime-1@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'lifetime-2@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'lifetime-3@example.test');

select is(
  public.grant_lifetime_access(
    'evt_lifetime_1',
    'pay_lifetime_1',
    'a1000000-0000-4000-8000-000000000001',
    'cus_lifetime_1',
    'pdt_lifetime_fixture',
    25000,
    'GBP'
  ),
  'granted',
  'a paid lifetime payment grants access'
);
select is(
  (select status from public.lifetime_grants where dodo_payment_id = 'pay_lifetime_1'),
  'active',
  'the grant is active'
);
select is(
  (select total_amount from public.lifetime_grants where dodo_payment_id = 'pay_lifetime_1'),
  25000::bigint,
  'the grant stores the paid total'
);
select is(
  (select currency from public.lifetime_grants where dodo_payment_id = 'pay_lifetime_1'),
  'GBP',
  'the grant stores the payment currency'
);
select is(
  (select status from private.founding_slots where user_id = 'a1000000-0000-4000-8000-000000000001'),
  'active',
  'a lifetime grant claims a founding place'
);
select is(
  (select founding_member from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  true,
  'a lifetime grant marks the profile as a founding member'
);
select is(
  private.is_user_pro('a1000000-0000-4000-8000-000000000001'),
  true,
  'an active lifetime grant is Pro without a subscription'
);

select is(
  public.grant_lifetime_access(
    'evt_lifetime_1_replay',
    'pay_lifetime_1',
    'a1000000-0000-4000-8000-000000000001',
    'cus_lifetime_1',
    'pdt_lifetime_fixture'
  ),
  'duplicate',
  'a replayed payment id does not grant twice'
);
select is(
  public.grant_lifetime_access(
    'evt_lifetime_second',
    'pay_lifetime_second',
    'a1000000-0000-4000-8000-000000000001',
    'cus_lifetime_1',
    'pdt_lifetime_fixture'
  ),
  'duplicate_user',
  'a user with an active lifetime grant cannot hold a second one'
);
select is(
  public.grant_lifetime_access(
    'evt_lifetime_bad',
    null,
    'a1000000-0000-4000-8000-000000000001',
    null,
    'pdt_lifetime_fixture'
  ),
  'invalid',
  'a missing payment id is invalid'
);

select is(
  public.revoke_lifetime_access('evt_refund_1', 'pay_lifetime_1', 'refund'),
  'revoked',
  'a refund revokes the grant'
);
select is(
  (select status from public.lifetime_grants where dodo_payment_id = 'pay_lifetime_1'),
  'revoked',
  'the grant row is revoked, not deleted'
);
select is(
  private.is_user_pro('a1000000-0000-4000-8000-000000000001'),
  false,
  'a revoked lifetime grant is no longer Pro'
);
select is(
  (select status from private.founding_slots where user_id = 'a1000000-0000-4000-8000-000000000001'),
  'ended',
  'a reversal ends the place without releasing it'
);
select is(
  (select founding_member from public.profiles where id = 'a1000000-0000-4000-8000-000000000001'),
  false,
  'a reversal clears founding member status'
);
select is(
  public.revoke_lifetime_access('evt_refund_1_replay', 'pay_lifetime_1', 'refund'),
  'already_revoked',
  'a replayed reversal is idempotent'
);
select is(
  public.grant_lifetime_access(
    'evt_lifetime_late',
    'pay_lifetime_1',
    'a1000000-0000-4000-8000-000000000001',
    'cus_lifetime_1',
    'pdt_lifetime_fixture'
  ),
  'duplicate',
  'a replayed grant after a reversal does not restore access'
);
select is(
  private.is_user_pro('a1000000-0000-4000-8000-000000000001'),
  false,
  'a replayed grant after a reversal stays not Pro'
);
select is(
  public.revoke_lifetime_access('evt_refund_unknown', 'pay_unknown', 'refund'),
  'not_found',
  'a reversal for an unknown payment is not found'
);

-- The 26th lifetime buyer is still granted even when the 25 places are used.
insert into auth.users (id, email)
select ('a2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'lifetime-cap-' || i::text || '@example.test'
from generate_series(1, 26) as i;

do $$
declare
  i integer;
  uid uuid;
begin
  for i in 1..25 loop
    uid := ('a2000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
    perform public.activate_founding_slot(uid);
  end loop;
end $$;

select is(
  public.grant_lifetime_access(
    'evt_lifetime_over_cap',
    'pay_lifetime_over_cap',
    'a2000000-0000-4000-8000-000000000026',
    'cus_lifetime_over_cap',
    'pdt_lifetime_fixture'
  ),
  'granted_over_cap',
  'an over-cap lifetime payment still grants access'
);
select is(
  (select count(*)::int from private.founding_slots
   where user_id = 'a2000000-0000-4000-8000-000000000026'),
  0,
  'an over-cap lifetime purchase does not take a slot'
);
select is(
  (select founding_member from public.profiles where id = 'a2000000-0000-4000-8000-000000000026'),
  true,
  'an over-cap lifetime purchase still marks the profile as a founding member'
);
select is(
  (select count(*)::int from private.founding_cap_fallbacks
   where user_id = 'a2000000-0000-4000-8000-000000000026'
     and provider_event_id = 'evt_lifetime_over_cap'),
  1,
  'an over-cap lifetime purchase records a cap fallback'
);
select is(
  private.is_user_pro('a2000000-0000-4000-8000-000000000026'),
  true,
  'an over-cap lifetime grant is Pro'
);

select ok(
  not has_function_privilege('anon', 'public.grant_lifetime_access(text, text, uuid, text, text, bigint, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.grant_lifetime_access(text, text, uuid, text, text, bigint, text)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_lifetime_access(text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.revoke_lifetime_access(text, text, text)', 'execute')
  and not has_table_privilege('anon', 'public.lifetime_grants', 'select')
  and not has_table_privilege('authenticated', 'public.lifetime_grants', 'select')
  and not has_table_privilege('anon', 'public.lifetime_grants', 'insert')
  and not has_table_privilege('anon', 'public.lifetime_grants', 'update')
  and not has_table_privilege('anon', 'public.lifetime_grants', 'delete')
  and not has_table_privilege('authenticated', 'public.lifetime_grants', 'insert')
  and not has_table_privilege('authenticated', 'public.lifetime_grants', 'update')
  and not has_table_privilege('authenticated', 'public.lifetime_grants', 'delete'),
  'clients cannot read, write or call the lifetime functions'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.lifetime_grants'::regclass),
  'RLS is enabled on public.lifetime_grants'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and tablename = 'lifetime_grants'
     and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  0,
  'no policy allows clients to write lifetime grants'
);
select ok(
  has_function_privilege('service_role', 'public.grant_lifetime_access(text, text, uuid, text, text, bigint, text)', 'execute')
  and has_function_privilege('service_role', 'public.revoke_lifetime_access(text, text, text)', 'execute')
  and has_table_privilege('service_role', 'public.lifetime_grants', 'select'),
  'service_role can apply and read lifetime grants'
);

select * from finish();
rollback;
