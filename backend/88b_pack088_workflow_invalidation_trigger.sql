-- ZUVYR PACK088 / Phase 88A FIX2
-- Ensure workflow-derived revision changes invalidate stale schedule authorizations.

begin;

drop trigger if exists trg_pack088_workflow_schedule_invalidation
  on public.workspace_workflows;

create trigger trg_pack088_workflow_schedule_invalidation
after update on public.workspace_workflows
for each row
execute function public.pack088_invalidate_schedule_authorization_on_workflow_change();

commit;
