-- ZUVYR Pack037 — Durable Task Persistence & Queue Ownership
-- Additive hardening of the existing Pack02 task tables.
-- Production DDL must be applied through the connected Supabase apply_migration action.

begin;

-- Pack031 raised canonical goal capacity to 4000 characters.
alter table public.zuvyr_task_runs
  drop constraint if exists zuvyr_task_runs_intent_valid;

alter table public.zuvyr_task_runs
  add constraint zuvyr_task_runs_intent_valid
  check (
    length(btrim(intent)) >= 1
    and length(btrim(intent)) <= 4000
  );

alter table public.zuvyr_task_runs
  add column if not exists quote_fingerprint text,
  add column if not exists consent_fingerprint text,
  add column if not exists queue_job_id text,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists checkpoint_version integer not null default 0,
  add column if not exists last_checkpoint_at timestamptz,
  add column if not exists resume_count integer not null default 0;

alter table public.zuvyr_task_steps
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists checkpoint_version integer not null default 0,
  add column if not exists last_checkpoint_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists resume_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_object'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_object
      check (jsonb_typeof(checkpoint) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_checkpoint_version_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_checkpoint_version_valid
      check (checkpoint_version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_resume_count_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_resume_count_valid
      check (resume_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_queue_job_id_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_queue_job_id_valid
      check (
        queue_job_id is null
        or (
          length(btrim(queue_job_id)) >= 8
          and length(btrim(queue_job_id)) <= 200
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_quote_fingerprint_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_quote_fingerprint_valid
      check (
        quote_fingerprint is null
        or quote_fingerprint ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_runs_consent_fingerprint_valid'
      and conrelid = 'public.zuvyr_task_runs'::regclass
  ) then
    alter table public.zuvyr_task_runs
      add constraint zuvyr_task_runs_consent_fingerprint_valid
      check (
        consent_fingerprint is null
        or consent_fingerprint ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_steps_checkpoint_object'
      and conrelid = 'public.zuvyr_task_steps'::regclass
  ) then
    alter table public.zuvyr_task_steps
      add constraint zuvyr_task_steps_checkpoint_object
      check (jsonb_typeof(checkpoint) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_steps_checkpoint_version_valid'
      and conrelid = 'public.zuvyr_task_steps'::regclass
  ) then
    alter table public.zuvyr_task_steps
      add constraint zuvyr_task_steps_checkpoint_version_valid
      check (checkpoint_version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_steps_resume_count_valid'
      and conrelid = 'public.zuvyr_task_steps'::regclass
  ) then
    alter table public.zuvyr_task_steps
      add constraint zuvyr_task_steps_resume_count_valid
      check (resume_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'zuvyr_task_steps_lease_shape_valid'
      and conrelid = 'public.zuvyr_task_steps'::regclass
  ) then
    alter table public.zuvyr_task_steps
      add constraint zuvyr_task_steps_lease_shape_valid
      check (
        (
          lease_owner is null
          and lease_token is null
          and lease_expires_at is null
        )
        or
        (
          lease_owner is not null
          and length(btrim(lease_owner)) between 1 and 200
          and lease_token is not null
          and lease_expires_at is not null
        )
      );
  end if;
end
$$;

create unique index if not exists idx_zuvyr_task_runs_queue_job_unique
  on public.zuvyr_task_runs(queue_job_id)
  where queue_job_id is not null;

create index if not exists idx_zuvyr_task_steps_claim_ready
  on public.zuvyr_task_steps(task_run_id, state, sequence_number);

create index if not exists idx_zuvyr_task_steps_expired_lease
  on public.zuvyr_task_steps(lease_expires_at)
  where state = 'running' and lease_expires_at is not null;

create or replace function public.create_or_get_zuvyr_task_run(
  p_user_id uuid,
  p_idempotency_key text,
  p_plan_version text,
  p_intent text,
  p_plan jsonb,
  p_quote_fingerprint text,
  p_consent_fingerprint text,
  p_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_created boolean := false;
  v_step jsonb;
  v_ordinal bigint;
begin
  if p_user_id is null then
    raise exception 'pack037_user_required';
  end if;

  if p_idempotency_key is null
     or length(btrim(p_idempotency_key)) < 8
     or length(btrim(p_idempotency_key)) > 128 then
    raise exception 'pack037_idempotency_key_invalid';
  end if;

  if p_plan_version !~ '^[0-9a-f]{64}$' then
    raise exception 'pack037_plan_version_invalid';
  end if;

  if p_quote_fingerprint !~ '^[0-9a-f]{64}$'
     or p_consent_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'pack037_financial_binding_invalid';
  end if;

  if p_intent is null
     or length(btrim(p_intent)) < 1
     or length(btrim(p_intent)) > 4000 then
    raise exception 'pack037_intent_invalid';
  end if;

  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'pack037_plan_invalid';
  end if;

  if p_steps is null
     or jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) < 1 then
    raise exception 'pack037_steps_invalid';
  end if;

  insert into public.zuvyr_task_runs(
    user_id,
    idempotency_key,
    plan_version,
    intent,
    state,
    plan,
    quote_fingerprint,
    consent_fingerprint
  )
  values(
    p_user_id,
    btrim(p_idempotency_key),
    p_plan_version,
    btrim(p_intent),
    'pending',
    p_plan,
    p_quote_fingerprint,
    p_consent_fingerprint
  )
  on conflict (user_id, idempotency_key) do nothing
  returning * into v_run;

  v_created := found;

  if not v_created then
    select *
    into v_run
    from public.zuvyr_task_runs
    where user_id = p_user_id
      and idempotency_key = btrim(p_idempotency_key);

    if v_run.id is null then
      raise exception 'pack037_idempotency_lookup_failed';
    end if;

    if v_run.plan_version <> p_plan_version
       or v_run.plan <> p_plan
       or v_run.quote_fingerprint is distinct from p_quote_fingerprint
       or v_run.consent_fingerprint is distinct from p_consent_fingerprint then
      raise exception 'pack037_idempotency_conflict';
    end if;
  else
    for v_step, v_ordinal in
      select value, ordinality
      from jsonb_array_elements(p_steps) with ordinality
    loop
      if coalesce(v_step->>'id', '') = ''
         or coalesce(v_step->>'capability', '') = '' then
        raise exception 'pack037_step_identity_invalid';
      end if;

      if jsonb_typeof(coalesce(v_step->'dependsOn', '[]'::jsonb)) <> 'array' then
        raise exception 'pack037_step_dependencies_invalid';
      end if;

      insert into public.zuvyr_task_steps(
        task_run_id,
        step_key,
        capability,
        sequence_number,
        state,
        attempts,
        max_attempts,
        depends_on,
        input
      )
      values(
        v_run.id,
        v_step->>'id',
        v_step->>'capability',
        (v_ordinal - 1)::integer,
        'pending',
        0,
        3,
        coalesce(v_step->'dependsOn', '[]'::jsonb),
        coalesce(v_step->'metadata', '{}'::jsonb)
      );
    end loop;
  end if;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'created', v_created,
    'state', v_run.state,
    'planVersion', v_run.plan_version,
    'idempotencyKey', v_run.idempotency_key
  );
end
$$;

create or replace function public.bind_zuvyr_task_queue_job(
  p_task_run_id uuid,
  p_user_id uuid,
  p_queue_job_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
begin
  if p_queue_job_id is null
     or length(btrim(p_queue_job_id)) < 8
     or length(btrim(p_queue_job_id)) > 200 then
    raise exception 'pack037_queue_job_id_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack037_task_not_found';
  end if;

  if v_run.queue_job_id is not null
     and v_run.queue_job_id <> btrim(p_queue_job_id) then
    raise exception 'pack037_queue_job_conflict';
  end if;

  update public.zuvyr_task_runs
  set queue_job_id = btrim(p_queue_job_id),
      updated_at = now()
  where id = v_run.id;

  return jsonb_build_object(
    'taskRunId', v_run.id,
    'queueJobId', btrim(p_queue_job_id)
  );
end
$$;

create or replace function public.get_zuvyr_task_snapshot(
  p_task_run_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_steps jsonb;
begin
  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id;

  if v_run.id is null then
    raise exception 'pack037_task_not_found';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(s) order by s.sequence_number),
    '[]'::jsonb
  )
  into v_steps
  from public.zuvyr_task_steps s
  where s.task_run_id = v_run.id;

  return jsonb_build_object(
    'run', to_jsonb(v_run),
    'steps', v_steps
  );
end
$$;

create or replace function public.claim_next_zuvyr_task_step(
  p_task_run_id uuid,
  p_user_id uuid,
  p_worker_owner text,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run public.zuvyr_task_runs%rowtype;
  v_step public.zuvyr_task_steps%rowtype;
  v_token uuid;
  v_was_resume boolean := false;
begin
  if p_worker_owner is null
     or length(btrim(p_worker_owner)) < 1
     or length(btrim(p_worker_owner)) > 200 then
    raise exception 'pack037_worker_owner_invalid';
  end if;

  if p_lease_seconds < 1 or p_lease_seconds > 300 then
    raise exception 'pack037_lease_seconds_invalid';
  end if;

  select *
  into v_run
  from public.zuvyr_task_runs
  where id = p_task_run_id
    and user_id = p_user_id
  for update;

  if v_run.id is null then
    raise exception 'pack037_task_not_found';
  end if;

  if v_run.cancel_requested then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'cancel_requested',
      'taskRunId', v_run.id
    );
  end if;

  if v_run.state in ('succeeded', 'failed', 'cancelled') then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'task_terminal',
      'taskRunId', v_run.id,
      'state', v_run.state
    );
  end if;

  select s.*
  into v_step
  from public.zuvyr_task_steps s
  where s.task_run_id = v_run.id
    and s.attempts < s.max_attempts
    and (
      s.state = 'pending'
      or (
        s.state = 'running'
        and s.lease_expires_at is not null
        and s.lease_expires_at <= now()
      )
    )
    and not exists (
      select 1
      from jsonb_array_elements_text(s.depends_on) dep(step_key)
      where not exists (
        select 1
        from public.zuvyr_task_steps dependency
        where dependency.task_run_id = s.task_run_id
          and dependency.step_key = dep.step_key
          and dependency.state = 'succeeded'
      )
    )
  order by s.sequence_number
  for update skip locked
  limit 1;

  if v_step.id is null then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'no_ready_step',
      'taskRunId', v_run.id
    );
  end if;

  v_was_resume := v_step.state = 'running';
  v_token := gen_random_uuid();

  update public.zuvyr_task_steps
  set state = 'running',
      attempts = attempts + 1,
      lease_owner = btrim(p_worker_owner),
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = now(),
      resume_count = resume_count + case when v_was_resume then 1 else 0 end,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_step.id
  returning * into v_step;

  update public.zuvyr_task_runs
  set state = 'running',
      resume_count = resume_count + case when v_was_resume then 1 else 0 end,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_run.id;

  return jsonb_build_object(
    'claimed', true,
    'taskRunId', v_run.id,
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'capability', v_step.capability,
    'attempt', v_step.attempts,
    'maxAttempts', v_step.max_attempts,
    'leaseOwner', v_step.lease_owner,
    'leaseToken', v_step.lease_token,
    'leaseExpiresAt', v_step.lease_expires_at,
    'resumed', v_was_resume,
    'resumeCount', v_step.resume_count,
    'checkpoint', v_step.checkpoint,
    'checkpointVersion', v_step.checkpoint_version,
    'dependsOn', v_step.depends_on,
    'input', v_step.input
  );
end
$$;

create or replace function public.renew_zuvyr_task_step_lease(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.zuvyr_task_steps%rowtype;
begin
  if p_lease_seconds < 1 or p_lease_seconds > 300 then
    raise exception 'pack037_lease_seconds_invalid';
  end if;

  update public.zuvyr_task_steps
  set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = now(),
      updated_at = now()
  where id = p_step_id
    and state = 'running'
    and lease_owner = btrim(p_worker_owner)
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning * into v_step;

  if v_step.id is null then
    raise exception 'pack037_lease_not_current';
  end if;

  return jsonb_build_object(
    'stepId', v_step.id,
    'leaseOwner', v_step.lease_owner,
    'leaseToken', v_step.lease_token,
    'leaseExpiresAt', v_step.lease_expires_at
  );
end
$$;

create or replace function public.checkpoint_zuvyr_task_step(
  p_step_id bigint,
  p_worker_owner text,
  p_lease_token uuid,
  p_checkpoint jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_step public.zuvyr_task_steps%rowtype;
begin
  if p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object' then
    raise exception 'pack037_checkpoint_invalid';
  end if;

  update public.zuvyr_task_steps
  set checkpoint = p_checkpoint,
      checkpoint_version = checkpoint_version + 1,
      last_checkpoint_at = now(),
      last_heartbeat_at = now(),
      updated_at = now()
  where id = p_step_id
    and state = 'running'
    and lease_owner = btrim(p_worker_owner)
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning * into v_step;

  if v_step.id is null then
    raise exception 'pack037_stale_worker_checkpoint_rejected';
  end if;

  update public.zuvyr_task_runs
  set checkpoint = jsonb_build_object(
        'stepKey', v_step.step_key,
        'stepCheckpointVersion', v_step.checkpoint_version
      ),
      checkpoint_version = checkpoint_version + 1,
      last_checkpoint_at = now(),
      updated_at = now()
  where id = v_step.task_run_id;

  return jsonb_build_object(
    'stepId', v_step.id,
    'stepKey', v_step.step_key,
    'checkpoint', v_step.checkpoint,
    'checkpointVersion', v_step.checkpoint_version,
    'lastCheckpointAt', v_step.last_checkpoint_at
  );
end
$$;

revoke all on function public.create_or_get_zuvyr_task_run(uuid,text,text,text,jsonb,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.bind_zuvyr_task_queue_job(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function public.get_zuvyr_task_snapshot(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.claim_next_zuvyr_task_step(uuid,uuid,text,integer)
  from public, anon, authenticated;
revoke all on function public.renew_zuvyr_task_step_lease(bigint,text,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.checkpoint_zuvyr_task_step(bigint,text,uuid,jsonb)
  from public, anon, authenticated;

grant execute on function public.create_or_get_zuvyr_task_run(uuid,text,text,text,jsonb,text,text,jsonb)
  to service_role;
grant execute on function public.bind_zuvyr_task_queue_job(uuid,uuid,text)
  to service_role;
grant execute on function public.get_zuvyr_task_snapshot(uuid,uuid)
  to service_role;
grant execute on function public.claim_next_zuvyr_task_step(uuid,uuid,text,integer)
  to service_role;
grant execute on function public.renew_zuvyr_task_step_lease(bigint,text,uuid,integer)
  to service_role;
grant execute on function public.checkpoint_zuvyr_task_step(bigint,text,uuid,jsonb)
  to service_role;

commit;
