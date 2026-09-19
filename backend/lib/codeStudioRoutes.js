'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { publicInventory } = require('./codeStudioRegistry');
const {
  normalizeCodeProject,
  normalizeProjectPath
} = require('./codeProjectContract');
const { buildCodeArchiveManifest } = require('./codeArchiveManifest');
const {
  assertRuntimeRequestAllowed,
  runtimeStatus
} = require('./codeRuntimePolicy');
const {
  createCodeStudioUsageBridge
} = require('./codeStudioUsageBridge');
const {
  createCodeProjectRepository
} = require('./codeProjectRepository');
const { supabaseAdmin } = require('./supabaseAdmin');
const {
  routeRequest: defaultRouteRequest
} = require('../aiRouter');
const {
  canonicalPlanIdFromProfile,
  isPaidPlan,
  planHasFeature
} = require('./planEntitlements');
const { featureCost } = require('../src/core/config');
const { CREDIT_PRICE_USD } = require('./creditEconomics');

const CODE_EDIT_RESERVATION_CREDITS = 10;
const MAX_AI_EDIT_INSTRUCTION = 8000;
const MAX_AI_EDIT_TARGETS = 8;
const MAX_AI_EDIT_CONTEXT_CHARS = 160000;

function failureStatus(error) {
  const code = String(error?.code || '');
  if (code === 'code_project_not_found') return 404;
  if (
    code === 'pack075_revision_conflict' ||
    code === 'pack075_branch_exists' ||
    code === 'pack075_branch_not_active' ||
    code === 'code_ai_edit_in_progress' ||
    code === 'code_ai_edit_idempotency_scope_mismatch' ||
    code === 'code_ai_edit_previous_failed'
  ) return 409;
  if (code === 'code_requires_plan') return 403;
  if (code === 'insufficient_credits') return 402;
  if (
    code === 'code_ai_edit_provider_failed' ||
    code === 'code_ai_edit_output_invalid'
  ) return 502;
  if (
    code.includes('disabled') ||
    code.startsWith('blocked_') ||
    code.endsWith('_unavailable')
  ) return 503;
  return 400;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function errorResponse(res, error, fallback = 'code_studio_request_failed') {
  const code = String(error?.code || fallback);
  return res.status(failureStatus(error)).json({
    status: 'error',
    code,
    message: 'Code Studio request failed.'
  });
}

function requiredInstruction(value) {
  const instruction = String(value || '').trim();
  if (!instruction || instruction.length > MAX_AI_EDIT_INSTRUCTION) {
    const error = new Error('code_ai_edit_instruction_invalid');
    error.code = 'code_ai_edit_instruction_invalid';
    throw error;
  }
  return instruction;
}

function parseAiEditOutput(value) {
  let text = String(value || '').trim();
  text = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) {
    const error = new Error('code_ai_edit_output_invalid');
    error.code = 'code_ai_edit_output_invalid';
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch (_) {
    const error = new Error('code_ai_edit_output_invalid');
    error.code = 'code_ai_edit_output_invalid';
    throw error;
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !Array.isArray(parsed.files) ||
    parsed.files.length > MAX_AI_EDIT_TARGETS
  ) {
    const error = new Error('code_ai_edit_output_invalid');
    error.code = 'code_ai_edit_output_invalid';
    throw error;
  }

  return {
    summary: String(parsed.summary || '').trim().slice(0, 2000),
    files: parsed.files
  };
}

function normalizeAiTargets(project, rawTargets) {
  const files = new Map(project.files.map(file => [file.path, file]));
  let values = Array.isArray(rawTargets)
    ? rawTargets
    : [];

  if (!values.length) {
    values = [
      project.editorState?.activeFile ||
      project.entryFile ||
      project.files[0]?.path
    ].filter(Boolean);
  }

  const targets = [...new Set(
    values
      .map(value => normalizeProjectPath(value))
      .filter(Boolean)
  )];

  if (!targets.length || targets.length > MAX_AI_EDIT_TARGETS) {
    const error = new Error('code_ai_edit_targets_invalid');
    error.code = 'code_ai_edit_targets_invalid';
    throw error;
  }

  for (const path of targets) {
    if (!files.has(path)) {
      const error = new Error('code_ai_edit_target_not_found');
      error.code = 'code_ai_edit_target_not_found';
      throw error;
    }
  }

  const contextChars = targets.reduce(
    (sum, path) => sum + String(files.get(path)?.content || '').length,
    0
  );
  if (contextChars > MAX_AI_EDIT_CONTEXT_CHARS) {
    const error = new Error('code_ai_edit_context_too_large');
    error.code = 'code_ai_edit_context_too_large';
    throw error;
  }

  return Object.freeze(targets);
}

function mergeAiEdits(project, targets, output) {
  const targetSet = new Set(targets);
  const byPath = new Map(
    project.files.map(file => [
      file.path,
      {
        path: file.path,
        content: file.content,
        language: file.language
      }
    ])
  );

  const changedPaths = [];

  for (const candidate of output.files) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
      const error = new Error('code_ai_edit_output_invalid');
      error.code = 'code_ai_edit_output_invalid';
      throw error;
    }

    const path = normalizeProjectPath(candidate.path);
    if (!targetSet.has(path) || !byPath.has(path)) {
      const error = new Error('code_ai_edit_scope_violation');
      error.code = 'code_ai_edit_scope_violation';
      throw error;
    }
    if (typeof candidate.content !== 'string') {
      const error = new Error('code_ai_edit_output_invalid');
      error.code = 'code_ai_edit_output_invalid';
      throw error;
    }

    const current = byPath.get(path);
    const next = {
      path,
      content: candidate.content,
      language:
        typeof candidate.language === 'string' && candidate.language.trim()
          ? candidate.language.trim().toLowerCase().slice(0, 40)
          : current.language
    };

    if (
      next.content !== current.content ||
      next.language !== current.language
    ) {
      changedPaths.push(path);
      byPath.set(path, next);
    }
  }

  const normalized = normalizeCodeProject({
    name: project.name,
    entryFile: project.entryFile,
    files: [...byPath.values()]
  });

  return Object.freeze({
    project: normalized,
    changedPaths: Object.freeze(changedPaths)
  });
}

