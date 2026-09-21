-- ZUVYR PACK088 / Phase 88A
-- Automations & Durable Workflows — schema + invariants only.
-- No scheduler loop, provider call, billing mutation, or automatic execution is enabled here.

begin;

-- ---------------------------------------------------------------------------
-- Workflow definition versioning.
-- ---------------------------------------------------------------------------

alter table public.workspace_workflows
  add column if not exists revision integer not null default 1,
  add column if not exists last_revision_at timestamptz not null default now(),
  add column if not exists request_template jsonb not null default '{}'::jsonb;

alter table public.workspace_workflow_steps
  add column if not exists input_template jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_workflows_revision_valid'
      and conrelid='public.workspace_workflows'::regclass
  ) then
    alter table public.workspace_workflows
      add constraint workspace_workflows_revision_valid
      check (revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_workflows_request_template_object'
      and conrelid='public.workspace_workflows'::regclass
  ) then
    alter table public.workspace_workflows
      add constraint workspace_workflows_request_template_object
      check (jsonb_typeof(request_template)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_workflow_steps_input_template_object'
      and conrelid='public.workspace_workflow_steps'::regclass
  ) then
    alter table public.workspace_workflow_steps
      add constraint workspace_workflow_steps_input_template_object
      check (jsonb_typeof(input_template)='object');
  end if;
end
$$;

-- PACK087/IP is now a valid workflow capability. Preserve all historical
-- capability values instead of replacing the foundation.
alter table public.workspace_workflow_steps
  drop constraint if exists workspace_workflow_steps_capability_check;

alter table public.workspace_workflow_steps
  add constraint workspace_workflow_steps_capability_check
  check (
    capability in (
      'chat','image','video','audio','code','research',
      'document','spreadsheet','presentation','export','ip'
    )
  );

-- ---------------------------------------------------------------------------
-- Schedule definition / authorization state.
-- ---------------------------------------------------------------------------

alter table public.workspace_schedules
  add column if not exists definition_revision integer not null default 1,
  add column if not exists next_run_at timestamptz,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists recurrence_spec jsonb not null default '{}'::jsonb,
  add column if not exists run_input jsonb not null default '{}'::jsonb,
  add column if not exists misfire_policy text not null default 'run_once',
  add column if not exists max_credits_per_run integer,
  add column if not exists allow_topup boolean not null default false,
  add column if not exists notification_policy jsonb not null default '{"in_app":true}'::jsonb,
  add column if not exists workflow_revision integer,
  add column if not exists authorization_schedule_revision integer,
  add column if not exists authorization_digest text,
  add column if not exists authorization_capabilities text[] not null default '{}',
  add column if not exists authorization_external_writes boolean not null default false,
  add column if not exists authorized_device_id uuid references public.ip_devices(id) on delete set null,
  add column if not exists authorization_granted_at timestamptz,
  add column if not exists authorization_expires_at timestamptz,
  add column if not exists authorization_revoked_at timestamptz;

-- Preserve the live lifecycle already present in production and extend it
-- with explicit active/blocked states used by PACK088.
alter table public.workspace_schedules
  drop constraint if exists workspace_schedules_state_check;

alter table public.workspace_schedules
  add constraint workspace_schedules_state_check
  check (
    state in (
      'draft','ready','active','running','paused',
      'blocked','completed','failed','cancelled'
    )
  );

alter table public.workspace_schedules
  drop constraint if exists workspace_schedule_execution_state;

