-- ZUVYR Pack046 hotfix — deployment nodes must not place code_projects IDs
-- into workspace_projects-scoped context_nodes.project_id.
begin;

create or replace function public.refresh_zuvyr_context_graph(p_owner_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_seen timestamptz := clock_timestamp();
  v_user_node uuid;
  v_count_nodes integer := 0;
  v_count_edges integer := 0;
begin
  if p_owner_id is null then
    raise exception 'context_graph_owner_required';
  end if;

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  values(
    p_owner_id,'user',p_owner_id::text,null,'User',null,'{}'::jsonb,
    now(),v_seen,now()
  )
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now()
  returning id into v_user_node;

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'project',p.id::text,p.id,
    left(p.name,500),
    left(coalesce(p.description,''),4000),
    jsonb_build_object(
      'sharedContextEnabled',p.shared_context_enabled,
      'archived',p.archived_at is not null
    ),
    p.updated_at,v_seen,now()
  from public.workspace_projects p
  where p.owner_id=p_owner_id
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,
    case when m.category='decision' then 'decision' else 'memory' end,
    m.id::text,m.project_id,
    left(m.category,500),
    left(m.content,4000),
    jsonb_build_object(
      'scope',m.scope,
      'category',m.category,
      'version',m.current_version
    ),
    m.updated_at,v_seen,now()
  from public.zuvyr_memories m
  where m.owner_id=p_owner_id
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'content',c.id::text,c.project_id,
    left(coalesce(c.title,c.kind||' content'),500),
    null,
    jsonb_build_object(
      'kind',c.kind,
      'status',c.status,
      'sourceKind',c.source_kind,
      'sourceSystem',c.source_system
    ),
    c.updated_at,v_seen,now()
  from public.zuvyr_content_objects c
  where c.owner_id=p_owner_id and c.deleted_at is null
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'asset',a.id::text,c.project_id,
    left(coalesce(a.mime_type,'asset'),500),
    null,
    jsonb_build_object(
      'canonicalContentId',a.canonical_content_id,
      'canonicalVersionId',a.canonical_version_id,
      'status',a.status,
      'retentionClass',a.retention_class
    ),
    a.updated_at,v_seen,now()
  from public.zuvyr_assets a
  join public.zuvyr_content_objects c
    on c.id=a.canonical_content_id and c.owner_id=p_owner_id
  where a.owner_id=p_owner_id and a.deleted_at is null and a.status='active'
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'task',t.id::text,null,
    left(t.intent,500),
    null,
    jsonb_build_object(
      'state',t.state,
      'planVersion',t.plan_version
    ),
    t.updated_at,v_seen,now()
  from public.zuvyr_task_runs t
  where t.user_id=p_owner_id
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'deployment',d.id::text,null,
    left(coalesce(d.target,'deployment'),500),
    null,
    jsonb_build_object(
      'status',d.status,
      'target',d.target,
      'codeProjectId',d.project_id
    ),
    coalesce(d.completed_at,d.created_at),v_seen,now()
  from public.code_deploy_requests d
  where d.owner_id=p_owner_id
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'connection','integration:'||c.id::text,null,
    left(c.integration_key,500),
    null,
    jsonb_build_object(
      'connectionKind','integration',
      'connected',c.connected,
      'readEnabled',c.read_enabled,
      'writeEnabled',c.write_enabled,
      'explicitConsent',c.explicit_consent
    ),
    c.created_at,v_seen,now()
  from public.workspace_integration_connections c
  where c.owner_id=p_owner_id and c.connected=true and c.explicit_consent=true
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  insert into public.zuvyr_context_nodes(
    owner_id,entity_type,entity_id,project_id,label,summary,metadata,
    source_updated_at,last_seen_at,updated_at
  )
  select
    p_owner_id,'connection','plugin:'||c.id::text,null,
    left(c.plugin_key,500),
    null,
    jsonb_build_object(
      'connectionKind','plugin',
      'installed',c.installed,
      'runtimeEnabled',c.runtime_enabled,
      'explicitConsent',c.explicit_consent
    ),
    c.created_at,v_seen,now()
  from public.workspace_plugin_connections c
  where c.owner_id=p_owner_id and c.installed=true and c.explicit_consent=true
  on conflict(owner_id,entity_type,entity_id) do update
    set project_id=excluded.project_id,
        label=excluded.label,
        summary=excluded.summary,
        metadata=excluded.metadata,
        source_updated_at=excluded.source_updated_at,
        last_seen_at=excluded.last_seen_at,
        updated_at=now();

  delete from public.zuvyr_context_edges e
  where e.owner_id=p_owner_id;

  insert into public.zuvyr_context_edges(
    owner_id,from_node_id,to_node_id,relation,metadata,last_seen_at,updated_at
  )
  select
    p_owner_id,v_user_node,n.id,'owns','{}'::jsonb,v_seen,now()
  from public.zuvyr_context_nodes n
  where n.owner_id=p_owner_id
    and n.id<>v_user_node;

  insert into public.zuvyr_context_edges(
    owner_id,from_node_id,to_node_id,relation,metadata,last_seen_at,updated_at
  )
  select
    p_owner_id,pn.id,n.id,
    case when n.entity_type='decision' then 'decision_for' else 'contains' end,
    '{}'::jsonb,v_seen,now()
  from public.zuvyr_context_nodes n
  join public.zuvyr_context_nodes pn
    on pn.owner_id=p_owner_id
   and pn.entity_type='project'
   and pn.entity_id=n.project_id::text
  where n.owner_id=p_owner_id
    and n.project_id is not null
    and n.entity_type<>'project';

  insert into public.zuvyr_context_edges(
    owner_id,from_node_id,to_node_id,relation,metadata,last_seen_at,updated_at
  )
  select
    p_owner_id,a.id,c.id,'represents','{}'::jsonb,v_seen,now()
  from public.zuvyr_context_nodes a
  join public.zuvyr_assets za
    on za.owner_id=p_owner_id
   and a.owner_id=p_owner_id
   and a.entity_type='asset'
   and a.entity_id=za.id::text
  join public.zuvyr_context_nodes c
    on c.owner_id=p_owner_id
   and c.entity_type='content'
   and c.entity_id=za.canonical_content_id::text;

  delete from public.zuvyr_context_nodes n
  where n.owner_id=p_owner_id
    and n.last_seen_at<>v_seen;

  select count(*) into v_count_nodes
  from public.zuvyr_context_nodes
  where owner_id=p_owner_id;

  select count(*) into v_count_edges
  from public.zuvyr_context_edges
  where owner_id=p_owner_id;

  return jsonb_build_object(
    'ownerId',p_owner_id,
    'nodes',v_count_nodes,
    'edges',v_count_edges,
    'refreshedAt',v_seen
  );
end;
$$;

revoke all on function public.refresh_zuvyr_context_graph(uuid)
  from public,anon,authenticated;
grant execute on function public.refresh_zuvyr_context_graph(uuid)
  to service_role;

commit;
