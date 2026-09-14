'use strict';
const fs = require('fs');
const assert = require('assert');

const sql = fs.readFileSync(
  'backend/59_pack046_context_graph_deployment_scope_fix.sql',
  'utf8'
);

assert(sql.includes("p_owner_id,'deployment',d.id::text,null"));
assert(sql.includes("'codeProjectId',d.project_id"));
assert(!sql.includes("p_owner_id,'deployment',d.id::text,d.project_id"));
assert(sql.includes("revoke all on function public.refresh_zuvyr_context_graph(uuid)"));
assert(sql.includes("grant execute on function public.refresh_zuvyr_context_graph(uuid)"));
console.log('PASS');
