-- ZUVYR Pack072 — TTS voice-rights / consent foundation
-- Additive only. Voice design/cloning provider execution remains disabled until exact pricing is verified.

begin;

create table if not exists public.zuvyr_voice_rights (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source_audio_asset_id uuid not null references public.conversation_assets(id) on delete restrict,
  canonical_source_asset_id uuid not null references public.zuvyr_assets(id) on delete restrict,
  scope text not null check (scope in ('voice_clone','voice_design_reference')),
  rights_basis text not null check (rights_basis in ('self_voice','documented_permission')),
  evidence_reference text,
  explicit_consent boolean not null check (explicit_consent = true),
  consent_fingerprint text not null check (consent_fingerprint ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    rights_basis <> 'documented_permission'
    or length(btrim(coalesce(evidence_reference,''))) between 3 and 500
  )
);

create index if not exists zuvyr_voice_rights_owner_created_idx
  on public.zuvyr_voice_rights(owner_id,created_at desc);
create index if not exists zuvyr_voice_rights_active_source_idx
  on public.zuvyr_voice_rights(owner_id,source_audio_asset_id,scope,created_at desc)
  where revoked_at is null;
create index if not exists zuvyr_voice_rights_canonical_asset_idx
  on public.zuvyr_voice_rights(canonical_source_asset_id)
  where revoked_at is null;

alter table public.zuvyr_voice_rights enable row level security;

revoke all on public.zuvyr_voice_rights from public,anon,authenticated;
grant select,insert,update on public.zuvyr_voice_rights to service_role;

comment on table public.zuvyr_voice_rights is
  'Pack072 owner-scoped explicit voice-use consent. Independent from model-training consent. Provider cloning/design-reference execution must fail closed without an active matching row.';

commit;