alter table public.workspace_schedules
  add constraint workspace_schedule_execution_state
  check (
    not execution_enabled
    or state in ('ready','active','running')
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_definition_revision_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_definition_revision_valid
      check (definition_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_recurrence_object'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_recurrence_object
      check (jsonb_typeof(recurrence_spec)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_run_input_object'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_run_input_object
      check (jsonb_typeof(run_input)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_notification_policy_object'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_notification_policy_object
      check (jsonb_typeof(notification_policy)='object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_misfire_policy_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_misfire_policy_valid
      check (misfire_policy in ('run_once','skip'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_credit_cap_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_credit_cap_valid
      check (
        max_credits_per_run is null
        or max_credits_per_run between 0 and 10000000
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_last_error_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_last_error_valid
      check (
        last_error_code is null
        or char_length(last_error_code) between 1 and 200
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_workflow_revision_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_workflow_revision_valid
      check (workflow_revision is null or workflow_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_authorization_schedule_revision_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_authorization_schedule_revision_valid
      check (
        authorization_schedule_revision is null
        or authorization_schedule_revision >= 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_authorization_digest_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_authorization_digest_valid
      check (
        authorization_digest is null
        or authorization_digest ~ '^[0-9a-f]{64}$'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_authorization_capabilities_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_authorization_capabilities_valid
      check (
        cardinality(authorization_capabilities) <= 32
        and not ('*'=any(authorization_capabilities))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_authorization_time_valid'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_authorization_time_valid
      check (
        authorization_expires_at is null
        or authorization_granted_at is null
        or authorization_expires_at > authorization_granted_at
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_once_interval_shape'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_once_interval_shape
      check (
        schedule_type <> 'once'
        or interval_minutes is null
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='workspace_schedules_recurring_shape'
      and conrelid='public.workspace_schedules'::regclass
  ) then
    alter table public.workspace_schedules
      add constraint workspace_schedules_recurring_shape
      check (
        schedule_type <> 'recurring'
        or interval_minutes is not null
        or recurrence_spec <> '{}'::jsonb
      );
  end if;
end
$$;

create index if not exists workspace_schedules_due_pack088_idx
  on public.workspace_schedules(next_run_at, id)
  where execution_enabled=true and state in ('ready','active','running');

create index if not exists workspace_schedules_workflow_pack088_idx
  on public.workspace_schedules(workflow_id, workflow_revision, definition_revision);

create index if not exists workspace_schedules_device_pack088_idx
  on public.workspace_schedules(authorized_device_id)
  where authorized_device_id is not null;

-- ---------------------------------------------------------------------------
-- Durable logical occurrence ledger.
-- ---------------------------------------------------------------------------

create table if not exists public.workspace_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  schedule_id uuid not null references public.workspace_schedules(id) on delete cascade,
  workflow_id uuid not null references public.workspace_workflows(id) on delete cascade,
  workflow_revision integer not null check (workflow_revision >= 1),
  schedule_revision integer not null check (schedule_revision >= 1),
  occurrence_key text not null check (char_length(occurrence_key) between 8 and 200),
  scheduled_for timestamptz not null,
  state text not null default 'pending'
    check (
      state in (
        'pending','claimed','queued','running','succeeded','failed',
        'cancelled','blocked_funding','blocked_permission','skipped'
      )
    ),
  claim_token uuid,
  claimed_at timestamptz,
  queued_at timestamptz,
  task_run_id uuid references public.zuvyr_task_runs(id) on delete set null,
  usage_record_id bigint references public.zuvyr_usage_records(id) on delete set null,
  funding_state text not null default 'not_checked'
    check (
      funding_state in (
        'not_checked','reserved','settled','refunded','blocked','not_required'
      )
    ),
  attempt_count integer not null default 0
    check (attempt_count between 0 and 100),
  error_code text
    check (error_code is null or char_length(error_code) between 1 and 200),
  notification_id uuid references public.zuvyr_notifications(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint workspace_schedule_runs_occurrence_unique
    unique(schedule_id, occurrence_key),
  constraint workspace_schedule_runs_claim_shape
    check (
      (claim_token is null and claimed_at is null)
      or
      (claim_token is not null and claimed_at is not null)
    ),
  constraint workspace_schedule_runs_terminal_time
    check (
      (
        state in (
          'succeeded','failed','cancelled',
          'blocked_funding','blocked_permission','skipped'
        )
        and completed_at is not null
      )
      or
      (
        state not in (
          'succeeded','failed','cancelled',
          'blocked_funding','blocked_permission','skipped'
        )
        and completed_at is null
      )
    ),
  constraint workspace_schedule_runs_usage_funding_shape
    check (
      usage_record_id is null
      or funding_state in ('reserved','settled','refunded')
    )
);

create unique index if not exists workspace_schedule_runs_task_unique
  on public.workspace_schedule_runs(task_run_id)
  where task_run_id is not null;

create index if not exists workspace_schedule_runs_owner_time_idx
  on public.workspace_schedule_runs(owner_id, scheduled_for desc);

create index if not exists workspace_schedule_runs_schedule_time_idx
  on public.workspace_schedule_runs(schedule_id, scheduled_for desc);

create index if not exists workspace_schedule_runs_recovery_idx
  on public.workspace_schedule_runs(state, updated_at)
  where state in ('pending','claimed','queued','running');

alter table public.workspace_schedule_runs enable row level security;

revoke all on table public.workspace_schedule_runs from public, anon, authenticated;
grant select, insert, update on table public.workspace_schedule_runs to service_role;

-- ---------------------------------------------------------------------------
-- Definition revision + authorization invalidation.
-- ---------------------------------------------------------------------------

create or replace function public.pack088_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  new.updated_at=now();
  return new;
end
$$;

create or replace function public.pack088_workflow_revision_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.external_writes_enabled is distinct from old.external_writes_enabled
     or new.request_template is distinct from old.request_template then
    new.revision=old.revision+1;
    new.last_revision_at=now();
  end if;
  new.updated_at=now();
  return new;
end
$$;

create or replace function public.pack088_bump_workflow_revision_from_step()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $pack088_step$
declare
  v_old_workflow uuid;
  v_new_workflow uuid;
  v_changed boolean := true;
begin
  if tg_op='UPDATE' then
    v_changed :=
      new.workflow_id is distinct from old.workflow_id
      or new.step_key is distinct from old.step_key
      or new.position is distinct from old.position
      or new.capability is distinct from old.capability
      or new.depends_on is distinct from old.depends_on
      or new.input_template is distinct from old.input_template;
  end if;

  if not v_changed then
    if tg_op='DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op in ('UPDATE','DELETE') then
    v_old_workflow=old.workflow_id;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    v_new_workflow=new.workflow_id;
  end if;

  if v_old_workflow is not null then
    update public.workspace_workflows
    set revision=revision+1,
        last_revision_at=now(),
        updated_at=now()
    where id=v_old_workflow;
  end if;

  if v_new_workflow is not null
     and v_new_workflow is distinct from v_old_workflow then
    update public.workspace_workflows
    set revision=revision+1,
        last_revision_at=now(),
        updated_at=now()
    where id=v_new_workflow;
  end if;

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end
$pack088_step$;

create or replace function public.pack088_invalidate_schedule_authorization_on_workflow_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.revision is distinct from old.revision then
    update public.workspace_schedules
    set execution_enabled=false,
        state=case
          when state in ('ready','active','running') then 'blocked'
          else state
        end,
        authorization_revoked_at=coalesce(authorization_revoked_at,now()),
        last_error_code='workflow_revision_changed',
        updated_at=now()
    where workflow_id=new.id
      and (
        authorization_digest is not null
        or execution_enabled=true
      );
  end if;
  return new;
end
$$;

create or replace function public.pack088_schedule_definition_guard()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_workflow_owner uuid;
  v_workflow_revision integer;
  v_definition_changed boolean := false;
begin
  select owner_id,revision
  into v_workflow_owner,v_workflow_revision
  from public.workspace_workflows
  where id=new.workflow_id;

  if v_workflow_owner is null then
    raise exception 'pack088_workflow_not_found';
  end if;

  if v_workflow_owner <> new.owner_id then
    raise exception 'pack088_workflow_owner_mismatch';
  end if;

  if not exists (
    select 1 from pg_timezone_names where name=new.timezone
  ) then
    raise exception 'pack088_timezone_invalid';
  end if;

  if tg_op='UPDATE' then
    v_definition_changed :=
      new.workflow_id is distinct from old.workflow_id
      or new.schedule_type is distinct from old.schedule_type
      or new.run_at is distinct from old.run_at
      or new.interval_minutes is distinct from old.interval_minutes
      or new.timezone is distinct from old.timezone
      or new.recurrence_spec is distinct from old.recurrence_spec
      or new.run_input is distinct from old.run_input
      or new.misfire_policy is distinct from old.misfire_policy
      or new.max_credits_per_run is distinct from old.max_credits_per_run
      or new.allow_topup is distinct from old.allow_topup
      or new.notification_policy is distinct from old.notification_policy
      or new.authorized_device_id is distinct from old.authorized_device_id;

    if v_definition_changed then
      new.definition_revision=old.definition_revision+1;

      if old.authorization_digest is not null then
        new.execution_enabled=false;
        new.authorization_revoked_at=coalesce(old.authorization_revoked_at,now());
        new.last_error_code='schedule_definition_changed';
        if old.state in ('ready','active','running') then
          new.state='blocked';
        end if;
      end if;
    end if;
  end if;

  if new.execution_enabled then
    if new.state not in ('ready','active','running') then
      raise exception 'pack088_schedule_state_not_executable';
    end if;

    if new.next_run_at is null then
      raise exception 'pack088_next_run_required';
    end if;

    if new.authorization_digest is null
       or new.authorization_granted_at is null
       or new.workflow_revision is null
       or new.authorization_schedule_revision is null
       or new.max_credits_per_run is null
       or cardinality(new.authorization_capabilities) < 1 then
      raise exception 'pack088_schedule_authorization_incomplete';
    end if;

    if new.authorization_revoked_at is not null then
      raise exception 'pack088_schedule_authorization_revoked';
    end if;

    if new.authorization_expires_at is not null
       and new.authorization_expires_at <= now() then
      raise exception 'pack088_schedule_authorization_expired';
    end if;

    if new.workflow_revision <> v_workflow_revision then
      raise exception 'pack088_workflow_revision_stale';
    end if;

    if new.authorization_schedule_revision <> new.definition_revision then
      raise exception 'pack088_schedule_revision_stale';
    end if;
  end if;

  if new.state in ('cancelled','completed')
     and new.next_run_at is not null then
    raise exception 'pack088_terminal_schedule_next_run_forbidden';
  end if;

  return new;
end
$$;

drop trigger if exists trg_pack088_workflow_revision_guard
  on public.workspace_workflows;
create trigger trg_pack088_workflow_revision_guard
before update on public.workspace_workflows
for each row execute function public.pack088_workflow_revision_guard();

drop trigger if exists trg_pack088_workflow_step_revision
  on public.workspace_workflow_steps;
create trigger trg_pack088_workflow_step_revision
after insert or update or delete on public.workspace_workflow_steps
for each row execute function public.pack088_bump_workflow_revision_from_step();

drop trigger if exists trg_pack088_workflow_schedule_invalidation
  on public.workspace_workflows;
create trigger trg_pack088_workflow_schedule_invalidation
after update of revision on public.workspace_workflows
for each row execute function public.pack088_invalidate_schedule_authorization_on_workflow_change();

drop trigger if exists trg_pack088_schedule_definition_guard
  on public.workspace_schedules;
create trigger trg_pack088_schedule_definition_guard
before insert or update on public.workspace_schedules
for each row execute function public.pack088_schedule_definition_guard();

drop trigger if exists trg_pack088_schedule_updated_at
  on public.workspace_schedules;
create trigger trg_pack088_schedule_updated_at
before update on public.workspace_schedules
for each row execute function public.pack088_touch_updated_at();

drop trigger if exists trg_pack088_schedule_run_updated_at
  on public.workspace_schedule_runs;
create trigger trg_pack088_schedule_run_updated_at
before update on public.workspace_schedule_runs
for each row execute function public.pack088_touch_updated_at();

-- Trigger functions are internal only.
revoke all on function public.pack088_touch_updated_at() from public,anon,authenticated;
revoke all on function public.pack088_workflow_revision_guard() from public,anon,authenticated;
revoke all on function public.pack088_bump_workflow_revision_from_step() from public,anon,authenticated;
revoke all on function public.pack088_invalidate_schedule_authorization_on_workflow_change() from public,anon,authenticated;
revoke all on function public.pack088_schedule_definition_guard() from public,anon,authenticated;

-- Existing workspace tables remain server-mediated; do not create browser
-- mutation policies in 88A.
alter table public.workspace_workflows enable row level security;
alter table public.workspace_workflow_steps enable row level security;
alter table public.workspace_schedules enable row level security;

commit;
