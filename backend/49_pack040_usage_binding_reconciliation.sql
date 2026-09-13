-- ZUVYR Pack040 FIX4 — task-level unified usage binding reconciliation
-- Migration 48 introduced Pack040 binding RPCs but production zuvyr_task_runs
-- did not yet have usage_record_id. Add the missing durable 1:1 reservation link.

begin;

alter table public.zuvyr_task_runs
  add column if not exists usage_record_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'zuvyr_task_runs_usage_record_id_fkey'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_usage_record_id_fkey
      foreign key (usage_record_id)
      references public.zuvyr_usage_records(id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists zuvyr_task_runs_usage_record_unique
  on public.zuvyr_task_runs (usage_record_id)
  where usage_record_id is not null;

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
  v_other_task_id uuid;
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
    and user_id = p_user_id
  for update;

  if v_usage.id is null then
    raise exception 'pack040_usage_record_not_found';
  end if;

  select id
  into v_other_task_id
  from public.zuvyr_task_runs
  where usage_record_id = p_usage_record_id
    and id <> p_task_run_id
  limit 1;

  if v_other_task_id is not null then
    raise exception 'pack040_usage_already_bound';
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

revoke all on function public.bind_zuvyr_task_checkpoint_d(uuid,uuid,bigint,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.bind_zuvyr_task_checkpoint_d(uuid,uuid,bigint,jsonb,jsonb)
  to service_role;

commit;
