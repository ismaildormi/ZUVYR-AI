-- ZUVYR V1 quality hardening — financial balance invariants.
-- This is not a new product PACK. It hardens the canonical credit ledger
-- against future service-role bugs or migrations that bypass gatekeeper.js.

-- Fail closed instead of silently rewriting unexpected production data.
do $$
begin
  if exists (
    select 1
    from public.profiles
    where credits_total is null
       or credits_used is null
       or credits_total < 0
       or credits_used < 0
       or credits_used > credits_total
  ) then
    raise exception 'zuvyr_credit_balance_invariant_preflight_failed';
  end if;
end
$$;

alter table public.profiles
  alter column credits_total set not null,
  alter column credits_used set not null;

alter table public.profiles
  drop constraint if exists profiles_zuvyr_credit_balance_valid;

alter table public.profiles
  add constraint profiles_zuvyr_credit_balance_valid
  check (
    credits_total >= 0
    and credits_used >= 0
    and credits_used <= credits_total
  );

comment on constraint profiles_zuvyr_credit_balance_valid on public.profiles is
  'V1 financial invariant: total/used credits are nonnegative and usage cannot exceed the funded credit total.';
