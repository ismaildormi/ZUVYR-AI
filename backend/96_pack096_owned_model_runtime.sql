-- ZUVYR V1 PACK096 — owned Manager/Operator runtime + V2 bridge.
-- Additive control plane. Real live owned inference is additionally gated in
-- application code by M21 / ZUVYR_M21_VERIFIED and cannot be fabricated here.

create table if not exists public.zuvyr_owned_model_deployments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checkpoint_id uuid not null references public.zuvyr_model_lab_checkpoints(id) on delete restrict,
  evaluation_id uuid not null references public.zuvyr_model_lab_evaluations(id) on delete restrict,
  compute_connector_id uuid not null references public.zuvyr_compute_connectors(id) on delete restrict,
  model_name text not null default 'ZUVYR 7 Manager / Operator'
    check (char_length(model_name) between 3 and 160),
  model_alias text not null
    check (model_alias ~ '^[a-z0-9][a-z0-9._:-]{2,159}$'),
  endpoint_model_id text not null
    check (char_length(endpoint_model_id) between 1 and 240),
  rollout_stage text not null
    check (rollout_stage in ('SHADOW','CANARY','SECONDARY','PRIMARY')),
  traffic_bps integer not null default 0
    check (traffic_bps between 0 and 10000),
  workload_policy jsonb not null default '{"eligible_features":["chat"],"low_risk_only":true}'::jsonb
    check (jsonb_typeof(workload_policy)='object'),
  status text not null default 'staged'
    check (status in ('staged','active','paused','rolled_back','failed')),
  external_fallback_required boolean not null default true
    check (external_fallback_required=true),
  customer_compute_billed_directly boolean not null default true
    check (customer_compute_billed_directly=true),
  zuvyr_paid_gpu_required boolean not null default false
    check (zuvyr_paid_gpu_required=false),
  api_software_fee_microusd numeric not null default 0
    check (api_software_fee_microusd=0),
  owned_model_usage_fee_microusd numeric not null default 0
    check (owned_model_usage_fee_microusd=0),
  inference_markup_microusd numeric not null default 0
    check (inference_markup_microusd=0),
  minimum_task_success_bps integer
    check (minimum_task_success_bps is null or minimum_task_success_bps between 0 and 10000),
  maximum_cost_per_successful_task_microusd numeric
    check (
      maximum_cost_per_successful_task_microusd is null
      or maximum_cost_per_successful_task_microusd >= 0
    ),
  max_latency_ms integer not null default 30000
    check (max_latency_ms between 1000 and 120000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  paused_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text
);

create unique index if not exists zuvyr_owned_model_one_active_alias_idx
  on public.zuvyr_owned_model_deployments(owner_id, model_alias)
  where status='active';

create index if not exists zuvyr_owned_model_deployments_stage_idx
  on public.zuvyr_owned_model_deployments(owner_id,status,rollout_stage,updated_at desc);

create table if not exists public.zuvyr_owned_model_route_receipts (
  id uuid primary key default gen_random_uuid(),
  request_owner_id uuid not null references public.profiles(id) on delete cascade,
  deployment_id uuid references public.zuvyr_owned_model_deployments(id) on delete set null,
  request_id text not null check (char_length(request_id) between 1 and 200),
  capability text not null check (char_length(capability) between 1 and 80),
  route_mode text not null
    check (route_mode in ('external_only','shadow','owned','fallback')),
  rollout_stage text
    check (rollout_stage is null or rollout_stage in ('SHADOW','CANARY','SECONDARY','PRIMARY')),
  owned_attempted boolean not null default false,
  owned_succeeded boolean not null default false,
  external_fallback_triggered boolean not null default false,
  checkpoint_id uuid references public.zuvyr_model_lab_checkpoints(id) on delete set null,
  compute_connector_id uuid references public.zuvyr_compute_connectors(id) on delete set null,
  model_alias text,
  owned_latency_ms integer check (owned_latency_ms is null or owned_latency_ms >= 0),
  external_latency_ms integer check (external_latency_ms is null or external_latency_ms >= 0),
  customer_compute_cost_microusd numeric
    check (customer_compute_cost_microusd is null or customer_compute_cost_microusd >= 0),
  zuvyr_control_plane_cost_microusd numeric not null default 0
    check (zuvyr_control_plane_cost_microusd >= 0),
  external_provider_cost_microusd numeric
    check (external_provider_cost_microusd is null or external_provider_cost_microusd >= 0),
  owned_model_usage_fee_microusd numeric not null default 0
    check (owned_model_usage_fee_microusd=0),
  owned_model_credits_charged integer not null default 0
    check (owned_model_credits_charged=0),
  task_success boolean,
  tool_success boolean,
  failure_code text,
  usage_metrics jsonb not null default '{}'::jsonb
    check (jsonb_typeof(usage_metrics)='object'),
  decision_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(decision_metadata)='object'),
  created_at timestamptz not null default now(),
  unique(request_owner_id,request_id)
);

