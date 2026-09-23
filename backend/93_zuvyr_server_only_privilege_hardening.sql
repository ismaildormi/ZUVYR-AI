-- ZUVYR continuous-improvement hardening: server-only conversation chunk access.
--
-- conversation_asset_chunks is consumed through the trusted backend using
-- supabaseAdmin/service_role. Direct anon/authenticated table access and RPC
-- execution are not part of the public client contract. RLS remains enabled as
-- defense in depth; this migration also removes unnecessary grants so the
-- server-only boundary is explicit at both the privilege and RLS layers.

begin;

revoke all privileges on table public.conversation_asset_chunks
  from anon, authenticated;

revoke all privileges on sequence public.conversation_asset_chunks_id_seq
  from anon, authenticated;

revoke execute on function public.search_conversation_asset_chunks(
  uuid,
  uuid[],
  text,
  integer
) from public, anon, authenticated;

-- Preserve the trusted backend execution path explicitly.
grant select, insert, update, delete on table public.conversation_asset_chunks
  to service_role;

grant usage, select on sequence public.conversation_asset_chunks_id_seq
  to service_role;

grant execute on function public.search_conversation_asset_chunks(
  uuid,
  uuid[],
  text,
  integer
) to service_role;

commit;
