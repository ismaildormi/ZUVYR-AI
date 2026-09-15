-- ZUVYR V1 PACK054: durable normalized sources/citations.
-- Additive: source rows are captured from assistant message content in the same DB transaction.

alter table public.conversation_sources
  add column if not exists canonical_asset_id uuid references public.zuvyr_assets(id) on delete set null,
  add column if not exists canonical_content_id uuid references public.zuvyr_content_objects(id) on delete set null,
  add column if not exists project_id uuid references public.workspace_projects(id) on delete set null,
  add column if not exists verified_at timestamptz;

create index if not exists conversation_sources_owner_message_idx
  on public.conversation_sources(owner_id, conversation_id, message_id, created_at);

create index if not exists conversation_sources_project_idx
  on public.conversation_sources(project_id, created_at desc)
  where project_id is not null;

create index if not exists conversation_sources_canonical_asset_idx
  on public.conversation_sources(canonical_asset_id, created_at desc)
  where canonical_asset_id is not null;

create or replace function public.zuvyr_capture_message_sources()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source jsonb;
  v_type text;
  v_citation text;
  v_title text;
  v_url text;
  v_snippet text;
  v_external text;
  v_asset_id uuid;
  v_canonical_asset_id uuid;
  v_canonical_content_id uuid;
  v_project_id uuid;
  v_uuid uuid;
begin
  if new.role <> 'assistant'
     or jsonb_typeof(new.content->'sources') is distinct from 'array'
  then
    return new;
  end if;

  select wpi.project_id
    into v_project_id
  from public.workspace_items wi
  join public.workspace_project_items wpi on wpi.item_id = wi.id
  join public.workspace_projects wp on wp.id = wpi.project_id
  where wi.owner_id = new.owner_id
    and wp.owner_id = new.owner_id
    and wi.resource_type = 'conversation'
    and wi.source_id = new.conversation_id
  order by wpi.added_at asc
  limit 1;

  for v_source in
    select value
    from jsonb_array_elements(new.content->'sources')
    limit 50
  loop
    v_type := lower(btrim(coalesce(v_source->>'type', 'web')));
    if v_type not in ('file','web','product','memory') then
      raise exception 'conversation_source_type_invalid';
    end if;

    v_citation := left(btrim(coalesce(v_source->>'citationId','')), 80);
    if v_citation = '' then
      raise exception 'conversation_source_citation_invalid';
    end if;

    v_title := left(
      btrim(
        regexp_replace(
          coalesce(v_source->>'title', v_source->>'name', v_type || ' source'),
          '\s+',
          ' ',
          'g'
        )
      ),
      240
    );
    if v_title = '' then
      raise exception 'conversation_source_title_invalid';
    end if;

    v_snippet := left(
      btrim(regexp_replace(coalesce(v_source->>'snippet',''), '\s+', ' ', 'g')),
      1200
    );

    v_url := nullif(btrim(coalesce(v_source->>'url','')), '');
    if v_url is not null and v_url !~ '^https://' then
      raise exception 'conversation_source_url_invalid';
    end if;
    if v_type in ('web','product') and v_url is null then
      raise exception 'conversation_source_url_required';
    end if;

    v_external := nullif(
      left(
        btrim(coalesce(v_source->>'externalId', v_source->>'id', '')),
        180
      ),
      ''
    );

    v_asset_id := null;
    v_canonical_asset_id := null;
    v_canonical_content_id := null;
    v_uuid := null;

    if v_type = 'file' then
      if v_external is null
         or v_external !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then
        raise exception 'conversation_source_file_id_invalid';
      end if;

      v_uuid := v_external::uuid;

      select ca.id, ca.canonical_asset_id, ca.canonical_content_id
        into v_asset_id, v_canonical_asset_id, v_canonical_content_id
      from public.conversation_assets ca
      where ca.owner_id = new.owner_id
        and ca.scan_status = 'clean'
        and (ca.id = v_uuid or ca.canonical_asset_id = v_uuid)
      order by
        case when ca.conversation_id = new.conversation_id then 0 else 1 end,
        ca.created_at desc
      limit 1;

      if v_asset_id is null then
        select za.id, za.canonical_content_id
          into v_canonical_asset_id, v_canonical_content_id
        from public.zuvyr_assets za
        where za.id = v_uuid
          and za.owner_id = new.owner_id
          and za.status = 'active'
        limit 1;
      end if;

      if v_asset_id is null and v_canonical_asset_id is null then
        raise exception 'conversation_source_file_not_owned';
      end if;
    elsif v_type = 'memory' then
      if v_external is null
         or v_external !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then
        raise exception 'conversation_source_memory_id_invalid';
      end if;

      v_uuid := v_external::uuid;
      if not exists (
        select 1
        from public.zuvyr_memories m
        where m.id = v_uuid and m.owner_id = new.owner_id
      ) then
        raise exception 'conversation_source_memory_not_owned';
      end if;
    end if;

    insert into public.conversation_sources (
      conversation_id,
      message_id,
      owner_id,
      source_type,
      citation_key,
      title,
      url,
      snippet,
      asset_id,
      canonical_asset_id,
      canonical_content_id,
      project_id,
      external_id,
      metadata,
      verified_at
    )
    values (
      new.conversation_id,
      new.id,
      new.owner_id,
      v_type,
      v_citation,
      v_title,
      v_url,
      v_snippet,
      v_asset_id,
      v_canonical_asset_id,
      v_canonical_content_id,
      v_project_id,
      v_external,
      case
        when jsonb_typeof(v_source->'metadata') = 'object'
          then v_source->'metadata'
        else '{}'::jsonb
      end,
      now()
    )
    on conflict (message_id, citation_key)
    do update set
      source_type = excluded.source_type,
      title = excluded.title,
      url = excluded.url,
      snippet = excluded.snippet,
      asset_id = excluded.asset_id,
      canonical_asset_id = excluded.canonical_asset_id,
      canonical_content_id = excluded.canonical_content_id,
      project_id = excluded.project_id,
      external_id = excluded.external_id,
      metadata = excluded.metadata,
      verified_at = excluded.verified_at;
  end loop;

  return new;
end;
$$;

drop trigger if exists zuvyr_capture_message_sources_trg
  on public.conversation_messages;

create trigger zuvyr_capture_message_sources_trg
after insert or update of content on public.conversation_messages
for each row
execute function public.zuvyr_capture_message_sources();

revoke all on function public.zuvyr_capture_message_sources()
  from public, anon, authenticated;

grant execute on function public.zuvyr_capture_message_sources()
  to service_role;

-- Backfill durable source rows already embedded in assistant messages.
update public.conversation_messages
set content = content
where role = 'assistant'
  and jsonb_typeof(content->'sources') = 'array'
  and jsonb_array_length(content->'sources') > 0;

comment on column public.conversation_sources.canonical_asset_id is
  'PACK054 owner-verified canonical asset identity for durable file citations.';

comment on column public.conversation_sources.project_id is
  'PACK054 project containing the cited conversation at capture time.';
