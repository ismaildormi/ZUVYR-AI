'use strict';

const CONFIG = require('../config/automations.v1.json');

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CAPABILITIES = new Set([
  'chat','image','video','audio','code','research',
  'document','spreadsheet','presentation','export','ip'
]);

function automationError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function requiredText(value, code, max) {
  const text = value == null ? '' : String(value).trim();
  if (!text || text.length > max) throw automationError(code);
  return text;
}

function optionalText(value, code, max) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (text.length > max) throw automationError(code);
  return text;
}

function uuid(value, code) {
  const text = requiredText(value, code, 64);
  if (!UUID.test(text)) throw automationError(code);
  return text;
}

function objectValue(value, code) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw automationError(code);
  }
  return value;
}

function isoTimestamp(value, code) {
  const text = requiredText(value, code, 64);
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw automationError(code);
  return new Date(ms).toISOString();
}

function nullableInteger(value, code, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw automationError(code);
  }
  return number;
}

function normalizeWorkflowDraft(input = {}) {
  return Object.freeze({
    owner_id: uuid(input.ownerId, 'PACK088_OWNER_ID_INVALID'),
    name: requiredText(input.name, 'PACK088_WORKFLOW_NAME_INVALID', 120),
    description: optionalText(input.description, 'PACK088_WORKFLOW_DESCRIPTION_INVALID', 2000),
    request_template: objectValue(input.requestTemplate, 'PACK088_WORKFLOW_REQUEST_TEMPLATE_INVALID'),
    execution_enabled: false,
    external_writes_enabled: false
  });
}

function normalizeWorkflowStep(input = {}) {
  const capability = requiredText(input.capability, 'PACK088_WORKFLOW_CAPABILITY_INVALID', 64);
  if (!CAPABILITIES.has(capability)) {
    throw automationError('PACK088_WORKFLOW_CAPABILITY_INVALID');
  }

  const dependsOn = input.dependsOn == null ? [] : input.dependsOn;
  if (
    !Array.isArray(dependsOn) ||
    dependsOn.some(item => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(String(item)))
  ) {
    throw automationError('PACK088_WORKFLOW_DEPENDENCIES_INVALID');
  }

  return Object.freeze({
    step_key: requiredText(input.stepKey, 'PACK088_WORKFLOW_STEP_KEY_INVALID', 64),
    position: nullableInteger(input.position, 'PACK088_WORKFLOW_POSITION_INVALID', { min: 0, max: 19 }),
    capability,
    depends_on: [...dependsOn],
    input_template: objectValue(input.inputTemplate, 'PACK088_WORKFLOW_INPUT_TEMPLATE_INVALID'),
    execution_enabled: false
  });
}

function normalizeScheduleDraft(input = {}) {
  const scheduleType = requiredText(input.scheduleType, 'PACK088_SCHEDULE_TYPE_INVALID', 16);
  if (!CONFIG.schedule.types.includes(scheduleType)) {
    throw automationError('PACK088_SCHEDULE_TYPE_INVALID');
  }

  const intervalMinutes = nullableInteger(
    input.intervalMinutes,
    'PACK088_INTERVAL_INVALID',
    { min: 60, max: 525600 }
  );
  const recurrenceSpec = objectValue(
    input.recurrenceSpec,
    'PACK088_RECURRENCE_SPEC_INVALID'
  );

  if (scheduleType === 'once' && intervalMinutes != null) {
    throw automationError('PACK088_ONCE_INTERVAL_FORBIDDEN');
  }
  if (
    scheduleType === 'recurring' &&
    intervalMinutes == null &&
    Object.keys(recurrenceSpec).length === 0
  ) {
    throw automationError('PACK088_RECURRING_SPEC_REQUIRED');
  }

  const misfirePolicy =
    input.misfirePolicy == null
      ? 'run_once'
      : requiredText(input.misfirePolicy, 'PACK088_MISFIRE_POLICY_INVALID', 32);
  if (!CONFIG.schedule.misfirePolicies.includes(misfirePolicy)) {
    throw automationError('PACK088_MISFIRE_POLICY_INVALID');
  }

  return Object.freeze({
    owner_id: uuid(input.ownerId, 'PACK088_OWNER_ID_INVALID'),
    workflow_id: uuid(input.workflowId, 'PACK088_WORKFLOW_ID_INVALID'),
    title: requiredText(input.title, 'PACK088_SCHEDULE_TITLE_INVALID', 120),
    schedule_type: scheduleType,
    run_at: isoTimestamp(input.runAt, 'PACK088_RUN_AT_INVALID'),
    interval_minutes: intervalMinutes,
    timezone: requiredText(input.timezone, 'PACK088_TIMEZONE_INVALID', 64),
    state: 'draft',
    execution_enabled: false,
    recurrence_spec: recurrenceSpec,
    run_input: objectValue(input.runInput, 'PACK088_RUN_INPUT_INVALID'),
    misfire_policy: misfirePolicy,
    max_credits_per_run: nullableInteger(
      input.maxCreditsPerRun,
      'PACK088_MAX_CREDITS_INVALID',
      { min: 0, max: CONFIG.schedule.maxCreditsPerRun }
    ),
    allow_topup: input.allowTopup === true,
    notification_policy: objectValue(
      input.notificationPolicy == null
        ? { in_app: true }
        : input.notificationPolicy,
      'PACK088_NOTIFICATION_POLICY_INVALID'
    ),
    authorized_device_id:
      input.authorizedDeviceId == null
        ? null
        : uuid(input.authorizedDeviceId, 'PACK088_DEVICE_ID_INVALID')
  });
}

