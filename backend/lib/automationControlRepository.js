'use strict';

function controlError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw controlError(code);
  }
  return text;
}

function rpcData(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw controlError(code, {
      databaseCode: result && result.error ? result.error.code || null : null,
      databaseMessage: result && result.error ? result.error.message || null : null
    });
  }
  return result.data;
}

function rowData(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw controlError(code, {
      databaseCode: result && result.error ? result.error.code || null : null
    });
  }
  return result.data;
}

function createAutomationControlRepository({ client } = {}) {
  const db = client || require('./supabaseAdmin').supabaseAdmin;
  if (!db || typeof db.rpc !== 'function' || typeof db.from !== 'function') {
    throw controlError('PACK088_CONTROL_DATABASE_REQUIRED');
  }

  return Object.freeze({
    async create({
      ownerId,
      title,
      goal,
      scheduleType,
      runAt,
      intervalMinutes = null,
      recurrenceSpec = {},
      timezone = 'UTC',
      maxCreditsPerRun,
      allowTopup = false
    } = {}) {
      const result = await db.rpc('create_workspace_automation_pack088', {
        p_owner_id: uuid(ownerId, 'PACK088_OWNER_ID_INVALID'),
        p_title: String(title || ''),
        p_goal: String(goal || ''),
        p_schedule_type: String(scheduleType || ''),
        p_run_at_local: String(runAt || ''),
        p_interval_minutes: intervalMinutes == null ? null : Number(intervalMinutes),
        p_recurrence_spec: recurrenceSpec && typeof recurrenceSpec === 'object' ? recurrenceSpec : {},
        p_timezone: String(timezone || 'UTC'),
        p_max_credits_per_run: Number(maxCreditsPerRun),
        p_allow_topup: allowTopup === true,
        p_notification_policy: { in_app: true }
      });
      return rpcData(result, 'PACK088_AUTOMATION_CREATE_FAILED');
    },

    async control({
      ownerId,
      scheduleId,
      action,
      requestToken = null
    } = {}) {
      const result = await db.rpc('control_workspace_schedule_pack088', {
        p_owner_id: uuid(ownerId, 'PACK088_OWNER_ID_INVALID'),
        p_schedule_id: uuid(scheduleId, 'PACK088_SCHEDULE_ID_INVALID'),
        p_action: String(action || ''),
        p_request_token: requestToken == null
          ? null
          : uuid(requestToken, 'PACK088_REQUEST_TOKEN_INVALID')
      });
      return rpcData(result, 'PACK088_AUTOMATION_CONTROL_FAILED');
    },

    async checkRunControl({ runId, claimToken, now = new Date().toISOString() } = {}) {
      const result = await db.rpc('check_workspace_schedule_run_control_pack088', {
        p_run_id: uuid(runId, 'PACK088_RUN_ID_INVALID'),
        p_claim_token: uuid(claimToken, 'PACK088_CLAIM_TOKEN_INVALID'),
        p_now: now
      });
      return rpcData(result, 'PACK088_RUN_CONTROL_CHECK_FAILED');
    },

    async list({ ownerId, limit = 100 } = {}) {
      const result = await db
        .from('workspace_schedules')
        .select('id,workflow_id,title,schedule_type,run_at,interval_minutes,timezone,state,execution_enabled,definition_revision,next_run_at,last_run_at,last_success_at,last_failure_at,last_error_code,recurrence_spec,max_credits_per_run,allow_topup,notification_policy,control_revision,authorization_revoked_at,created_at,updated_at')
        .eq('owner_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .order('updated_at', { ascending: false })
        .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
      return rowData(result, 'PACK088_AUTOMATION_LIST_FAILED') || [];
    },

    async get({ ownerId, scheduleId } = {}) {
      const owner = uuid(ownerId, 'PACK088_OWNER_ID_INVALID');
      const id = uuid(scheduleId, 'PACK088_SCHEDULE_ID_INVALID');
      const scheduleResult = await db
        .from('workspace_schedules')
        .select('id,workflow_id,title,schedule_type,run_at,interval_minutes,timezone,state,execution_enabled,definition_revision,next_run_at,last_run_at,last_success_at,last_failure_at,last_error_code,recurrence_spec,run_input,max_credits_per_run,allow_topup,notification_policy,control_revision,authorization_revoked_at,created_at,updated_at')
        .eq('owner_id', owner)
        .eq('id', id)
        .maybeSingle();
      const schedule = rowData(scheduleResult, 'PACK088_AUTOMATION_LOOKUP_FAILED');
      if (!schedule) throw controlError('PACK088_SCHEDULE_NOT_FOUND');

      const workflowResult = await db
        .from('workspace_workflows')
        .select('id,name,description,revision,request_template,execution_enabled,external_writes_enabled,created_at,updated_at')
        .eq('owner_id', owner)
        .eq('id', schedule.workflow_id)
        .maybeSingle();
      const workflow = rowData(workflowResult, 'PACK088_WORKFLOW_LOOKUP_FAILED');

      return Object.freeze({ schedule, workflow: workflow || null });
    },

    async runs({ ownerId, scheduleId, limit = 100 } = {}) {
      const result = await db
        .from('workspace_schedule_runs')
        .select('id,schedule_id,workflow_id,occurrence_key,scheduled_for,state,task_run_id,usage_record_id,funding_state,attempt_count,error_code,notification_id,cancel_requested_at,created_at,updated_at,completed_at')
        .eq('owner_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .eq('schedule_id', uuid(scheduleId, 'PACK088_SCHEDULE_ID_INVALID'))
        .order('scheduled_for', { ascending: false })
        .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
      return rowData(result, 'PACK088_RUN_LIST_FAILED') || [];
    },

    async run({ ownerId, runId } = {}) {
      const result = await db
        .from('workspace_schedule_runs')
        .select('id,schedule_id,workflow_id,occurrence_key,scheduled_for,state,task_run_id,usage_record_id,funding_state,attempt_count,error_code,notification_id,cancel_requested_at,created_at,updated_at,completed_at')
        .eq('owner_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .eq('id', uuid(runId, 'PACK088_RUN_ID_INVALID'))
        .maybeSingle();
      const row = rowData(result, 'PACK088_RUN_LOOKUP_FAILED');
      if (!row) throw controlError('PACK088_RUN_NOT_FOUND');
      return row;
    },

    async notifications({ ownerId, limit = 100 } = {}) {
      const result = await db
        .from('zuvyr_notifications')
        .select('id,notification_type,title,message,read_at,event_key,metadata,created_at')
        .eq('owner_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .eq('notification_type', 'scheduled_task')
        .order('created_at', { ascending: false })
        .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
      return rowData(result, 'PACK088_NOTIFICATION_LIST_FAILED') || [];
    },

    async markNotificationRead({ ownerId, notificationId } = {}) {
      const result = await db
        .from('zuvyr_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('owner_id', uuid(ownerId, 'PACK088_OWNER_ID_INVALID'))
        .eq('id', uuid(notificationId, 'PACK088_NOTIFICATION_ID_INVALID'))
        .eq('notification_type', 'scheduled_task')
        .select('id,read_at')
        .maybeSingle();
      const row = rowData(result, 'PACK088_NOTIFICATION_READ_FAILED');
      if (!row) throw controlError('PACK088_NOTIFICATION_NOT_FOUND');
      return row;
    }
  });
}

module.exports = {
  controlError,
  createAutomationControlRepository
};
