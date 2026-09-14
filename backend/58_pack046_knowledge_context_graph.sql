-- ZUVYR Pack046 — Knowledge / Context Graph
-- Owner-indexed graph over canonical projects, memory/decisions, content/assets,
-- durable tasks, deployments and authorized connections.
begin;

create table if not exists public.zuvyr_context_nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  project_id uuid references public.workspace_projects(id) on delete cascade,
  label text not null,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zuvyr_context_nodes_type_allowed check (
    entity_type in (
      'user','project','decision','memory','content','asset',
      'task','deployment','connection'
    )
  ),
  constraint zuvyr_context_nodes_entity_id_valid check (
    length(btrim(entity_id)) between 1 and 500
  ),
  constraint zuvyr_context_nodes_label_valid check (
    length(btrim(label)) between 1 and 500
  ),
  constraint zuvyr_context_nodes_summary_valid check (
    summary is null or length(summary) <= 4000
  ),
  constraint zuvyr_context_nodes_metadata_object check (
    jsonb_typeof(metadata)='object'
  ),
  constraint zuvyr_context_nodes_owner_entity_unique unique (
    owner_id,entity_type,entity_id
  )
);

create table if not exists public.zuvyr_context_edges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  from_node_id uuid not null references public.zuvyr_context_nodes(id) on delete cascade,
  to_node_id uuid not null references public.zuvyr_context_nodes(id) on delete cascade,
  relation text not null,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zuvyr_context_edges_relation_allowed check (
    relation in (
      'owns','contains','belongs_to','decision_for','represents',
      'connected_to','related_to'
    )
  ),
  constraint zuvyr_context_edges_not_self check (from_node_id<>to_node_id),
  constraint zuvyr_context_edges_metadata_object check (
    jsonb_typeof(metadata)='object'
  ),
  constraint zuvyr_context_edges_unique unique (
    owner_id,from_node_id,to_node_id,relation
  )
);

create index if not exists zuvyr_context_nodes_owner_type_updated_idx
  on public.zuvyr_context_nodes(owner_id,entity_type,updated_at desc);
create index if not exists zuvyr_context_nodes_owner_project_updated_idx
  on public.zuvyr_context_nodes(owner_id,project_id,updated_at desc)
  where project_id is not null;
create index if not exists zuvyr_context_nodes_search_idx
  on public.zuvyr_context_nodes using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(label,'') || ' ' ||
      coalesce(summary,'') || ' ' ||
      coalesce(entity_type,'')
    )
  );
create index if not exists zuvyr_context_edges_owner_from_idx
  on public.zuvyr_context_edges(owner_id,from_node_id);
create index if not exists zuvyr_context_edges_owner_to_idx
  on public.zuvyr_context_edges(owner_id,to_node_id);
create index if not exists zuvyr_context_edges_owner_relation_idx
  on public.zuvyr_context_edges(owner_id,relation);

alter table public.zuvyr_context_nodes enable row level security;
alter table public.zuvyr_context_edges enable row level security;

drop policy if exists zuvyr_context_nodes_owner_select on public.zuvyr_context_nodes;
create policy zuvyr_context_nodes_owner_select
  on public.zuvyr_context_nodes for select to authenticated
  using (owner_id=(select auth.uid()));

drop policy if exists zuvyr_context_edges_owner_select on public.zuvyr_context_edges;
create policy zuvyr_context_edges_owner_select
  on public.zuvyr_context_edges for select to authenticated
  using (owner_id=(select auth.uid()));

revoke all on public.zuvyr_context_nodes from anon,authenticated;
revoke all on public.zuvyr_context_edges from anon,authenticated;
grant select on public.zuvyr_context_nodes to authenticated;
grant select on public.zuvyr_context_edges to authenticated;

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
    p_owner_id,'deployment',d.id::text,d.project_id,
    left(coalesce(d.target,'deployment'),500),
    null,
    jsonb_build_object('status',d.status,'target',d.target),
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

create or replace function public.retrieve_zuvyr_context_graph(
  p_owner_id uuid,
  p_query text default null,
  p_project_id uuid default null,
  p_types text[] default null,
  p_limit integer default 40,
  p_depth integer default 1
)
returns jsonb
language sql
stable
security invoker
set search_path=public,pg_temp
as $$
with recursive
seed as (
  select n.*
  from public.zuvyr_context_nodes n
  where n.owner_id=p_owner_id
    and (p_project_id is null or n.project_id=p_project_id or (
      n.entity_type='project' and n.entity_id=p_project_id::text
    ))
    and (p_types is null or n.entity_type=any(p_types))
    and (
      p_query is null
      or btrim(p_query)=''
      or to_tsvector(
           'simple'::regconfig,
           coalesce(n.label,'')||' '||
           coalesce(n.summary,'')||' '||
           coalesce(n.entity_type,'')
         ) @@ websearch_to_tsquery('simple'::regconfig,p_query)
    )
  order by
    case when n.project_id=p_project_id then 0 else 1 end,
    n.updated_at desc
  limit greatest(1,least(coalesce(p_limit,40),100))
),
walk(node_id,depth) as (
  select id,0 from seed
  union
  select
    case when e.from_node_id=w.node_id then e.to_node_id else e.from_node_id end,
    w.depth+1
  from walk w
  join public.zuvyr_context_edges e
    on e.owner_id=p_owner_id
   and (e.from_node_id=w.node_id or e.to_node_id=w.node_id)
  where w.depth<greatest(0,least(coalesce(p_depth,1),3))
),
selected_nodes as (
  select distinct n.*
  from public.zuvyr_context_nodes n
  join walk w on w.node_id=n.id
  where n.owner_id=p_owner_id
  limit greatest(1,least(coalesce(p_limit,40)*3,250))
),
selected_edges as (
  select distinct e.*
  from public.zuvyr_context_edges e
  join selected_nodes a on a.id=e.from_node_id
  join selected_nodes b on b.id=e.to_node_id
  where e.owner_id=p_owner_id
)
select jsonb_build_object(
  'ownerScoped',true,
  'scanScope','owner_indexed_graph',
  'query',p_query,
  'projectId',p_project_id,
  'nodes',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',n.id,
      'type',n.entity_type,
      'entityId',n.entity_id,
      'projectId',n.project_id,
      'label',n.label,
      'summary',n.summary,
      'metadata',n.metadata,
      'updatedAt',n.updated_at
    ) order by n.updated_at desc)
    from selected_nodes n
  ),'[]'::jsonb),
  'edges',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',e.id,
      'from',e.from_node_id,
      'to',e.to_node_id,
      'relation',e.relation,
      'metadata',e.metadata
    ))
    from selected_edges e
  ),'[]'::jsonb)
);
$$;

revoke all on function public.refresh_zuvyr_context_graph(uuid)
  from public,anon,authenticated;
revoke all on function public.retrieve_zuvyr_context_graph(
  uuid,text,uuid,text[],integer,integer
) from public,anon,authenticated;

grant execute on function public.refresh_zuvyr_context_graph(uuid)
  to service_role;
grant execute on function public.retrieve_zuvyr_context_graph(
  uuid,text,uuid,text[],integer,integer
) to service_role;

commit;
