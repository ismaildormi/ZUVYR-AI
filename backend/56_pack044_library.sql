-- ZUVYR Pack044 Library
begin;
alter table public.zuvyr_content_objects add column if not exists deleted_at timestamptz;
create index if not exists zuvyr_library_owner_status_updated_idx on public.zuvyr_content_objects(owner_id,status,updated_at desc);
create index if not exists zuvyr_library_owner_kind_updated_idx on public.zuvyr_content_objects(owner_id,kind,updated_at desc);
create index if not exists zuvyr_library_owner_project_updated_idx on public.zuvyr_content_objects(owner_id,project_id,updated_at desc) where project_id is not null;
create index if not exists zuvyr_library_owner_source_updated_idx on public.zuvyr_content_objects(owner_id,source_system,updated_at desc);
create index if not exists zuvyr_library_owner_model_updated_idx on public.zuvyr_content_objects(owner_id,(coalesce(metadata->>'model',metadata->>'modelId',metadata->>'modelTool')),updated_at desc);
create index if not exists zuvyr_library_search_idx on public.zuvyr_content_objects using gin(to_tsvector('simple'::regconfig,
coalesce(title,'')||' '||coalesce(kind,'')||' '||coalesce(source_kind,'')||' '||coalesce(source_system,'')||' '||coalesce(source_id,'')||' '||
coalesce(metadata->>'model','')||' '||coalesce(metadata->>'modelId','')||' '||coalesce(metadata->>'modelTool','')||' '||coalesce(metadata->>'provider','')));
create or replace function public.search_zuvyr_library(
p_owner_id uuid,p_query text default null,p_kind text default null,p_project_id uuid default null,p_source text default null,p_model text default null,
p_from timestamptz default null,p_to timestamptz default null,p_state text default 'active',p_limit integer default 50,p_offset integer default 0)
returns setof public.zuvyr_content_objects language sql stable security definer set search_path=public,pg_temp as $$
select c.* from public.zuvyr_content_objects c where c.owner_id=p_owner_id
and (coalesce(nullif(btrim(p_state),''),'active')='all'
 or (coalesce(nullif(btrim(p_state),''),'active')='active' and c.status='active' and c.deleted_at is null)
 or (coalesce(nullif(btrim(p_state),''),'active')='deleted' and c.deleted_at is not null))
and (p_kind is null or c.kind=p_kind) and (p_project_id is null or c.project_id=p_project_id)
and (p_source is null or c.source_system=p_source)
and (p_model is null or coalesce(c.metadata->>'model',c.metadata->>'modelId',c.metadata->>'modelTool')=p_model)
and (p_from is null or c.updated_at>=p_from) and (p_to is null or c.updated_at<=p_to)
and (p_query is null or btrim(p_query)='' or to_tsvector('simple'::regconfig,
coalesce(c.title,'')||' '||coalesce(c.kind,'')||' '||coalesce(c.source_kind,'')||' '||coalesce(c.source_system,'')||' '||coalesce(c.source_id,'')||' '||
coalesce(c.metadata->>'model','')||' '||coalesce(c.metadata->>'modelId','')||' '||coalesce(c.metadata->>'modelTool','')||' '||coalesce(c.metadata->>'provider',''))
@@ websearch_to_tsquery('simple'::regconfig,p_query))
order by c.updated_at desc,c.id desc limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.search_zuvyr_library(uuid,text,text,uuid,text,text,timestamptz,timestamptz,text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_zuvyr_library(uuid,text,text,uuid,text,text,timestamptz,timestamptz,text,integer,integer) to service_role;
commit;