function dataOrThrow(result, code) {
  if (!result || typeof result !== 'object' || result.error) {
    throw automationError(code, {
      databaseCode: result && result.error ? result.error.code || null : null
    });
  }
  return result.data;
}

function createAutomationRepository({ client } = {}) {
  if (!client || typeof client.from !== 'function') {
    throw automationError('PACK088_DATABASE_CLIENT_REQUIRED');
  }

  async function assertWorkflowOwner(ownerId, workflowId) {
    const result = await client
      .from('workspace_workflows')
      .select('id,owner_id,revision')
      .eq('id', workflowId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    const row = dataOrThrow(result, 'PACK088_WORKFLOW_LOOKUP_FAILED');
    if (!row) throw automationError('PACK088_WORKFLOW_NOT_FOUND');
    return row;
  }

  return Object.freeze({
    async createWorkflowDraft(input = {}) {
      const row = normalizeWorkflowDraft(input);
      const result = await client
        .from('workspace_workflows')
        .insert([row])
        .select('id,owner_id,name,description,revision,last_revision_at,request_template,execution_enabled,external_writes_enabled,created_at,updated_at')
        .single();
      return dataOrThrow(result, 'PACK088_WORKFLOW_CREATE_FAILED');
    },

    async addWorkflowStep(input = {}) {
      const ownerId = uuid(input.ownerId, 'PACK088_OWNER_ID_INVALID');
      const workflowId = uuid(input.workflowId, 'PACK088_WORKFLOW_ID_INVALID');
      await assertWorkflowOwner(ownerId, workflowId);

      const row = {
        workflow_id: workflowId,
        ...normalizeWorkflowStep(input)
      };

      const result = await client
        .from('workspace_workflow_steps')
        .insert([row])
        .select('id,workflow_id,step_key,position,capability,depends_on,input_template,execution_enabled')
        .single();
      return dataOrThrow(result, 'PACK088_WORKFLOW_STEP_CREATE_FAILED');
    },

    async createScheduleDraft(input = {}) {
      const row = normalizeScheduleDraft(input);
      await assertWorkflowOwner(row.owner_id, row.workflow_id);

      const result = await client
        .from('workspace_schedules')
        .insert([row])
        .select('id,owner_id,workflow_id,title,schedule_type,run_at,interval_minutes,timezone,state,execution_enabled,definition_revision,recurrence_spec,run_input,misfire_policy,max_credits_per_run,allow_topup,notification_policy,authorized_device_id,created_at,updated_at')
        .single();
      return dataOrThrow(result, 'PACK088_SCHEDULE_CREATE_FAILED');
    },

    async getSchedule({ ownerId, scheduleId } = {}) {
      const owner = uuid(ownerId, 'PACK088_OWNER_ID_INVALID');
      const id = uuid(scheduleId, 'PACK088_SCHEDULE_ID_INVALID');
      const result = await client
        .from('workspace_schedules')
        .select('*')
        .eq('id', id)
        .eq('owner_id', owner)
        .maybeSingle();
      const row = dataOrThrow(result, 'PACK088_SCHEDULE_LOOKUP_FAILED');
      if (!row) throw automationError('PACK088_SCHEDULE_NOT_FOUND');
      return row;
    },

    async listSchedules({ ownerId, limit = 100 } = {}) {
      const owner = uuid(ownerId, 'PACK088_OWNER_ID_INVALID');
      const normalizedLimit = nullableInteger(
        limit,
        'PACK088_LIST_LIMIT_INVALID',
        { min: 1, max: 200 }
      );
      const result = await client
        .from('workspace_schedules')
        .select('*')
        .eq('owner_id', owner)
        .order('updated_at', { ascending: false })
        .limit(normalizedLimit);
      return dataOrThrow(result, 'PACK088_SCHEDULE_LIST_FAILED') || [];
    },

    async listRuns({ ownerId, scheduleId, limit = 100 } = {}) {
      const owner = uuid(ownerId, 'PACK088_OWNER_ID_INVALID');
      const schedule = uuid(scheduleId, 'PACK088_SCHEDULE_ID_INVALID');
      const normalizedLimit = nullableInteger(
        limit,
        'PACK088_LIST_LIMIT_INVALID',
        { min: 1, max: 200 }
      );
      const result = await client
        .from('workspace_schedule_runs')
        .select('*')
        .eq('owner_id', owner)
        .eq('schedule_id', schedule)
        .order('scheduled_for', { ascending: false })
        .limit(normalizedLimit);
      return dataOrThrow(result, 'PACK088_RUN_LIST_FAILED') || [];
    }
  });
}

module.exports = {
  CONFIG,
  CAPABILITIES,
  automationError,
  normalizeWorkflowDraft,
  normalizeWorkflowStep,
  normalizeScheduleDraft,
  createAutomationRepository
};