create index if not exists zuvyr_owned_model_route_receipts_deployment_idx
  on public.zuvyr_owned_model_route_receipts(deployment_id,created_at desc);

create table if not exists public.zuvyr_teacher_gateway_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  teacher_provider text not null check (char_length(teacher_provider) between 1 and 120),
  teacher_model text not null check (char_length(teacher_model) between 1 and 240),
  teacher_model_version text,
  permitted_use text not null
    check (permitted_use in ('training_finetune','evaluation')),
  contract_or_license_reference text not null
    check (char_length(contract_or_license_reference) between 3 and 1000),
  content_id uuid not null references public.zuvyr_content_objects(id) on delete restrict,
  content_version_id uuid not null references public.zuvyr_content_versions(id) on delete restrict,
  rights_id uuid not null references public.zuvyr_training_rights(id) on delete restrict,
  training_candidate_id uuid references public.zuvyr_training_candidates(id) on delete set null,
  source_event_id uuid references public.zuvyr_learning_events(id) on delete set null,
  provider_system_prompt_collected boolean not null default false
    check (provider_system_prompt_collected=false),
  provider_weights_collected boolean not null default false
    check (provider_weights_collected=false),
  customer_private_content_without_rights boolean not null default false
    check (customer_private_content_without_rights=false),
  provider_cost_microusd numeric
    check (provider_cost_microusd is null or provider_cost_microusd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  tool_success boolean,
  outcome text,
  provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance)='object'),
  status text not null default 'admitted'
    check (status in ('admitted','evaluation_only','rejected')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists zuvyr_teacher_gateway_owner_created_idx
  on public.zuvyr_teacher_gateway_records(owner_id,created_at desc);

alter table public.zuvyr_owned_model_deployments enable row level security;
alter table public.zuvyr_owned_model_route_receipts enable row level security;
alter table public.zuvyr_teacher_gateway_records enable row level security;

revoke all on public.zuvyr_owned_model_deployments from public,anon,authenticated;
revoke all on public.zuvyr_owned_model_route_receipts from public,anon,authenticated;
revoke all on public.zuvyr_teacher_gateway_records from public,anon,authenticated;

grant select,insert,update,delete on public.zuvyr_owned_model_deployments to service_role;
grant select,insert,update,delete on public.zuvyr_owned_model_route_receipts to service_role;
grant select,insert,update,delete on public.zuvyr_teacher_gateway_records to service_role;

create or replace function public.register_zuvyr_owned_model_deployment_pack096(
  p_admin_id uuid,
  p_checkpoint_id uuid,
  p_evaluation_id uuid,
  p_compute_connector_id uuid,
  p_model_alias text,
  p_endpoint_model_id text,
  p_rollout_stage text,
  p_traffic_bps integer,
  p_workload_policy jsonb,
  p_minimum_task_success_bps integer default null,
  p_maximum_cost_per_successful_task_microusd numeric default null,
  p_max_latency_ms integer default 30000
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack096_register$
declare
  v_checkpoint public.zuvyr_model_lab_checkpoints%rowtype;
  v_eval public.zuvyr_model_lab_evaluations%rowtype;
  v_connector public.zuvyr_compute_connectors%rowtype;
  v_stage text := upper(btrim(coalesce(p_rollout_stage,'')));
  v_alias text := lower(btrim(coalesce(p_model_alias,'')));
  v_endpoint_model text := btrim(coalesce(p_endpoint_model_id,''));
  v_policy jsonb := coalesce(p_workload_policy,'{}'::jsonb);
  v_deployment public.zuvyr_owned_model_deployments%rowtype;
begin
  perform public.pack095_require_admin(p_admin_id);

  if v_stage not in ('SHADOW','CANARY','SECONDARY','PRIMARY') then
    raise exception 'pack096_rollout_stage_invalid';
  end if;
  if v_alias !~ '^[a-z0-9][a-z0-9._:-]{2,159}$' then
    raise exception 'pack096_model_alias_invalid';
  end if;
  if char_length(v_endpoint_model) not between 1 and 240 then
    raise exception 'pack096_endpoint_model_id_invalid';
  end if;
  if p_traffic_bps < 0 or p_traffic_bps > 10000 then
    raise exception 'pack096_traffic_bps_invalid';
  end if;
  if jsonb_typeof(v_policy)<>'object'
     or jsonb_typeof(v_policy->'eligible_features')<>'array'
     or jsonb_array_length(v_policy->'eligible_features')<1 then
    raise exception 'pack096_workload_policy_invalid';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(v_policy->'eligible_features') value
    where value <> 'chat'
  ) then
    raise exception 'pack096_workload_not_bounded';
  end if;
  if coalesce((v_policy->>'low_risk_only')::boolean,false) is not true then
    raise exception 'pack096_low_risk_policy_required';
  end if;

  select * into v_checkpoint
  from public.zuvyr_model_lab_checkpoints
  where id=p_checkpoint_id and owner_id=p_admin_id;

  if v_checkpoint.id is null then
    raise exception 'pack096_checkpoint_not_found';
  end if;

  select * into v_eval
  from public.zuvyr_model_lab_evaluations
  where id=p_evaluation_id
    and owner_id=p_admin_id
    and checkpoint_id=p_checkpoint_id;

  if v_eval.id is null
     or v_eval.independent is not true
     or v_eval.status<>'passed'
     or v_eval.regression_status<>'pass' then
    raise exception 'pack096_independent_eval_not_passed';
  end if;

  if not exists (
    select 1
    from public.zuvyr_model_lab_stage_events e
    where e.owner_id=p_admin_id
      and e.checkpoint_id=p_checkpoint_id
      and e.to_stage=v_stage
      and e.event_status='planned'
      and e.evaluation_id=p_evaluation_id
  ) then
    raise exception 'pack096_stage_plan_required';
  end if;

  select * into v_connector
  from public.zuvyr_compute_connectors
  where id=p_compute_connector_id and owner_id=p_admin_id;

  if v_connector.id is null then
    raise exception 'pack096_compute_connector_not_found';
  end if;
  if v_connector.connector_kind<>'openai_compatible_https'
     or v_connector.endpoint_url is null then
    raise exception 'pack096_openai_compatible_connector_required';
  end if;
  if v_connector.ownership_verified_at is null
     or v_connector.qualification_status<>'qualified'
     or v_connector.health_status<>'healthy'
     or v_connector.last_health_at is null
     or v_connector.last_health_at < now()-interval '1 hour'
     or v_connector.attested_capabilities='{}'::jsonb then
    raise exception 'pack096_compute_connector_not_qualified';
  end if;

  if v_eval.task_success_bps is null then
    raise exception 'pack096_task_success_metric_required';
  end if;
  if p_minimum_task_success_bps is not null
     and v_eval.task_success_bps < p_minimum_task_success_bps then
    raise exception 'pack096_task_success_below_gate';
  end if;
  if p_maximum_cost_per_successful_task_microusd is not null
     and (
       v_eval.total_cost_per_successful_task_microusd is null
       or v_eval.total_cost_per_successful_task_microusd >
          p_maximum_cost_per_successful_task_microusd
     ) then
    raise exception 'pack096_cost_per_success_gate_failed';
  end if;

  insert into public.zuvyr_owned_model_deployments(
    owner_id,checkpoint_id,evaluation_id,compute_connector_id,
    model_name,model_alias,endpoint_model_id,rollout_stage,traffic_bps,
    workload_policy,status,external_fallback_required,
    customer_compute_billed_directly,zuvyr_paid_gpu_required,
    api_software_fee_microusd,owned_model_usage_fee_microusd,
    inference_markup_microusd,minimum_task_success_bps,
    maximum_cost_per_successful_task_microusd,max_latency_ms,created_by
  ) values (
    p_admin_id,p_checkpoint_id,p_evaluation_id,p_compute_connector_id,
    'ZUVYR 7 Manager / Operator',v_alias,v_endpoint_model,v_stage,p_traffic_bps,
    v_policy,'staged',true,true,false,0,0,0,
    p_minimum_task_success_bps,p_maximum_cost_per_successful_task_microusd,
    coalesce(p_max_latency_ms,30000),p_admin_id
  )
  returning * into v_deployment;

  return jsonb_build_object(
    'deployment_id',v_deployment.id,
    'status',v_deployment.status,
    'rollout_stage',v_deployment.rollout_stage,
    'traffic_bps',v_deployment.traffic_bps,
    'model_alias',v_deployment.model_alias,
    'owned_model_usage_fee_microusd',0,
    'api_software_fee_microusd',0,
    'inference_markup_microusd',0,
    'live_routing_enabled',false,
    'external_gate','M21'
  );
end;
$pack096_register$;

create or replace function public.activate_zuvyr_owned_model_deployment_pack096(
  p_admin_id uuid,
  p_deployment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack096_activate$
declare
  v_deployment public.zuvyr_owned_model_deployments%rowtype;
  v_connector public.zuvyr_compute_connectors%rowtype;
  v_checkpoint public.zuvyr_model_lab_checkpoints%rowtype;
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_deployment
  from public.zuvyr_owned_model_deployments
  where id=p_deployment_id and owner_id=p_admin_id
  for update;

  if v_deployment.id is null then
    raise exception 'pack096_deployment_not_found';
  end if;
  if v_deployment.status='active' then
    return jsonb_build_object(
      'deployment_id',v_deployment.id,
      'status','active',
      'replayed',true,
      'rollout_stage',v_deployment.rollout_stage,
      'traffic_bps',v_deployment.traffic_bps
    );
  end if;
  if v_deployment.status not in ('staged','paused') then
    raise exception 'pack096_deployment_not_activatable';
  end if;

  select * into v_connector
  from public.zuvyr_compute_connectors
  where id=v_deployment.compute_connector_id and owner_id=p_admin_id;

  if v_connector.id is null
     or v_connector.qualification_status<>'qualified'
     or v_connector.health_status<>'healthy'
     or v_connector.last_health_at is null
     or v_connector.last_health_at < now()-interval '1 hour' then
    raise exception 'pack096_compute_connector_not_qualified';
  end if;

  update public.zuvyr_owned_model_deployments
  set status='active',activated_at=coalesce(activated_at,now()),
      paused_at=null,updated_at=now()
  where id=v_deployment.id
  returning * into v_deployment;

  select * into v_checkpoint
  from public.zuvyr_model_lab_checkpoints
  where id=v_deployment.checkpoint_id and owner_id=p_admin_id
  for update;

  update public.zuvyr_model_lab_checkpoints
  set current_stage=v_deployment.rollout_stage,
      status='qualified',
      updated_at=now()
  where id=v_checkpoint.id;

  insert into public.zuvyr_model_lab_stage_events(
    owner_id,checkpoint_id,from_stage,to_stage,event_status,evaluation_id,evidence
  ) values (
    p_admin_id,v_checkpoint.id,v_checkpoint.current_stage,
    v_deployment.rollout_stage,'activated',v_deployment.evaluation_id,
    jsonb_build_object(
      'runtime_owner','PACK096',
      'deployment_id',v_deployment.id,
      'compute_connector_id',v_deployment.compute_connector_id,
      'traffic_bps',v_deployment.traffic_bps,
      'owned_model_usage_fee_microusd',0,
      'api_software_fee_microusd',0,
      'inference_markup_microusd',0,
      'customer_compute_billed_directly',true,
      'zuvyr_paid_gpu_required',false
    )
  );

  return jsonb_build_object(
    'deployment_id',v_deployment.id,
    'status','active',
    'replayed',false,
    'rollout_stage',v_deployment.rollout_stage,
    'traffic_bps',v_deployment.traffic_bps
  );
end;
$pack096_activate$;

create or replace function public.rollback_zuvyr_owned_model_deployment_pack096(
  p_admin_id uuid,
  p_deployment_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack096_rollback$
declare
  v_deployment public.zuvyr_owned_model_deployments%rowtype;
  v_checkpoint public.zuvyr_model_lab_checkpoints%rowtype;
  v_reason text := left(btrim(coalesce(p_reason,'owned_model_rollback')),1000);
begin
  perform public.pack095_require_admin(p_admin_id);

  select * into v_deployment
  from public.zuvyr_owned_model_deployments
  where id=p_deployment_id and owner_id=p_admin_id
  for update;

  if v_deployment.id is null then
    raise exception 'pack096_deployment_not_found';
  end if;
  if v_deployment.status='rolled_back' then
    return jsonb_build_object(
      'deployment_id',v_deployment.id,
      'status','rolled_back',
      'replayed',true
    );
  end if;

  update public.zuvyr_owned_model_deployments
  set status='rolled_back',traffic_bps=0,rolled_back_at=now(),
      rollback_reason=v_reason,updated_at=now()
  where id=v_deployment.id;

  select * into v_checkpoint
  from public.zuvyr_model_lab_checkpoints
  where id=v_deployment.checkpoint_id and owner_id=p_admin_id
  for update;

  if v_checkpoint.id is not null then
    update public.zuvyr_model_lab_checkpoints
    set current_stage='EVAL',status='rolled_back',updated_at=now()
    where id=v_checkpoint.id;

    insert into public.zuvyr_model_lab_stage_events(
      owner_id,checkpoint_id,from_stage,to_stage,event_status,evaluation_id,evidence
    ) values (
      p_admin_id,v_checkpoint.id,v_checkpoint.current_stage,'EVAL','rolled_back',
      v_deployment.evaluation_id,
      jsonb_build_object(
        'runtime_owner','PACK096',
        'deployment_id',v_deployment.id,
        'reason',v_reason,
        'automatic_external_fallback',true
      )
    );
  end if;

  return jsonb_build_object(
    'deployment_id',v_deployment.id,
    'status','rolled_back',
    'replayed',false,
    'fallback_required',true
  );
end;
$pack096_rollback$;

create or replace function public.record_zuvyr_owned_model_route_pack096(
  p_request_owner_id uuid,
  p_deployment_id uuid,
  p_request_id text,
  p_capability text,
  p_route_mode text,
  p_owned_attempted boolean,
  p_owned_succeeded boolean,
  p_external_fallback_triggered boolean,
  p_owned_latency_ms integer,
  p_external_latency_ms integer,
  p_customer_compute_cost_microusd numeric,
  p_zuvyr_control_plane_cost_microusd numeric,
  p_external_provider_cost_microusd numeric,
  p_failure_code text,
  p_usage_metrics jsonb,
  p_decision_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack096_route_receipt$
declare
  v_deployment public.zuvyr_owned_model_deployments%rowtype;
  v_row public.zuvyr_owned_model_route_receipts%rowtype;
begin
  if char_length(btrim(coalesce(p_request_id,''))) not between 1 and 200 then
    raise exception 'pack096_request_id_invalid';
  end if;
  if p_route_mode not in ('external_only','shadow','owned','fallback') then
    raise exception 'pack096_route_mode_invalid';
  end if;
  if p_deployment_id is not null then
    select * into v_deployment
    from public.zuvyr_owned_model_deployments
    where id=p_deployment_id;
    if v_deployment.id is null then
      raise exception 'pack096_deployment_not_found';
    end if;
  end if;

  insert into public.zuvyr_owned_model_route_receipts(
    request_owner_id,deployment_id,request_id,capability,route_mode,
    rollout_stage,owned_attempted,owned_succeeded,external_fallback_triggered,
    checkpoint_id,compute_connector_id,model_alias,owned_latency_ms,
    external_latency_ms,customer_compute_cost_microusd,
    zuvyr_control_plane_cost_microusd,external_provider_cost_microusd,
    owned_model_usage_fee_microusd,owned_model_credits_charged,
    failure_code,usage_metrics,decision_metadata
  ) values (
    p_request_owner_id,p_deployment_id,btrim(p_request_id),btrim(p_capability),
    p_route_mode,
    case when v_deployment.id is null then null else v_deployment.rollout_stage end,
    coalesce(p_owned_attempted,false),coalesce(p_owned_succeeded,false),
    coalesce(p_external_fallback_triggered,false),
    case when v_deployment.id is null then null else v_deployment.checkpoint_id end,
    case when v_deployment.id is null then null else v_deployment.compute_connector_id end,
    case when v_deployment.id is null then null else v_deployment.model_alias end,
    p_owned_latency_ms,p_external_latency_ms,p_customer_compute_cost_microusd,
    coalesce(p_zuvyr_control_plane_cost_microusd,0),
    p_external_provider_cost_microusd,0,0,
    nullif(left(btrim(coalesce(p_failure_code,'')),200),''),
    coalesce(p_usage_metrics,'{}'::jsonb),
    coalesce(p_decision_metadata,'{}'::jsonb)
  )
  on conflict(request_owner_id,request_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.zuvyr_owned_model_route_receipts
    where request_owner_id=p_request_owner_id and request_id=btrim(p_request_id);
  end if;

  return jsonb_build_object(
    'receipt_id',v_row.id,
    'route_mode',v_row.route_mode,
    'owned_model_usage_fee_microusd',v_row.owned_model_usage_fee_microusd,
    'owned_model_credits_charged',v_row.owned_model_credits_charged,
    'fallback_triggered',v_row.external_fallback_triggered
  );
end;
$pack096_route_receipt$;

create or replace function public.record_zuvyr_teacher_gateway_output_pack096(
  p_admin_id uuid,
  p_teacher_provider text,
  p_teacher_model text,
  p_teacher_model_version text,
  p_permitted_use text,
  p_contract_or_license_reference text,
  p_rights_id uuid,
  p_source_event_id uuid,
  p_domain text,
  p_difficulty integer,
  p_quality_score integer,
  p_learning_value_score integer,
  p_provider_cost_microusd numeric,
  p_latency_ms integer,
  p_tool_success boolean,
  p_outcome text,
  p_provenance jsonb,
  p_provider_system_prompt_collected boolean default false,
  p_provider_weights_collected boolean default false,
  p_customer_private_content_without_rights boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $pack096_teacher$
declare
  v_rights public.zuvyr_training_rights%rowtype;
  v_candidate jsonb;
  v_row public.zuvyr_teacher_gateway_records%rowtype;
begin
  perform public.pack095_require_admin(p_admin_id);

  if p_permitted_use not in ('training_finetune','evaluation') then
    raise exception 'pack096_teacher_use_invalid';
  end if;
  if char_length(btrim(coalesce(p_contract_or_license_reference,'')))<3 then
    raise exception 'pack096_teacher_contract_or_license_required';
  end if;
  if coalesce(p_provider_system_prompt_collected,false)
     or coalesce(p_provider_weights_collected,false)
     or coalesce(p_customer_private_content_without_rights,false) then
    raise exception 'pack096_teacher_prohibited_source_material';
  end if;

  select * into v_rights
  from public.zuvyr_training_rights
  where id=p_rights_id and owner_id=p_admin_id;

  if v_rights.id is null then
    raise exception 'pack096_teacher_rights_not_found';
  end if;

  if p_permitted_use='training_finetune' then
    v_candidate := public.admit_zuvyr_training_candidate_pack094(
      p_admin_id,p_rights_id,p_source_event_id,p_domain,p_difficulty,
      p_quality_score,p_learning_value_score,'reference_only'
    );
  end if;

  insert into public.zuvyr_teacher_gateway_records(
    owner_id,teacher_provider,teacher_model,teacher_model_version,
    permitted_use,contract_or_license_reference,content_id,content_version_id,
    rights_id,training_candidate_id,source_event_id,
    provider_system_prompt_collected,provider_weights_collected,
    customer_private_content_without_rights,provider_cost_microusd,latency_ms,
    tool_success,outcome,provenance,status,created_by
  ) values (
    p_admin_id,left(btrim(p_teacher_provider),120),left(btrim(p_teacher_model),240),
    nullif(left(btrim(coalesce(p_teacher_model_version,'')),120),''),
    p_permitted_use,left(btrim(p_contract_or_license_reference),1000),
    v_rights.content_id,v_rights.version_id,v_rights.id,
    case when v_candidate is null then null else (v_candidate->>'id')::uuid end,
    p_source_event_id,false,false,false,p_provider_cost_microusd,p_latency_ms,
    p_tool_success,nullif(left(btrim(coalesce(p_outcome,'')),200),''),
    coalesce(p_provenance,'{}'::jsonb),
    case when p_permitted_use='training_finetune' then 'admitted' else 'evaluation_only' end,
    p_admin_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'teacher_gateway_record_id',v_row.id,
    'status',v_row.status,
    'training_candidate_id',v_row.training_candidate_id,
    'content_id',v_row.content_id,
    'content_version_id',v_row.content_version_id,
    'rights_id',v_row.rights_id
  );
end;
$pack096_teacher$;

revoke all on function public.register_zuvyr_owned_model_deployment_pack096(
  uuid,uuid,uuid,uuid,text,text,text,integer,jsonb,integer,numeric,integer
) from public,anon,authenticated;
revoke all on function public.activate_zuvyr_owned_model_deployment_pack096(uuid,uuid)
  from public,anon,authenticated;
revoke all on function public.rollback_zuvyr_owned_model_deployment_pack096(uuid,uuid,text)
  from public,anon,authenticated;
revoke all on function public.record_zuvyr_owned_model_route_pack096(
  uuid,uuid,text,text,text,boolean,boolean,boolean,integer,integer,numeric,numeric,numeric,text,jsonb,jsonb
) from public,anon,authenticated;
revoke all on function public.record_zuvyr_teacher_gateway_output_pack096(
  uuid,text,text,text,text,text,uuid,uuid,text,integer,integer,integer,numeric,integer,boolean,text,jsonb,boolean,boolean,boolean
) from public,anon,authenticated;

grant execute on function public.register_zuvyr_owned_model_deployment_pack096(
  uuid,uuid,uuid,uuid,text,text,text,integer,jsonb,integer,numeric,integer
) to service_role;
grant execute on function public.activate_zuvyr_owned_model_deployment_pack096(uuid,uuid)
  to service_role;
grant execute on function public.rollback_zuvyr_owned_model_deployment_pack096(uuid,uuid,text)
  to service_role;
grant execute on function public.record_zuvyr_owned_model_route_pack096(
  uuid,uuid,text,text,text,boolean,boolean,boolean,integer,integer,numeric,numeric,numeric,text,jsonb,jsonb
) to service_role;
grant execute on function public.record_zuvyr_teacher_gateway_output_pack096(
  uuid,text,text,text,text,text,uuid,uuid,text,integer,integer,integer,numeric,integer,boolean,text,jsonb,boolean,boolean,boolean
) to service_role;

comment on table public.zuvyr_owned_model_deployments is
  'PACK096 owned Manager/Operator deployment authority. Live activation additionally requires application M21 proof; normal owned inference uses user/org-funded BYOC and has zero ZUVYR model/API fee.';
comment on table public.zuvyr_owned_model_route_receipts is
  'PACK096 privacy-safe routing/accounting receipts. Prompt/response payload content is intentionally absent; external fallback cost remains distinct from zero owned-model usage fee.';
comment on table public.zuvyr_teacher_gateway_records is
  'PACK096 controlled Teacher Gateway metadata only. Raw provider system prompts, weights and unauthorized customer-private content are forbidden; training admission delegates to PACK094 rights/consent/privacy/provenance authority.';
