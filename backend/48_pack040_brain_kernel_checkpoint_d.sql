-- ZUVYR Pack040 — Brain + Kernel Checkpoint D
-- Binds exact Pack036 quote/consent + unified usage record + verification/settlement receipts
-- to one Pack037 durable task. Financial mutation remains in the existing Pack013 usage RPCs.

begin;

alter table public.zuvyr_task_runs
  add column if not exists checkpoint_d_quote jsonb,
  add column if not exists checkpoint_d_consent jsonb,
  add column if not exists checkpoint_d_verification_receipt jsonb,
  add column if not exists checkpoint_d_settlement_receipt jsonb,
  add column if not exists checkpoint_d_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_d_quote_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_d_quote_object
      check (
        checkpoint_d_quote is null
        or jsonb_typeof(checkpoint_d_quote) = 'object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_d_consent_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_d_consent_object
      check (
        checkpoint_d_consent is null
        or jsonb_typeof(checkpoint_d_consent) = 'object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_d_verification_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_d_verification_object
      check (
        checkpoint_d_verification_receipt is null
        or jsonb_typeof(checkpoint_d_verification_receipt) = 'object'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_d_settlement_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_d_settlement_object
      check (
        checkpoint_d_settlement_receipt is null
        or jsonb_typeof(checkpoint_d_settlement_receipt) = 'object'
      );
  end if;
end
$$;

create or replace function public.bind_zuvyr_task_checkpoint_d(
  p_task_run_id uuid,
  p_user_id uuid,
  p_usage_record_id bigint,
  p_quote jsonb,
  p_consent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_usage public.zuvyr_usage_records%rowtype;
begin
  if p_quote is null or jsonb_typeof(p_quote) <> 'object' then
    raise exception 'pack040_quote_invalid';
  end if;

  if p_consent is null or jsonb_typeof(p_consent) <> 'object' then
    raise exception 'pack040_consent_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack040_task_not_found';
  end if;

  select *
  into v_usage
  from public.zuvyr_usage_records
  where id = p_usage_record_id
    and user_id = p_user_id;

  if v_usage.id is null then
    raise exception 'pack040_usage_record_not_found';
  end if;

  if v_run.usage_record_id is not null
     and v_run.usage_record_id <> p_usage_record_id then
    raise exception 'pack040_usage_binding_conflict';
  end if;

  if v_run.checkpoint_d_quote is not null
     and v_run.checkpoint_d_quote <> p_quote then
    raise exception 'pack040_quote_binding_conflict';
  end if;

  if v_run.checkpoint_d_consent is not null
     and v_run.checkpoint_d_consent <> p_consent then
    raise exception 'pack040_consent_binding_conflict';
  end if;

  update public.zuvyr_task_runs
  set usage_record_id = p_usage_record_id,
      checkpoint_d_quote = coalesce(checkpoint_d_quote, p_quote),
      checkpoint_d_consent = coalesce(checkpoint_d_consent, p_consent),
      updated_at = now()
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'usageRecordId', v_run.usage_record_id,
    'bound', true
  );
end
$$;

create or replace function public.record_zuvyr_task_checkpoint_d_receipts(
  p_task_run_id uuid,
  p_user_id uuid,
  p_verification_receipt jsonb,
  p_settlement_receipt jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
begin
  if p_verification_receipt is null
     or jsonb_typeof(p_verification_receipt) <> 'object' then
    raise exception 'pack040_verification_receipt_invalid';
  end if;

  if p_settlement_receipt is null
     or jsonb_typeof(p_settlement_receipt) <> 'object' then
    raise exception 'pack040_settlement_receipt_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack040_task_not_found';
  end if;

  if v_run.state not in ('succeeded', 'failed', 'cancelled') then
    raise exception 'pack040_task_not_terminal';
  end if;

  if v_run.checkpoint_d_verification_receipt is not null
     or v_run.checkpoint_d_settlement_receipt is not null then
    if v_run.checkpoint_d_verification_receipt = p_verification_receipt
       and v_run.checkpoint_d_settlement_receipt = p_settlement_receipt then
      return jsonb_build_object(
        'taskRunId', v_run.id,
        'replayed', true,
        'verifiedAt', v_run.checkpoint_d_verified_at
      );
    end if;

    raise exception 'pack040_receipt_conflict';
  end if;

  update public.zuvyr_task_runs
  set checkpoint_d_verification_receipt = p_verification_receipt,
      checkpoint_d_settlement_receipt = p_settlement_receipt,
      checkpoint_d_verified_at = now(),
      updated_at = now()
  where id = v_run.id
  returning * into v_run;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'replayed', false,
    'verifiedAt', v_run.checkpoint_d_verified_at
  );
end
$$;

revoke all on function public.bind_zuvyr_task_checkpoint_d(uuid,uuid,bigint,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.record_zuvyr_task_checkpoint_d_receipts(uuid,uuid,jsonb,jsonb)
  from public, anon, authenticated;

grant execute on function public.bind_zuvyr_task_checkpoint_d(uuid,uuid,bigint,jsonb,jsonb)
  to service_role;
grant execute on function public.record_zuvyr_task_checkpoint_d_receipts(uuid,uuid,jsonb,jsonb)
  to service_role;

commit;