async function ownerPlan(db, ownerId) {
  const result = await db
    .from('profiles')
    .select('subscription_status')
    .eq('id', ownerId)
    .maybeSingle();
  if (result.error) {
    const error = new Error('code_plan_lookup_failed');
    error.code = 'code_plan_lookup_failed';
    throw error;
  }
  return canonicalPlanIdFromProfile(result.data || {});
}

function finalCodeCredits(providerCostUsd) {
  const cost = Number(providerCostUsd);
  if (!Number.isFinite(cost) || cost < 0) {
    const error = new Error('code_ai_edit_cost_invalid');
    error.code = 'code_ai_edit_cost_invalid';
    throw error;
  }
  return Math.max(
    featureCost('code').credits,
    Math.ceil((cost * 2) / CREDIT_PRICE_USD)
  );
}

function createCodeStudioRouter({
  creditApi = null,
  db = supabaseAdmin,
  routeRequestImpl = defaultRouteRequest
} = {}) {
  const router = express.Router();
  const usageBridge = createCodeStudioUsageBridge(creditApi || {});
  const projects = createCodeProjectRepository(db);

  router.get(
    '/capabilities',
    (_req, res) =>
      res.json({
        status: 'success',
        ...publicInventory(),
        runtime: runtimeStatus(),
        pack075: {
          durableProjects: true,
          branches: true,
          versions: true,
          editorState: true,
          meteredAiEdits: true,
          previewAvailable: false,
          previewStatus: 'preview_unavailable_until_pack078'
        }
      })
  );

  router.post('/projects/validate', (req, res) => {
    try {
      const project = normalizeCodeProject(req.body?.project);
      const manifest = buildCodeArchiveManifest(project);
      const preview = req.body?.includePreview === true
        ? {
            available: false,
            status: 'preview_unavailable_until_pack078',
            message: 'Preview unavailable until a verified isolated runtime is connected.'
          }
        : undefined;
      return res.json({ status: 'success', manifest, preview });
    } catch (error) {
      return errorResponse(res, error, 'invalid_code_project');
    }
  });

  router.get('/projects', async (req, res) => {
    try {
      const items = await projects.list({
        ownerId: req.userId,
        limit: req.query?.limit
      });
      return res.json({ status: 'success', projects: items });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.post('/projects', async (req, res) => {
    try {
      const project = await projects.create({
        ownerId: req.userId,
        project: req.body?.project,
        metadata: {
          ...(req.body?.metadata &&
          typeof req.body.metadata === 'object' &&
          !Array.isArray(req.body.metadata)
            ? req.body.metadata
            : {}),
          createdBy: 'pack075_code_studio'
        }
      });
      return res.status(201).json({ status: 'success', project });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.get('/projects/:projectId', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const project = await projects.get({
        ownerId: req.userId,
        projectId: req.params.projectId
      });
      return res.json({ status: 'success', project });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.put('/projects/:projectId', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const project = await projects.save({
        ownerId: req.userId,
        projectId: req.params.projectId,
        project: req.body?.project,
        expectedRevision: req.body?.expectedRevision,
        branchName: req.body?.branchName,
        reason: req.body?.reason || 'manual_save'
      });
      return res.json({ status: 'success', project });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.delete('/projects/:projectId', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const result = await projects.archive({
        ownerId: req.userId,
        projectId: req.params.projectId
      });
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.get('/projects/:projectId/versions', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const project = await projects.get({
        ownerId: req.userId,
        projectId: req.params.projectId
      });
      return res.json({
        status: 'success',
        projectId: project.id,
        currentBranch: project.currentBranch,
        revision: project.revision,
        versions: project.versions,
        branches: project.branches
      });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.post('/projects/:projectId/branches', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const project = await projects.createBranch({
        ownerId: req.userId,
        projectId: req.params.projectId,
        name: req.body?.name
      });
      return res.status(201).json({ status: 'success', project });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.post('/projects/:projectId/branches/:branch/switch', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const project = await projects.switchBranch({
        ownerId: req.userId,
        projectId: req.params.projectId,
        name: req.params.branch,
        expectedRevision: req.body?.expectedRevision
      });
      return res.json({ status: 'success', project });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.patch('/projects/:projectId/editor-state', async (req, res) => {
    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const editorState = await projects.saveEditorState({
        ownerId: req.userId,
        projectId: req.params.projectId,
        openFiles: req.body?.openFiles,
        activeFile: req.body?.activeFile,
        dividerBasisPoints: req.body?.dividerBasisPoints,
        previewVisible: req.body?.previewVisible,
        mobilePane: req.body?.mobilePane,
        logsVisible: req.body?.logsVisible
      });
      return res.json({ status: 'success', editorState });
    } catch (error) {
      return errorResponse(res, error);
    }
  });

  router.post('/projects/:projectId/ai-edit', async (req, res) => {
    let requestId = '';
    let receiptStarted = false;
    let reservationStarted = false;
    let settlementDone = false;

    try {
      if (!uuid(req.params.projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }

      const instruction = requiredInstruction(req.body?.instruction);
      const project = await projects.get({
        ownerId: req.userId,
        projectId: req.params.projectId
      });

      const suppliedRevision = Number(req.body?.expectedRevision);
      if (
        Number.isSafeInteger(suppliedRevision) &&
        suppliedRevision !== project.revision
      ) {
        const error = new Error('pack075_revision_conflict');
        error.code = 'pack075_revision_conflict';
        throw error;
      }

      const planId = await ownerPlan(db, req.userId);
      if (!planHasFeature(planId, 'code')) {
        const error = new Error('code_requires_plan');
        error.code = 'code_requires_plan';
        throw error;
      }

      const targets = normalizeAiTargets(project, req.body?.targetPaths);
      const instructionSha256 = crypto
        .createHash('sha256')
        .update(instruction, 'utf8')
        .digest('hex');

      requestId =
        String(req.headers['idempotency-key'] || '').trim() ||
        crypto.randomUUID();

      if (requestId.length > 200) {
        const error = new Error('code_ai_edit_idempotency_key_invalid');
        error.code = 'code_ai_edit_idempotency_key_invalid';
        throw error;
      }

      const started = await projects.beginAiEdit({
        ownerId: req.userId,
        projectId: project.id,
        requestId,
        instructionSha256,
        targetPaths: targets
      });
      receiptStarted = true;

      if (started.replayed) {
        if (started.receipt.status === 'succeeded') {
          return res.json({
            status: 'success',
            replayed: true,
            aiEdit: started.receipt
          });
        }
        const error = new Error(
          started.receipt.status === 'processing'
            ? 'code_ai_edit_in_progress'
            : 'code_ai_edit_previous_failed'
        );
        error.code = error.message;
        throw error;
      }

      await usageBridge.reserveUsage({
        userId: req.userId,
        requestId,
        projectId: project.id,
        taskId: requestId,
        stepId: 'ai-edit',
        usageKind: 'ai_code_edit',
        creditsConsumed: CODE_EDIT_RESERVATION_CREDITS,
        modelUsed: 'code-router'
      });
      reservationStarted = true;

      const byPath = new Map(project.files.map(file => [file.path, file]));
      const messages = [
        {
          role: 'system',
          content: [
            'You are the ZUVYR Code Studio editing engine.',
            'Return ONLY one JSON object with keys summary and files.',
            'files must be an array of objects with path, content and optional language.',
            'Edit only the exact target paths supplied by the user.',
            'Do not add, delete or rename files.',
            'Do not wrap the JSON in markdown.',
            'Preserve unrelated code and make the smallest correct changes.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction,
            project: {
              name: project.name,
              branch: project.currentBranch,
              revision: project.revision,
              entryFile: project.entryFile,
              manifest: project.files.map(file => ({
                path: file.path,
                language: file.language,
                sha256: file.sha256
              }))
            },
            targetPaths: targets,
            targetFiles: targets.map(path => ({
              path,
              language: byPath.get(path)?.language || null,
              content: byPath.get(path)?.content || ''
            }))
          })
        }
      ];

      let modelResult;
      try {
        modelResult = await routeRequestImpl('code', messages, {
          requestId,
          isPro: isPaidPlan(planId),
          loadLevel: 'normal'
        });
      } catch (cause) {
        const error = new Error('code_ai_edit_provider_failed');
        error.code = 'code_ai_edit_provider_failed';
        error.cause = cause;
        throw error;
      }

      const parsed = parseAiEditOutput(modelResult.text);
      const merged = mergeAiEdits(project, targets, parsed);
      const creditsCharged = finalCodeCredits(modelResult.cost_usd);

      const settlement = await usageBridge.settleUsage(
        requestId,
        creditsCharged
      );
      settlementDone = true;

      let savedProject = project;
      if (merged.changedPaths.length) {
        savedProject = await projects.save({
          ownerId: req.userId,
          projectId: project.id,
          project: merged.project,
          expectedRevision: project.revision,
          branchName: project.currentBranch,
          reason: 'ai_edit:' + requestId
        });
      }

      const receipt = await projects.completeAiEdit({
        ownerId: req.userId,
        requestId,
        model: modelResult.model,
        creditsCharged,
        result: {
          summary: parsed.summary,
          changedPaths: merged.changedPaths,
          versionId:
            savedProject.versions?.[0]?.id || null,
          revision: savedProject.revision,
          branch: savedProject.currentBranch,
          providerCostUsd: Number(modelResult.cost_usd || 0)
        }
      });

      if (typeof creditApi?.logCreditEvent === 'function') {
        await creditApi.logCreditEvent({
          userId: req.userId,
          feature: 'code',
          modelUsed: modelResult.model,
          fallbackTriggered: modelResult.fallback_triggered === true,
          status: 'success',
          requestId: requestId + ':detail',
          metadata: {
            project_id: project.id,
            task_id: requestId,
            step_id: 'ai-edit',
            usage_kind: 'ai_code_edit',
            usage: modelResult.usage,
            attempts: modelResult.attempts,
            billing_scope: modelResult.billing_scope,
            cost_usd: Number(modelResult.cost_usd || 0),
            changed_paths: merged.changedPaths
          }
        });
      }

      return res.json({
        status: 'success',
        replayed: false,
        project: savedProject,
        aiEdit: receipt,
        newBalance:
          settlement?.new_balance ??
          settlement?.newBalance ??
          null
      });
    } catch (error) {
      if (reservationStarted) {
        try {
          await usageBridge.refundUsage(requestId);
        } catch (refundError) {
          if (typeof creditApi?.reportRefundFailure === 'function') {
            await creditApi.reportRefundFailure({
              requestId,
              userId: req.userId,
              feature: 'code',
              error: refundError
            }).catch(() => null);
          }
        }
      }

      if (receiptStarted && requestId) {
        await projects.failAiEdit({
          ownerId: req.userId,
          requestId,
          errorCode: error.code || error.message,
          result: {
            reservationStarted,
            settlementDone
          }
        }).catch(() => null);
      }

      return errorResponse(res, error, 'code_ai_edit_failed');
    }
  });

  router.post('/runtime/request', (req, res) => {
    try {
      assertRuntimeRequestAllowed(req.body);
      const metering = usageBridge.status();
      if (!metering.reserve || !metering.settle || !metering.refund) {
        return res.status(503).json({
          status: 'error',
          code: 'code_usage_ledger_unavailable'
        });
      }
      return res.status(501).json({
        status: 'error',
        code: 'code_runtime_executor_unavailable'
      });
    } catch (error) {
      return res.status(failureStatus(error)).json({
        status: 'error',
        code: error.code || 'code_runtime_disabled',
        operation: error.operation,
        message: 'Code execution is not enabled.'
      });
    }
  });

  router.post('/deploy/request', (req, res) => {
    try {
      assertRuntimeRequestAllowed({
        ...req.body,
        operation: 'deploy'
      });
      return res.status(501).json({
        status: 'error',
        code: 'code_runtime_executor_unavailable'
      });
    } catch (error) {
      return res.status(failureStatus(error)).json({
        status: 'error',
        code: error.code || 'blocked_explicit_confirmation',
        operation: 'deploy',
        message: 'Deployment is not enabled.'
      });
    }
  });

  return router;
}

module.exports = {
  createCodeStudioRouter,
  parseAiEditOutput,
  normalizeAiTargets,
  mergeAiEdits,
  finalCodeCredits
};
