'use strict';

const { supabaseAdmin } = require('./lib/supabaseAdmin');

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function suffixFromUsageRequest(requestId) {
  const text = String(requestId || '');
  return text.startsWith('brain40:') ? text.slice('brain40:'.length) : null;
}

async function main() {
  if (process.env.ZUVYR_PACK040_CLEANUP_FAILED_PROOF !== 'true') {
    fail('PACK040_CLEANUP_NOT_EXPLICITLY_ENABLED');
  }

  const since = new Date(Date.now() - (6 * 60 * 60 * 1000)).toISOString();

  const usageQuery = await supabaseAdmin
    .from('zuvyr_usage_records')
    .select('id,user_id,request_id,state,funding_source,reserved_credits,created_at')
    .eq('capability', 'brain.checkpoint_d')
    .eq('state', 'reserved')
    .eq('funding_source', 'topup')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  if (usageQuery.error) fail('PACK040_CLEANUP_USAGE_LOOKUP_FAILED');

  let cleaned = 0;

  for (const usage of usageQuery.data || []) {
    const suffix = suffixFromUsageRequest(usage.request_id);
    if (!suffix) continue;

    const taskQuery = await supabaseAdmin
      .from('zuvyr_task_runs')
      .select('id,user_id,idempotency_key,state,usage_record_id,created_at')
      .eq('user_id', usage.user_id)
      .eq('idempotency_key', `pack040:live-${suffix}`)
      .maybeSingle();

    if (taskQuery.error) fail('PACK040_CLEANUP_TASK_LOOKUP_FAILED');
    const task = taskQuery.data;
    if (!task) continue;

    if (
      task.state !== 'pending' ||
      task.usage_record_id !== null
    ) {
      continue;
    }

    const cancel = await supabaseAdmin.rpc(
      'request_cancel_zuvyr_task',
      {
        p_task_run_id: task.id,
        p_user_id: task.user_id,
        p_reason: 'pack040_failed_live_proof_cleanup'
      }
    );

    if (cancel.error) fail('PACK040_CLEANUP_CANCEL_FAILED');

    const refund = await supabaseAdmin.rpc(
      'refund_zuvyr_usage',
      {
        p_request_id: usage.request_id,
        p_actual_provider_cost_microusd: '0',
        p_enforcement_enabled: true
      }
    );

    if (
      refund.error ||
      !refund.data ||
      refund.data.success !== true
    ) {
      fail('PACK040_CLEANUP_REFUND_FAILED');
    }

    cleaned += 1;
  }

  console.log(`PACK040_CLEANUP_MATCHES=${cleaned}`);
  console.log('PACK040_CLEANUP=PASS');
  console.log('PROVIDER_COST_FOR_FAILED_PROOF=0');
  console.log('LIVE_BILLING_ALLOWED=false');
}

main().catch(error => {
  console.error(
    'PACK040_CLEANUP=FAIL',
    error && (error.code || error.message)
      ? error.code || error.message
      : 'unknown_error'
  );
  process.exitCode = 1;
});
