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
const {
  createCodeSandboxRepository
} = require('./codeSandboxRepository');
const {
  config: sandboxConfig,
  availability: sandboxAvailability,
  assertLiveAvailable: assertSandboxLiveAvailable,
  createPreviewCredential
} = require('./codeSandboxPolicy');
const {
  createVercelSandboxProvider
} = require('./codeVercelSandboxProvider');
const {
  createCodeRuntimeExecutor
} = require('./codeRuntimeExecutor');
const {
  createCodeRepairRepository
} = require('./codeRepairRepository');
const {
  assertRepairableJob,
  repairTargets,
  repairInstruction,
  retestOperation,
  repairStatusFromJob
} = require('./codeRepairPolicy');
const {
  runtimePricingStatus
} = require('./codeRuntimePricing');
const {
  createCodeReleaseRouter
} = require('./codeReleaseRoutes');
const {
  deploymentAvailability
} = require('./codeVercelDeploymentProvider');
const runtimeConfig = require('../config/code-runtime.v1.json');
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
  if (
    code === 'code_project_not_found' ||
    code === 'pack076_session_not_found' ||
    code === 'pack077_job_not_found' ||
    code === 'pack078_repair_run_not_found' ||
    code === 'pack078_repair_attempt_not_found' ||
    code === 'pack078_repair_source_job_not_found'
  ) return 404;
  if (
    code === 'pack075_revision_conflict' ||
    code === 'pack075_branch_exists' ||
    code === 'pack075_branch_not_active' ||
    code === 'code_ai_edit_in_progress' ||
    code === 'code_ai_edit_idempotency_scope_mismatch' ||
    code === 'code_ai_edit_previous_failed' ||
    code === 'pack076_active_session_exists' ||
    code === 'pack076_idempotency_scope_mismatch' ||
    code === 'code_sandbox_session_in_progress' ||
    code === 'code_sandbox_previous_terminal' ||
    code === 'pack077_active_job_exists' ||
    code === 'pack077_idempotency_scope_mismatch' ||
    code === 'pack077_job_not_claimable' ||
    code === 'pack077_terminal_job' ||
    code === 'pack078_revision_conflict' ||
    code === 'pack078_repair_active_conflict' ||
    code === 'pack078_repair_idempotency_scope_mismatch' ||
    code === 'pack078_repair_terminal' ||
    code === 'pack078_repair_exhausted' ||
    code === 'pack078_repair_repeated_failure'
  ) return 409;
  if (
    code === 'code_requires_plan' ||
    code === 'permission_required' ||
    code === 'permission_request_replayed' ||
    code === 'permission_request_scope_mismatch' ||
    code === 'pack077_dependency_registry_permission_required'
  ) return 403;
  if (code === 'insufficient_credits') return 402;
  if (
    code === 'code_ai_edit_provider_failed' ||
    code === 'code_ai_edit_output_invalid' ||
    (code.startsWith('code_sandbox_provider_') &&
      code !== 'code_sandbox_provider_credentials_unavailable')
  ) return 502;
  if (
    code === 'code_sandbox_live_gate_closed' ||
    code === 'code_sandbox_provider_credentials_unavailable' ||
    code === 'code_runtime_pricing_gate_closed' ||
    code === 'code_runtime_pricing_snapshot_changed' ||
    code === 'pack078_repair_runtime_unavailable'
  ) return 503;
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
  db = null,
  routeRequestImpl = null,
  sandboxProvider = null,
  sandboxEnv = process.env,
  deploymentProvider = null,
  permissionApi = null
} = {}) {
  const router = express.Router();
  const usageBridge = createCodeStudioUsageBridge(creditApi || {});
  const projects = db ? createCodeProjectRepository(db) : null;
  const sandboxes = db ? createCodeSandboxRepository(db) : null;
  const repairs = db ? createCodeRepairRepository(db) : null;
  const sandbox =
    sandboxProvider ||
    createVercelSandboxProvider({ env: sandboxEnv });
  const runtimeExecutor =
    db
      ? createCodeRuntimeExecutor({
          db,
          creditApi: creditApi || {},
          provider: sandbox,
          env: sandboxEnv
        })
      : null;
  const routeCodeRequest =
    typeof routeRequestImpl === 'function'
      ? routeRequestImpl
      : (...args) => require('../aiRouter').routeRequest(...args);

  const projectRepository = () => {
    if (!projects) {
      const error = new Error('code_project_repository_unavailable');
      error.code = 'code_project_repository_unavailable';
      throw error;
    }
    return projects;
  };

  const sandboxRepository = () => {
    if (!sandboxes) {
      const error = new Error('code_sandbox_repository_unavailable');
      error.code = 'code_sandbox_repository_unavailable';
      throw error;
    }
    return sandboxes;
  };

  const runtimeExecution = () => {
    if (!runtimeExecutor) {
      const error = new Error('code_runtime_executor_unavailable');
      error.code = 'code_runtime_executor_unavailable';
      throw error;
    }
    return runtimeExecutor;
  };

  const repairRepository = () => {
    if (!repairs) {
      const error = new Error('code_repair_repository_unavailable');
      error.code = 'code_repair_repository_unavailable';
      throw error;
    }
    return repairs;
  };

  async function executeAiEdit({
    ownerId,
    projectId,
    instruction: rawInstruction,
    targetPaths,
    expectedRevision,
    requestId: suppliedRequestId = null,
    reasonPrefix = 'ai_edit'
  } = {}) {
    let requestId = '';
    let receiptStarted = false;
    let receiptOwned = false;
    let reservationStarted = false;
    let settlementDone = false;

    try {
      if (!uuid(projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }

      const instruction = requiredInstruction(rawInstruction);
      const project = await projectRepository().get({ ownerId, projectId });

      const suppliedRevision = Number(expectedRevision);
      if (
        Number.isSafeInteger(suppliedRevision) &&
        suppliedRevision !== project.revision
      ) {
        const error = new Error('pack075_revision_conflict');
        error.code = 'pack075_revision_conflict';
        throw error;
      }

      const planId = await ownerPlan(db, ownerId);
      if (!planHasFeature(planId, 'code')) {
        const error = new Error('code_requires_plan');
        error.code = 'code_requires_plan';
        throw error;
      }

      const targets = normalizeAiTargets(project, targetPaths);
      const instructionSha256 = crypto
        .createHash('sha256')
        .update(instruction, 'utf8')
        .digest('hex');

      requestId =
        String(suppliedRequestId || '').trim() ||
        crypto.randomUUID();

      if (!requestId || requestId.length > 200) {
        const error = new Error('code_ai_edit_idempotency_key_invalid');
        error.code = 'code_ai_edit_idempotency_key_invalid';
        throw error;
      }

      const started = await projectRepository().beginAiEdit({
        ownerId,
        projectId: project.id,
        requestId,
        instructionSha256,
        targetPaths: targets
      });
      receiptStarted = true;
      receiptOwned = started.replayed !== true;

      if (started.replayed) {
        if (started.receipt.status === 'succeeded') {
          return Object.freeze({
            replayed: true,
            project: await projectRepository().get({
              ownerId,
              projectId: project.id
            }),
            aiEdit: started.receipt,
            newBalance: null
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
        userId: ownerId,
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
            targetFiles: targets.map(targetPath => ({
              path: targetPath,
              language: byPath.get(targetPath)?.language || null,
              content: byPath.get(targetPath)?.content || ''
            }))
          })
        }
      ];

      let modelResult;
      try {
        modelResult = await routeCodeRequest('code', messages, {
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
        savedProject = await projectRepository().save({
          ownerId,
          projectId: project.id,
          project: merged.project,
          expectedRevision: project.revision,
          branchName: project.currentBranch,
          reason: String(reasonPrefix || 'ai_edit').slice(0, 80) + ':' + requestId
        });
      }

      const receipt = await projectRepository().completeAiEdit({
        ownerId,
        requestId,
        model: modelResult.model,
        creditsCharged,
        result: {
          summary: parsed.summary,
          changedPaths: merged.changedPaths,
          versionId: savedProject.versions?.[0]?.id || null,
          revision: savedProject.revision,
          branch: savedProject.currentBranch,
          providerCostUsd: Number(modelResult.cost_usd || 0)
        }
      });

      if (typeof creditApi?.logCreditEvent === 'function') {
        await creditApi.logCreditEvent({
          userId: ownerId,
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

      return Object.freeze({
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
              userId: ownerId,
              feature: 'code',
              error: refundError
            }).catch(() => null);
          }
        }
      }

      if (receiptStarted && receiptOwned && requestId) {
        await projectRepository().failAiEdit({
          ownerId,
          requestId,
          errorCode: error.code || error.message,
          result: { reservationStarted, settlementDone }
        }).catch(() => null);
      }
      throw error;
    }
  }

  function assertRepairRuntimeAvailable() {
    const pricing = runtimePricingStatus({ env: sandboxEnv });
    const sandboxStatus = sandboxAvailability(sandboxEnv);
    if (!pricing.live || !sandboxStatus.live) {
      const error = new Error('pack078_repair_runtime_unavailable');
      error.code = 'pack078_repair_runtime_unavailable';
      error.blockers = [
        ...new Set([
          ...(pricing.blockers || []),
          ...(sandboxStatus.blockers || [])
        ])
      ];
      throw error;
    }
  }

  function repairPhaseRequestId(repairRunId, attemptNo, phase) {
    const normalizedPhase = String(phase || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
    if (!uuid(repairRunId) || !Number.isInteger(Number(attemptNo))) {
      const error = new Error('pack078_repair_request_id_invalid');
      error.code = 'pack078_repair_request_id_invalid';
      throw error;
    }
    return [
      'pack078',
      repairRunId,
      String(attemptNo),
      normalizedPhase || 'phase'
    ].join(':');
  }

  async function startRepairRetest({
    ownerId,
    run,
    attempt,
    project
  }) {
    const sourceJob = await runtimeExecution().refresh({
      ownerId,
      jobId: attempt.sourceJobId
    });
    const operation = retestOperation(project, sourceJob.operation);
    const requestId = repairPhaseRequestId(
      run.id,
      attempt.attemptNo,
      'retest'
    );

    const started = await runtimeExecution().start({
      ownerId,
      idempotencyKey: requestId,
      sourceJobId: attempt.sourceJobId,
      body: {
        operation,
        projectId: project.id,
        sandboxSessionId: run.sandboxSessionId
      }
    });

    await repairRepository().completeAttempt({
      ownerId,
      attemptId: attempt.id,
      status: 'retesting',
      aiEditRequestId: attempt.aiEditRequestId,
      repairedVersionId: attempt.repairedVersionId,
      retestJobId: started.job.id,
      result: {
        retestOperation: operation,
        retestRequestId: requestId
      }
    });

    return Object.freeze({
      job: started.job,
      replayed: started.replayed === true
    });
  }

  async function applyRepairAttempt({
    ownerId,
    run,
    attempt
  }) {
    const project = await projectRepository().get({
      ownerId,
      projectId: run.projectId
    });
    const targets = repairTargets(project, attempt.diagnosis);
    const aiRequestId = repairPhaseRequestId(
      run.id,
      attempt.attemptNo,
      'ai'
    );
    const ai = await executeAiEdit({
      ownerId,
      projectId: project.id,
      instruction: repairInstruction(
        attempt.diagnosis,
        attempt.attemptNo
      ),
      targetPaths: targets,
      expectedRevision: project.revision,
      requestId: aiRequestId,
      reasonPrefix: 'repair'
    });

    await repairRepository().completeAttempt({
      ownerId,
      attemptId: attempt.id,
      status: 'applied',
      aiEditRequestId: aiRequestId,
      repairedVersionId: ai.aiEdit?.result?.versionId || null,
      result: {
        changedPaths: ai.aiEdit?.result?.changedPaths || [],
        aiEditReceiptId: ai.aiEdit?.id || null
      }
    });

    const updatedAttempt = await repairRepository().getLatestAttempt({
      ownerId,
      repairRunId: run.id
    });
    const updatedProject = await projectRepository().get({
      ownerId,
      projectId: run.projectId
    });
    return startRepairRetest({
      ownerId,
      run,
      attempt: updatedAttempt,
      project: updatedProject
    });
  }

  async function claimRepairAttemptFromJob({
    ownerId,
    run,
    sourceJob
  }) {
    const diagnostic = assertRepairableJob(sourceJob);
    return repairRepository().claimAttempt({
      ownerId,
      repairRunId: run.id,
      failureFingerprint: diagnostic.fingerprint,
      diagnosis: {
        ...diagnostic,
        sourceOperation: sourceJob.operation
      },
      sourceJobId: sourceJob.id
    });
  }

  async function progressRepair({
    ownerId,
    repairRunId
  }) {
    assertRepairRuntimeAvailable();

    let bundle = await repairRepository().publicBundle({
      ownerId,
      repairRunId
    });
    let run = bundle.run;

    if (['succeeded','failed','exhausted','cancelled'].includes(run.status)) {
      return Object.freeze({ ...bundle, retestJob: null });
    }

    let attempt = bundle.attempts[bundle.attempts.length - 1] || null;

    if (!attempt) {
      const sourceJob = await runtimeExecution().refresh({
        ownerId,
        jobId: run.sourceJobId
      });
      attempt = await claimRepairAttemptFromJob({
        ownerId,
        run,
        sourceJob
      });
      await applyRepairAttempt({ ownerId, run, attempt });
      bundle = await repairRepository().publicBundle({
        ownerId,
        repairRunId
      });
      attempt = bundle.attempts[bundle.attempts.length - 1];
      const retestJob = attempt?.retestJobId
        ? await runtimeExecution().refresh({
            ownerId,
            jobId: attempt.retestJobId
          })
        : null;
      return Object.freeze({ ...bundle, retestJob });
    }

    if (attempt.status === 'claimed') {
      await applyRepairAttempt({ ownerId, run, attempt });
      bundle = await repairRepository().publicBundle({
        ownerId,
        repairRunId
      });
      attempt = bundle.attempts[bundle.attempts.length - 1];
      const retestJob = attempt?.retestJobId
        ? await runtimeExecution().refresh({
            ownerId,
            jobId: attempt.retestJobId
          })
        : null;
      return Object.freeze({ ...bundle, retestJob });
    }

    if (attempt.status === 'applied' && !attempt.retestJobId) {
      const project = await projectRepository().get({
        ownerId,
        projectId: run.projectId
      });
      await startRepairRetest({
        ownerId,
        run,
        attempt,
        project
      });
      bundle = await repairRepository().publicBundle({
        ownerId,
        repairRunId
      });
      attempt = bundle.attempts[bundle.attempts.length - 1];
    }

    if (attempt.status === 'retesting' && attempt.retestJobId) {
      const retestJob = await runtimeExecution().refresh({
        ownerId,
        jobId: attempt.retestJobId
      });
      const state = repairStatusFromJob(retestJob);

      if (state === 'retesting') {
        return Object.freeze({ ...bundle, retestJob });
      }

      if (state === 'succeeded') {
        const project = await projectRepository().get({
          ownerId,
          projectId: run.projectId
        });
        await repairRepository().completeAttempt({
          ownerId,
          attemptId: attempt.id,
          status: 'succeeded',
          aiEditRequestId: attempt.aiEditRequestId,
          repairedVersionId: attempt.repairedVersionId,
          retestJobId: attempt.retestJobId,
          finalRevision: project.revision,
          result: {
            retestStatus: 'succeeded',
            retestJobId: retestJob.id
          }
        });
        return Object.freeze({
          ...(await repairRepository().publicBundle({
            ownerId,
            repairRunId
          })),
          retestJob
        });
      }

      await repairRepository().completeAttempt({
        ownerId,
        attemptId: attempt.id,
        status: 'failed',
        aiEditRequestId: attempt.aiEditRequestId,
        repairedVersionId: attempt.repairedVersionId,
        retestJobId: attempt.retestJobId,
        result: {
          retestStatus: retestJob.status,
          diagnostic: retestJob.result?.diagnostic || null
        }
      });

      run = await repairRepository().get({ ownerId, repairRunId });
      if (run.status === 'exhausted') {
        return Object.freeze({
          ...(await repairRepository().publicBundle({
            ownerId,
            repairRunId
          })),
          retestJob
        });
      }

      try {
        const nextAttempt = await claimRepairAttemptFromJob({
          ownerId,
          run,
          sourceJob: retestJob
        });
        await applyRepairAttempt({
          ownerId,
          run,
          attempt: nextAttempt
        });
      } catch (error) {
        if (error?.code === 'pack078_repair_repeated_failure') {
          return Object.freeze({
            ...(await repairRepository().publicBundle({
              ownerId,
              repairRunId
            })),
            retestJob
          });
        }
        throw error;
      }

      bundle = await repairRepository().publicBundle({
        ownerId,
        repairRunId
      });
      attempt = bundle.attempts[bundle.attempts.length - 1];
      const nextRetest = attempt?.retestJobId
        ? await runtimeExecution().refresh({
            ownerId,
            jobId: attempt.retestJobId
          })
        : null;
      return Object.freeze({ ...bundle, retestJob: nextRetest });
    }

    return Object.freeze({ ...bundle, retestJob: null });
  }

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
        },
        pack076: {
          secureSandboxFoundation: true,
          liveProvisioning: sandboxAvailability(sandboxEnv).live,
          externalGate: sandboxConfig.provider.externalGate,
          pricingVerificationStatus: sandboxConfig.provider.pricingVerificationStatus,
          blockers: sandboxAvailability(sandboxEnv).blockers,
          networkDefault: sandboxConfig.network.defaultMode,
          rawPublicPorts: false,
          previewTransport: 'authenticated_time_bounded_proxy'
        },
        pack077: {
          terminalDependenciesRunFoundation: true,
          operations: runtimeConfig.operations,
          liveExecution:
            runtimePricingStatus({ env: sandboxEnv }).live &&
            sandboxAvailability(sandboxEnv).live,
          blockers: [
            ...new Set([
              ...runtimePricingStatus({ env: sandboxEnv }).blockers,
              ...sandboxAvailability(sandboxEnv).blockers,
              'pack077_raw_preview_port_protection_unverified'
            ])
          ],
          dependencyNetwork:
            runtimeConfig.dependencies.networkPolicy.allowedDomains,
          shellExecution: false,
          sudo: false,
          previewActivation: false,
          previewStatus:
            'deferred_until_private_or_provider-protected_port_route_is_verified'
        },
        pack078: {
          buildTestRepairFoundation: true,
          operations: ['build','test'],
          structuredDiagnostics: true,
          maxRepairAttempts: runtimeConfig.repair?.maxAttempts || 2,
          repairAutoApply: runtimeConfig.repair?.autoApply === true,
          previewStates: runtimeConfig.preview?.states || [],
          previewTransportVerified: false,
          livePreview: false,
          previewStatus:
            'deferred_raw_provider_port_protection_unverified',
          fakePreviewFallback: false
        },
        pack079: {
          realZip: true,
          exactSavedVersion: true,
          referencedAssetsIncluded: true,
          deterministicArchiveVerification: true,
          deploymentProvider: 'vercel',
          liveDeployment: deploymentAvailability(sandboxEnv).live,
          externalGate: deploymentAvailability(sandboxEnv).externalGate,
          blockers: deploymentAvailability(sandboxEnv).blockers,
          previewDistinctFromProduction: true,
          explicitDeployPermission: 'deploy.execute',
          explicitRollbackPermission: 'deploy.rollback',
          rollbackServerAuthoritative: true
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
            status: 'pack078_live_preview_deferred',
            message: 'Preview unavailable until the sandbox port route is verified private or provider-protected.'
          }
        : undefined;
      return res.json({ status: 'success', manifest, preview });
    } catch (error) {
      return errorResponse(res, error, 'invalid_code_project');
    }
  });

  router.get('/projects', async (req, res) => {
    try {
      const items = await projectRepository().list({
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
      const project = await projectRepository().create({
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
      const project = await projectRepository().get({
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
      const project = await projectRepository().save({
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
      const result = await projectRepository().archive({
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
      const project = await projectRepository().get({
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
      const project = await projectRepository().createBranch({
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
      const project = await projectRepository().switchBranch({
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
      const editorState = await projectRepository().saveEditorState({
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
    try {
      const result = await executeAiEdit({
        ownerId: req.userId,
        projectId: req.params.projectId,
        instruction: req.body?.instruction,
        targetPaths: req.body?.targetPaths,
        expectedRevision: req.body?.expectedRevision,
        requestId: req.headers['idempotency-key']
      });
      return res.json({ status: 'success', ...result });
    } catch (error) {
      return errorResponse(res, error, 'code_ai_edit_failed');
    }
  });

  router.get('/projects/:projectId/preview/state', async (req, res) => {
    try {
      if (!uuid(req.params.projectId) || !uuid(req.query?.sandboxSessionId)) {
        const error = new Error('pack078_preview_scope_invalid');
        error.code = 'pack078_preview_scope_invalid';
        throw error;
      }
      const project = await projectRepository().get({
        ownerId: req.userId,
        projectId: req.params.projectId
      });
      const state = await runtimeExecution().runtimeState({
        ownerId: req.userId,
        sandboxSessionId: req.query.sandboxSessionId
      });
      if (state && state.projectId !== project.id) {
        const error = new Error('pack078_preview_scope_invalid');
        error.code = 'pack078_preview_scope_invalid';
        throw error;
      }
      return res.json({
        status: 'success',
        preview: {
          state: state?.previewState || 'unavailable',
          candidatePort: state?.previewCandidatePort || null,
          transportStatus: state?.previewTransportStatus || 'blocked',
          diagnostic: state?.lastDiagnostic || {},
          lastBuildJobId: state?.lastBuildJobId || null,
          lastTestJobId: state?.lastTestJobId || null,
          updatedAt: state?.previewUpdatedAt || state?.updatedAt || null,
          ticketAvailable:
            state?.previewState === 'ready' &&
            state?.previewTransportStatus === 'verified'
        }
      });
    } catch (error) {
      return errorResponse(res, error, 'code_preview_state_failed');
    }
  });

  router.post('/projects/:projectId/repair', async (req, res) => {
    try {
      assertRepairRuntimeAvailable();
      if (
        !uuid(req.params.projectId) ||
        !uuid(req.body?.sandboxSessionId) ||
        !uuid(req.body?.sourceJobId)
      ) {
        const error = new Error('pack078_repair_scope_invalid');
        error.code = 'pack078_repair_scope_invalid';
        throw error;
      }

      const project = await projectRepository().get({
        ownerId: req.userId,
        projectId: req.params.projectId
      });
      const sourceJob = await runtimeExecution().refresh({
        ownerId: req.userId,
        jobId: req.body.sourceJobId
      });
      const diagnostic = assertRepairableJob(sourceJob);

      if (
        sourceJob.projectId !== project.id ||
        sourceJob.sandboxSessionId !== req.body.sandboxSessionId
      ) {
        const error = new Error('pack078_repair_scope_invalid');
        error.code = 'pack078_repair_scope_invalid';
        throw error;
      }

      const requestId =
        String(req.headers['idempotency-key'] || '').trim() ||
        crypto.randomUUID();
      if (!requestId || requestId.length > 200) {
        const error = new Error('pack078_repair_request_id_invalid');
        error.code = 'pack078_repair_request_id_invalid';
        throw error;
      }

      const run = await repairRepository().reserve({
        ownerId: req.userId,
        projectId: project.id,
        sandboxSessionId: req.body.sandboxSessionId,
        sourceJobId: sourceJob.id,
        requestId,
        baseRevision: project.revision,
        failureFingerprint: diagnostic.fingerprint
      });

      const progress = await progressRepair({
        ownerId: req.userId,
        repairRunId: run.id
      });
      return res.status(202).json({
        status: 'success',
        repair: progress
      });
    } catch (error) {
      return errorResponse(res, error, 'code_repair_start_failed');
    }
  });

  router.get('/repair/:repairRunId', async (req, res) => {
    try {
      if (!uuid(req.params.repairRunId)) {
        const error = new Error('pack078_repair_run_id_invalid');
        error.code = 'pack078_repair_run_id_invalid';
        throw error;
      }
      const repair = await repairRepository().publicBundle({
        ownerId: req.userId,
        repairRunId: req.params.repairRunId
      });
      return res.json({ status: 'success', repair });
    } catch (error) {
      return errorResponse(res, error, 'code_repair_lookup_failed');
    }
  });

  router.post('/repair/:repairRunId/continue', async (req, res) => {
    try {
      if (!uuid(req.params.repairRunId)) {
        const error = new Error('pack078_repair_run_id_invalid');
        error.code = 'pack078_repair_run_id_invalid';
        throw error;
      }
      const repair = await progressRepair({
        ownerId: req.userId,
        repairRunId: req.params.repairRunId
      });
      return res.json({ status: 'success', repair });
    } catch (error) {
      return errorResponse(res, error, 'code_repair_continue_failed');
    }
  });

  router.get('/sandbox/capabilities', (_req, res) => {
    const live = sandboxAvailability(sandboxEnv);
    return res.json({
      status: 'success',
      pack: 76,
      provider: live.provider,
      runtime: live.runtime,
      liveProvisioning: live.live,
      externalGate: live.externalGate,
      pricingVerificationStatus: live.pricingVerificationStatus,
      blockers: live.blockers,
      resources: {
        vcpus: sandboxConfig.runtime.vcpus,
        memoryMb: sandboxConfig.runtime.memoryMb,
        defaultTimeoutMs: sandboxConfig.runtime.defaultTimeoutMs,
        idleTimeoutMs: sandboxConfig.runtime.idleTimeoutMs
      },
      network: {
        defaultMode: sandboxConfig.network.defaultMode,
        allowAllForbidden: sandboxConfig.network.allowAllForbidden === true
      },
      preview: {
        rawProviderRoutesReturnedToClient: false,
        authenticatedTransportRequired: true,
        maxTokenTtlSeconds: sandboxConfig.preview.maxTokenTtlSeconds
      }
    });
  });

  router.get('/sandbox/sessions', async (req, res) => {
    try {
      const projectId = req.query?.projectId || null;
      if (projectId && !uuid(projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }
      const sessions = await sandboxRepository().list({
        ownerId: req.userId,
        projectId,
        limit: req.query?.limit
      });
      return res.json({ status: 'success', sessions });
    } catch (error) {
      return errorResponse(res, error, 'code_sandbox_list_failed');
    }
  });

  router.post('/sandbox/sessions', async (req, res) => {
    let localSession = null;
    let providerSession = null;
    try {
      // Pack076 source gate is deliberately closed until M15 + exact pricing.
      // This assertion happens before any DB mutation or provider call.
      assertSandboxLiveAvailable(sandboxEnv);

      const projectId = String(req.body?.projectId || '').trim();
      if (!uuid(projectId)) {
        const error = new Error('invalid_code_project_id');
        error.code = 'invalid_code_project_id';
        throw error;
      }

      const planId = await ownerPlan(db, req.userId);
      if (!planHasFeature(planId, 'code')) {
        const error = new Error('code_requires_plan');
        error.code = 'code_requires_plan';
        throw error;
      }

      const requestId =
        String(req.headers['idempotency-key'] || '').trim() ||
        crypto.randomUUID();
      if (!requestId || requestId.length > 200) {
        const error = new Error('pack076_request_id_invalid');
        error.code = 'pack076_request_id_invalid';
        throw error;
      }

      const existing = await sandboxRepository().getByRequest({
        ownerId: req.userId,
        requestId
      });
      if (existing) {
        if (existing.public.projectId !== projectId) {
          const error = new Error('pack076_idempotency_scope_mismatch');
          error.code = 'pack076_idempotency_scope_mismatch';
          throw error;
        }
        if (existing.public.status === 'running') {
          return res.json({
            status: 'success',
            replayed: true,
            session: existing.public
          });
        }
        const error = new Error(
          ['reserved','provisioning','stopping'].includes(existing.public.status)
            ? 'code_sandbox_session_in_progress'
            : 'code_sandbox_previous_terminal'
        );
        error.code = error.message;
        throw error;
      }

      const now = Date.now();
      const expiresAt = new Date(
        now + sandboxConfig.runtime.defaultTimeoutMs
      ).toISOString();
      const idleExpiresAt = new Date(
        Math.min(
          now + sandboxConfig.runtime.idleTimeoutMs,
          new Date(expiresAt).getTime()
        )
      ).toISOString();
      const bootstrapCredential = createPreviewCredential({ now });

      localSession = await sandboxRepository().reserve({
        ownerId: req.userId,
        projectId,
        requestId,
        previewTokenHash: bootstrapCredential.hash,
        expiresAt,
        idleExpiresAt
      });

      localSession = await sandboxRepository().transition({
        ownerId: req.userId,
        sessionId: localSession.id,
        status: 'provisioning'
      });

      providerSession = await sandbox.createSession({
        localSessionId: localSession.id
      });

      localSession = await sandboxRepository().transition({
        ownerId: req.userId,
        sessionId: localSession.id,
        status: 'running',
        providerSessionId: providerSession.providerSessionId,
        usageMetrics: providerSession.usage
      });

      return res.status(201).json({
        status: 'success',
        replayed: false,
        session: localSession
      });
    } catch (error) {
      if (providerSession?.providerSessionId) {
        await sandbox.stopSession(providerSession.providerSessionId).catch(() => null);
      }
      if (localSession?.id) {
        await sandboxRepository().transition({
          ownerId: req.userId,
          sessionId: localSession.id,
          status: 'failed',
          providerSessionId: providerSession?.providerSessionId || null,
          usageMetrics: providerSession?.usage || null,
          failureCode: error.code || error.message
        }).catch(() => null);
      }
      return errorResponse(res, error, 'code_sandbox_create_failed');
    }
  });

  router.get('/sandbox/sessions/:sessionId', async (req, res) => {
    try {
      if (!uuid(req.params.sessionId)) {
        const error = new Error('code_sandbox_session_id_invalid');
        error.code = 'code_sandbox_session_id_invalid';
        throw error;
      }
      const session = await sandboxRepository().get({
        ownerId: req.userId,
        sessionId: req.params.sessionId
      });
      return res.json({ status: 'success', session });
    } catch (error) {
      return errorResponse(res, error, 'code_sandbox_lookup_failed');
    }
  });

  router.post('/sandbox/sessions/:sessionId/stop', async (req, res) => {
    try {
      if (!uuid(req.params.sessionId)) {
        const error = new Error('code_sandbox_session_id_invalid');
        error.code = 'code_sandbox_session_id_invalid';
        throw error;
      }

      let internal = await sandboxRepository().getInternal({
        ownerId: req.userId,
        sessionId: req.params.sessionId
      });

      if (['stopped','failed','expired'].includes(internal.status)) {
        return res.json({
          status: 'success',
          replayed: true,
          session: await sandboxRepository().get({
            ownerId: req.userId,
            sessionId: internal.id
          })
        });
      }

      if (internal.status !== 'stopping') {
        await sandboxRepository().transition({
          ownerId: req.userId,
          sessionId: internal.id,
          status: 'stopping'
        });
        internal = await sandboxRepository().getInternal({
          ownerId: req.userId,
          sessionId: internal.id
        });
      }

      let usage = internal.usage_metrics || {};
      if (internal.provider_session_id) {
        try {
          const stopped = await sandbox.stopSession(internal.provider_session_id);
          usage = stopped.usage || usage;
        } catch (providerError) {
          if (![404,410].includes(Number(providerError?.providerStatus))) {
            const error = new Error('code_sandbox_stop_pending');
            error.code = 'code_sandbox_stop_pending';
            error.cause = providerError;
            throw error;
          }
        }
      }

      const session = await sandboxRepository().transition({
        ownerId: req.userId,
        sessionId: internal.id,
        status: 'stopped',
        providerSessionId: internal.provider_session_id,
        usageMetrics: usage
      });

      return res.json({ status: 'success', replayed: false, session });
    } catch (error) {
      return errorResponse(res, error, 'code_sandbox_stop_failed');
    }
  });

  router.post('/sandbox/sessions/:sessionId/preview-ticket', async (req, res) => {
    try {
      if (!uuid(req.params.sessionId)) {
        const error = new Error('code_sandbox_session_id_invalid');
        error.code = 'code_sandbox_session_id_invalid';
        throw error;
      }

      const internal = await sandboxRepository().getInternal({
        ownerId: req.userId,
        sessionId: req.params.sessionId
      });
      if (internal.status !== 'running') {
        const error = new Error('code_preview_transport_unavailable');
        error.code = 'code_preview_transport_unavailable';
        throw error;
      }
      if (!Number.isInteger(internal.preview_port) || internal.preview_port < 1) {
        const error = new Error('code_preview_transport_unavailable');
        error.code = 'code_preview_transport_unavailable';
        throw error;
      }

      const credential = createPreviewCredential({
        ttlSeconds: req.body?.ttlSeconds
      });
      const session = await sandboxRepository().rotatePreviewToken({
        ownerId: req.userId,
        sessionId: internal.id,
        previewTokenHash: credential.hash,
        previewExpiresAt: credential.expiresAt
      });

      return res.json({
        status: 'success',
        session,
        preview: {
          expiresAt: credential.expiresAt,
          transportPath:
            '/api/code-preview/' + encodeURIComponent(internal.id) +
            '/?t=' + encodeURIComponent(credential.token)
        }
      });
    } catch (error) {
      return errorResponse(res, error, 'code_preview_ticket_failed');
    }
  });

  router.get('/runtime/jobs', async (req, res) => {
    try {
      const projectId = req.query?.projectId || null;
      if (projectId && !uuid(projectId)) {
        const error = new Error('pack077_project_id_invalid');
        error.code = 'pack077_project_id_invalid';
        throw error;
      }
      const jobs = await runtimeExecution().listJobs({
        ownerId: req.userId,
        projectId,
        limit: req.query?.limit
      });
      return res.json({ status: 'success', jobs });
    } catch (error) {
      return errorResponse(res, error, 'code_runtime_jobs_read_failed');
    }
  });

  router.post('/runtime/request', async (req, res) => {
    try {
      const planId = await ownerPlan(db, req.userId);
      if (!planHasFeature(planId, 'code')) {
        const error = new Error('code_requires_plan');
        error.code = 'code_requires_plan';
        throw error;
      }

      const metering = usageBridge.status();
      if (!metering.reserve || !metering.settle || !metering.refund) {
        const error = new Error('code_usage_ledger_unavailable');
        error.code = 'code_usage_ledger_unavailable';
        throw error;
      }

      const result = await runtimeExecution().start({
        ownerId: req.userId,
        body: req.body,
        idempotencyKey: req.headers['idempotency-key'] || null
      });

      return res.status(result.replayed ? 200 : 202).json({
        status: 'success',
        ...result
      });
    } catch (error) {
      return errorResponse(res, error, 'code_runtime_request_failed');
    }
  });

  router.get('/runtime/jobs/:jobId', async (req, res) => {
    try {
      if (!uuid(req.params.jobId)) {
        const error = new Error('pack077_job_id_invalid');
        error.code = 'pack077_job_id_invalid';
        throw error;
      }
      const job = await runtimeExecution().refresh({
        ownerId: req.userId,
        jobId: req.params.jobId
      });
      return res.json({ status: 'success', job });
    } catch (error) {
      return errorResponse(res, error, 'code_runtime_job_read_failed');
    }
  });

  router.get('/runtime/jobs/:jobId/logs', async (req, res) => {
    try {
      if (!uuid(req.params.jobId)) {
        const error = new Error('pack077_job_id_invalid');
        error.code = 'pack077_job_id_invalid';
        throw error;
      }
      const logs = await runtimeExecution().logs({
        ownerId: req.userId,
        jobId: req.params.jobId,
        after: req.query?.after,
        limit: req.query?.limit
      });
      return res.json({ status: 'success', logs });
    } catch (error) {
      return errorResponse(res, error, 'code_runtime_logs_read_failed');
    }
  });

  router.post('/runtime/jobs/:jobId/cancel', async (req, res) => {
    try {
      if (!uuid(req.params.jobId)) {
        const error = new Error('pack077_job_id_invalid');
        error.code = 'pack077_job_id_invalid';
        throw error;
      }
      const job = await runtimeExecution().cancel({
        ownerId: req.userId,
        jobId: req.params.jobId
      });
      return res.json({ status: 'success', job });
    } catch (error) {
      return errorResponse(res, error, 'code_runtime_cancel_failed');
    }
  });

  if (db) {
    router.use(
      createCodeReleaseRouter({
        db,
        deploymentProvider,
        permissionApi,
        env: sandboxEnv
      })
    );
  }

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
