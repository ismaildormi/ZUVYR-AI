-- ZUVYR Pack052 — Canonical attachment identity bridge
-- Makes one stable attachment id reusable across Chat, Code and Work while
-- preserving legacy conversation_assets ids for historic conversations.

begin;

alter table public.conversation_assets
  add column if not exists canonical_asset_id uuid
    references public.zuvyr_assets(id) on delete set null;

create index if not exists conversation_assets_canonical_asset_idx
  on public.conversation_assets(owner_id, canonical_asset_id)
  where canonical_asset_id is not null;

create or replace function public.pack052_conversation_asset_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.zuvyr_assets%rowtype;
  v_kind text;
  v_content jsonb;
  v_asset jsonb;
  v_version_id uuid;
begin
  if new.canonical_asset_id is not null then
    return new;
  end if;

  if lower(coalesce(new.scan_status,'')) <> 'clean'
     or new.canonical_content_id is null
     or new.storage_bucket <> 'conversation-files'
     or nullif(btrim(coalesce(new.storage_path,'')),'') is null
     or nullif(btrim(coalesce(new.mime_type,'')),'') is null
     or new.file_size_bytes is null
     or new.file_size_bytes < 0
     or lower(coalesce(new.sha256,'')) !~ '^[0-9a-f]{64}$' then
    return new;
  end if;

  -- Reuse an already-owned canonical asset when the same bytes were uploaded
  -- previously. This avoids Pack042's intentional owner-level dedupe conflict.
  select * into v_existing
  from public.zuvyr_assets a
  where a.owner_id = new.owner_id
    and a.sha256 = lower(new.sha256)
    and a.file_size_bytes = new.file_size_bytes
    and a.mime_type = lower(new.mime_type)
    and a.status = 'active'
  order by a.created_at asc
  limit 1;

  if v_existing.id is not null then
    new.canonical_asset_id := v_existing.id;
    new.canonical_content_id := v_existing.canonical_content_id;
    return new;
  end if;

  v_kind := case lower(coalesce(new.asset_type,''))
    when 'image' then 'image'
    when 'video' then 'video'
    when 'audio' then 'audio'
    when 'code' then 'code'
    when 'file' then 'document'
    when 'document' then 'document'
    when 'reference' then 'document'
    else null
  end;

  if v_kind is null then return new; end if;

  -- Once the digest is known, record an immutable content version that reflects
  -- the real stored bytes rather than the pre-scan placeholder version.
  v_content := public.upsert_zuvyr_content_version(
    new.owner_id,
    null,
    v_kind,
    coalesce(new.original_name, v_kind || ' attachment'),
    'uploaded',
    'conversation_asset',
    new.id::text,
    'sha256:' || lower(new.sha256),
    jsonb_build_object(
      'conversationId', new.conversation_id,
      'messageId', new.message_id,
      'attachmentIdentity', 'pack052'
    ),
    jsonb_build_object(
      'mimeType', lower(new.mime_type),
      'uri', new.url,
      'sha256', lower(new.sha256),
      'payload', jsonb_build_object(
        'storageBucket', new.storage_bucket,
        'storagePath', new.storage_path,
        'fileSizeBytes', new.file_size_bytes,
        'scanStatus', new.scan_status,
        'extractionStatus', new.extraction_status
      ),
      'provenance', jsonb_build_object(
        'conversationId', new.conversation_id,
        'messageId', new.message_id,
        'legacyConversationAssetId', new.id
      )
    )
  );

  new.canonical_content_id := (v_content->>'contentId')::uuid;
  v_version_id := (v_content->>'versionId')::uuid;

  v_asset := public.register_zuvyr_asset(
    new.owner_id,
    new.canonical_content_id,
    v_version_id,
    new.storage_bucket,
    new.storage_path,
    lower(new.mime_type),
    new.file_size_bytes,
    lower(new.sha256),
    'standard',
    null,
    jsonb_build_object(
      'source', 'pack052_attachment_identity',
      'legacyConversationAssetId', new.id,
      'conversationId', new.conversation_id,
      'originalName', new.original_name
    )
  );

  new.canonical_asset_id := (v_asset->>'assetId')::uuid;
  return new;
end
$$;

drop trigger if exists pack052_conversation_asset_identity_trg
  on public.conversation_assets;
create trigger pack052_conversation_asset_identity_trg
before insert or update of sha256, scan_status, canonical_content_id,
  storage_bucket, storage_path, mime_type, file_size_bytes
on public.conversation_assets
for each row execute function public.pack052_conversation_asset_identity();

revoke all on function public.pack052_conversation_asset_identity()
  from public, anon, authenticated;
grant execute on function public.pack052_conversation_asset_identity()
  to service_role;

-- Backfill eligible historic clean attachments. UPDATE OF fires even when the
-- digest value is unchanged, so the trigger performs the canonical binding.
update public.conversation_assets
set sha256 = sha256
where canonical_asset_id is null
  and lower(coalesce(scan_status,'')) = 'clean'
  and canonical_content_id is not null
  and storage_bucket = 'conversation-files'
  and storage_path is not null
  and mime_type is not null
  and file_size_bytes is not null
  and lower(coalesce(sha256,'')) ~ '^[0-9a-f]{64}$';

commit;
