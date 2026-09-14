begin;

create index if not exists zuvyr_context_edges_from_node_idx
  on public.zuvyr_context_edges(from_node_id);

create index if not exists zuvyr_context_edges_to_node_idx
  on public.zuvyr_context_edges(to_node_id);

create index if not exists zuvyr_context_nodes_project_idx
  on public.zuvyr_context_nodes(project_id)
  where project_id is not null;

commit;
