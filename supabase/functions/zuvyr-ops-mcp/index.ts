import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/zuvyr-ops-mcp`;
const MCP_URL = `${FUNCTION_BASE}/mcp`;
const AUTH_SERVER = `${SUPABASE_URL}/auth/v1`;
const GITHUB_RAW = 'https://raw.githubusercontent.com/ismaildormi/ZUVYR-AI/main';
const GITHUB_API = 'https://api.github.com/repos/ismaildormi/ZUVYR-AI';
const RAILWAY_ORIGIN = 'https://rox-ai-production.up.railway.app';
const WEB_ORIGIN = 'https://rox-ai-sepia.vercel.app';
const SERVER_VERSION = '0.1.0';
const RATE_LIMIT_PER_MINUTE = 60;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function rpcResult(id: unknown, result: unknown) {
  return json({ jsonrpc: '2.0', id, result });
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return json({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
}

function unauthorized() {
  return json(
    { error: 'unauthorized', message: 'A valid owner-scoped ZUVYR authorization is required.' },
    401,
    { 'WWW-Authenticate': `Bearer resource_metadata="${FUNCTION_BASE}/.well-known/oauth-protected-resource"` },
  );
}

async function authenticate(req: Request) {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || !SUPABASE_ANON_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id) return null;

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || profile?.is_admin !== true) return { deniedUserId: data.user.id };
  return { userId: data.user.id };
}

async function audit(userId: string | null, action: string, status: string) {
  try {
    await service.from('admin_logs').insert({ user_id: userId, action: `zuvyr_ops_mcp:${action}`.slice(0, 240), status: status.slice(0, 64) });
  } catch (_) {
    // Audit failure must not leak details. Authorization remains fail-closed elsewhere.
  }
}

async function withinRateLimit(userId: string) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await service
    .from('admin_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .like('action', 'zuvyr_ops_mcp:%')
    .gte('created_at', since);
  if (error) return false;
  return Number(count || 0) < RATE_LIMIT_PER_MINUTE;
}

async function fetchText(url: string, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ZUVYR-Ops-MCP/0.1' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 250_000) };
  } finally {
    clearTimeout(timer);
  }
}

function parseRemainingWork(markdown: string) {
  const items: Array<Record<string, string>> = [];
  const regex = /###\s+(RW-\d+)\s+—\s+([^\n]+)\nStatus:\s+`([^`]+)`(?:\nSubsystem:\s+`([^`]+)`)?/g;
  let match;
  while ((match = regex.exec(markdown))) {
    items.push({ id: match[1], title: match[2].trim(), status: match[3].trim(), ...(match[4] ? { subsystem: match[4].trim() } : {}) });
  }
  return items;
}

async function currentState() {
  const source = await fetchText(`${GITHUB_RAW}/docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json`);
  if (!source.ok) throw new Error(`current_state_source_${source.status}`);
  const parsed = JSON.parse(source.text);
  return {
    source: 'github-main',
    active_pack: parsed.active_pack ?? parsed.activePack ?? null,
    active_phase: parsed.active_phase ?? parsed.activePhase ?? null,
    legal_next: parsed.legal_next ?? parsed.next_legal_work ?? parsed.nextLegalWork ?? null,
    known_unresolved_gates: Array.isArray(parsed.known_unresolved_gates) ? parsed.known_unresolved_gates : [],
    evaluated_from: 'docs/zuvyr/ZUVYR_CURRENT_STATE_OVERRIDE_2026-09-23.json',
  };
}

async function remainingWork() {
  const source = await fetchText(`${GITHUB_RAW}/docs/zuvyr/ZUVYR_REMAINING_WORK.md`);
  if (!source.ok) throw new Error(`remaining_work_source_${source.status}`);
  const items = parseRemainingWork(source.text);
  return {
    source: 'github-main',
    total: items.length,
    open: items.filter(item => item.status !== 'CLOSED'),
    closed: items.filter(item => item.status === 'CLOSED'),
    evaluated_from: 'docs/zuvyr/ZUVYR_REMAINING_WORK.md',
  };
}

async function probe(url: string) {
  const started = performance.now();
  const result = await fetchText(url, 10_000);
  return { url, ok: result.ok, status: result.status, latency_ms: Math.round(performance.now() - started) };
}

async function health() {
  const [healthz, readyz, web] = await Promise.all([
    probe(`${RAILWAY_ORIGIN}/healthz`),
    probe(`${RAILWAY_ORIGIN}/readyz`),
    probe(WEB_ORIGIN),
  ]);
  return { backend: { healthz, readyz }, web, checked_at: new Date().toISOString(), mutations: 0 };
}

async function pack089Status(ownerId: string) {
  const { data: connections, error: connectionError } = await service
    .from('workspace_integration_connections')
    .select('id,integration_key,scopes,explicit_consent,connected,read_enabled,write_enabled,status,account_label,token_expires_at,refresh_token_present,revoked_at,last_error_code,updated_at')
    .eq('owner_id', ownerId)
    .eq('integration_key', 'google_drive')
    .order('updated_at', { ascending: false })
    .limit(5);
  if (connectionError) throw new Error('pack089_connections_query_failed');

  const { count: oauthSessions, error: sessionError } = await service
    .from('workspace_oauth_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('provider', 'google_drive');
  if (sessionError) throw new Error('pack089_sessions_query_failed');

  const { count: auditEvents } = await service
    .from('workspace_audit_events')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);

  return {
    pack: 89,
    owner_scoped: true,
    connections: connections || [],
    oauth_session_count: oauthSessions || 0,
    workspace_audit_event_count: auditEvents || 0,
    secret_fields_returned: false,
    mutations: 0,
  };
}

async function visualQaManifest() {
  const response = await fetch(`${GITHUB_API}/actions/workflows/zuvyr-visual-qa.yml/runs?branch=main&per_page=5`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ZUVYR-Ops-MCP/0.1' },
  });
  if (response.status === 404) return { configured: false, runs: [] };
  if (!response.ok) throw new Error(`visual_qa_github_${response.status}`);
  const payload = await response.json();
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs.slice(0, 5).map((run: any) => ({
    id: run.id,
    status: run.status,
    conclusion: run.conclusion,
    head_sha: run.head_sha,
    event: run.event,
    created_at: run.created_at,
    updated_at: run.updated_at,
    html_url: run.html_url,
  })) : [];
  return { configured: true, runs };
}

const tools = [
  { name: 'zuvyr.current_state', description: 'Read the canonical ZUVYR active PACK, legal next work, and unresolved gates from GitHub main.', inputSchema: { type: 'object', additionalProperties: false } },
  { name: 'zuvyr.remaining_work', description: 'Read the canonical ZUVYR remaining-work ledger and structured open/closed items.', inputSchema: { type: 'object', additionalProperties: false } },
  { name: 'zuvyr.health', description: 'Run safe non-mutating production health/readiness probes for ZUVYR backend and web.', inputSchema: { type: 'object', additionalProperties: false } },
  { name: 'zuvyr.pack089_status', description: 'Read owner-scoped, secret-redacted PACK089 Google Drive integration acceptance state.', inputSchema: { type: 'object', additionalProperties: false } },
  { name: 'zuvyr.visual_qa_manifest', description: 'Read recent ZUVYR visual-QA workflow state for screenshot/accessibility review.', inputSchema: { type: 'object', additionalProperties: false } },
];

async function callTool(name: string, userId: string) {
  switch (name) {
    case 'zuvyr.current_state': return currentState();
    case 'zuvyr.remaining_work': return remainingWork();
    case 'zuvyr.health': return health();
    case 'zuvyr.pack089_status': return pack089Status(userId);
    case 'zuvyr.visual_qa_manifest': return visualQaManifest();
    default: throw Object.assign(new Error('unknown_tool'), { code: -32602 });
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json({
      resource: MCP_URL,
      authorization_servers: [AUTH_SERVER],
      bearer_methods_supported: ['header'],
      resource_documentation: `${GITHUB_RAW}/docs/zuvyr/ZUVYR_REMAINING_WORK.md`,
    });
  }

  if (!url.pathname.endsWith('/mcp')) return json({ error: 'not_found' }, 404);
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });

  const auth = await authenticate(req);
  if (!auth) return unauthorized();
  if ('deniedUserId' in auth) {
    await audit(auth.deniedUserId, 'authorize', 'denied_non_admin');
    return json({ error: 'forbidden', message: 'ZUVYR Ops is restricted to an approved administrator.' }, 403);
  }
  const userId = auth.userId;
  if (!(await withinRateLimit(userId))) {
    await audit(userId, 'rate_limit', 'denied');
    return json({ error: 'rate_limited' }, 429, { 'Retry-After': '60' });
  }

  let request: any;
  try {
    request = await req.json();
  } catch (_) {
    await audit(userId, 'invalid_json', 'error');
    return rpcError(null, -32700, 'Parse error');
  }
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return rpcError(request?.id, -32600, 'Invalid Request');

  const { id, method, params } = request;
  if (method === 'notifications/initialized') return new Response(null, { status: 202, headers: corsHeaders });

  try {
    if (method === 'initialize') {
      await audit(userId, 'initialize', 'success');
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion || '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'zuvyr-ops-mcp', version: SERVER_VERSION },
        instructions: 'Read-only ZUVYR owner operations. Never infer completion from stale evidence; use current state, remaining work, health and acceptance status tools.',
      });
    }
    if (method === 'ping') {
      await audit(userId, 'ping', 'success');
      return rpcResult(id, {});
    }
    if (method === 'tools/list') {
      await audit(userId, 'tools_list', 'success');
      return rpcResult(id, { tools });
    }
    if (method === 'tools/call') {
      const name = String(params?.name || '');
      if (!tools.some(tool => tool.name === name)) return rpcError(id, -32602, 'Unknown tool');
      const result = await callTool(name, userId);
      await audit(userId, `tool:${name}`, 'success');
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: false,
      });
    }
    return rpcError(id, -32601, 'Method not found');
  } catch (error) {
    const code = String((error as any)?.message || 'operation_failed').slice(0, 120);
    await audit(userId, method === 'tools/call' ? `tool:${String(params?.name || 'unknown')}` : method, `error:${code}`);
    return rpcError(id, (error as any)?.code || -32000, 'ZUVYR operation failed', { code });
  }
});
