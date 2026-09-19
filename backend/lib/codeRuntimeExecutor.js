'use strict';

const runtimeConfig = require('../config/code-runtime.v1.json');
const { createCodeProjectRepository } = require('./codeProjectRepository');
const { createCodeSandboxRepository } = require('./codeSandboxRepository');
const { createCodeRuntimeRepository } = require('./codeRuntimeRepository');
const { createPermissionCenterStore } = require('./permissionCenterRepository');
const { createCodeStudioUsageBridge } = require('./codeStudioUsageBridge');
const pricingDefault = require('./codeRuntimePricing');
const {
  normalizeRuntimeRequest,
  commandSpecForOperation,
  detectPreviewPort
} = require('./codeRuntimeRequestContract');
const {
  structuredDiagnostic
} = require('./codeRuntimeDiagnostics');
const { buildProjectTarball } = require('./codeProjectSandboxArchive');
const { createVercelSandboxProvider } = require('./codeVercelSandboxProvider');

function executorError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function deterministicCommandId(jobId) {
  const compact = String(jobId || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  if (compact.length !== 32) {
    throw executorError('pack077_job_id_invalid');
  }
  return 'cmd_zuvyr_' + compact;
}

function permissionReplayAccepted(value) {
  return !!(
    value &&
    value.success === true &&
    (
      value.allowed === true ||
      (
        value.replayed === true &&
        value.error === 'permission_request_replayed' &&
        value.grant_id
      )
    )
  );
}

function permissionCode(value) {
  return String(value?.error || 'permission_required');
}

function providerTimestamp(value, fallbackMs = Date.now()) {
  if (value === null || value === undefined || value === '') {
    return new Date(fallbackMs).toISOString();
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString();
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date(fallbackMs).toISOString();
}

function commandLogChunks(text) {
  const source = String(text || '');
  if (!source) return Object.freeze([]);

  const rows = source.split(/\r?\n/).filter(Boolean);
  const chunks = [];
  for (const row of rows) {
    if (chunks.length >= runtimeConfig.logs.maxPersistedChunksPerJob) break;

    let stream = 'stdout';
    let message = row;
    try {
      const parsed = JSON.parse(row);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const candidateStream = String(
          parsed.stream || parsed.type || parsed.channel || ''
        ).toLowerCase();
        if (candidateStream.includes('stderr') || candidateStream === 'error') {
          stream = candidateStream === 'error' ? 'error' : 'stderr';
        }
        const candidate =
          parsed.message ??
          parsed.text ??
          parsed.data ??
          parsed.log ??
          parsed.output;
        if (candidate !== undefined && candidate !== null) {
          message =
            typeof candidate === 'string'
              ? candidate
              : JSON.stringify(candidate);
        }
      }
    } catch (_) {}

    let bytes = Buffer.from(String(message), 'utf8');
    while (bytes.length > 0 && chunks.length < runtimeConfig.logs.maxPersistedChunksPerJob) {
      let end = Math.min(runtimeConfig.logs.maxChunkBytes, bytes.length);
      while (end > 0 && (bytes[end] & 0xc0) === 0x80) end -= 1;
      if (end <= 0) end = Math.min(runtimeConfig.logs.maxChunkBytes, bytes.length);
      const part = bytes.subarray(0, end).toString('utf8');
      if (part) chunks.push(Object.freeze({ stream, message: part }));
      bytes = bytes.subarray(end);
    }
  }
  return Object.freeze(chunks);
}

function createCodeRuntimeExecutor({
  db,
  creditApi = {},
  provider = null,
  env = process.env,
  pricing = pricingDefault,
  now = () => Date.now()
} = {}) {
  if (!db) throw executorError('code_runtime_executor_db_unavailable');

  const projects = createCodeProjectRepository(db);
  const sandboxes = createCodeSandboxRepository(db);
  const runtime = createCodeRuntimeRepository(db);
  const permissions = createPermissionCenterStore(db);
  const usage = createCodeStudioUsageBridge(creditApi);
  const sandbox =
    provider ||
    createVercelSandboxProvider({ env });

  async function consumePermission({
    ownerId,
    action,
    projectId,
    sandboxSessionId,
    requestId
  }) {
    const result = await permissions.consume({
      ownerId,
      action,
      resourceNamespace: 'code_project',
      resourceId: projectId,
      sessionId: sandboxSessionId,
      requestId
    });

    if (!permissionReplayAccepted(result)) {
      throw executorError(permissionCode(result));
    }

    let constraints =
      result.constraints &&
      typeof result.constraints === 'object' &&
      !Array.isArray(result.constraints)
        ? result.constraints
        : null;

    if (!constraints && result.grant_id) {
      const grants = await permissions.listGrants(ownerId, {
        limit: 200,
        activeOnly: false
      });
      const grant = grants.find(item => item.id === result.grant_id);
      constraints =
        grant?.constraints &&
        typeof grant.constraints === 'object' &&
        !Array.isArray(grant.constraints)
          ? grant.constraints
          : {};
    }

    return Object.freeze({
      grantId: result.grant_id || null,
      constraints: Object.freeze({ ...(constraints || {}) }),
      replayed: result.replayed === true
    });
  }

  async function authorize(request) {
    const action =
      request.operation === 'dependencies'
        ? 'dependency.install'
        : 'runtime.execute';

    const execution = await consumePermission({
      ownerId: request.ownerId,
      action,
      projectId: request.projectId,
      sandboxSessionId: request.sandboxSessionId,
      requestId: request.requestId
    });

    let network = null;
    if (request.operation === 'dependencies') {
      network = await consumePermission({
        ownerId: request.ownerId,
        action: 'network.egress',
        projectId: request.projectId,
        sandboxSessionId: request.sandboxSessionId,
        requestId: request.requestId
      });

      const hosts = Array.isArray(network.constraints.allowedHosts)
        ? network.constraints.allowedHosts.map(value =>
            String(value).trim().toLowerCase()
          )
        : [];
      if (!hosts.includes('registry.npmjs.org')) {
        throw executorError('pack077_dependency_registry_permission_required');
      }
    }

    return Object.freeze({ execution, network });
  }

  async function reserveCreditsForJob(request, quote, jobId) {
    return usage.reserveUsage({
      userId: request.ownerId,
      requestId: request.requestId,
      projectId: request.projectId,
      taskId: jobId,
      stepId: request.operation,
      usageKind: 'sandbox_runtime',
      creditsConsumed: quote.credits,
      modelUsed: 'vercel-sandbox',
      pricingVersion: quote.pricingVersion
    });
  }

  async function refundIfReserved(requestId, ownerId) {
    try {
      const result = await usage.refundUsage(requestId);
      return Object.freeze({ refunded: true, result });
    } catch (error) {
      if (error?.code === 'original_charge_not_found') {
        return Object.freeze({ refunded: false, noCharge: true });
      }
      if (typeof creditApi.reportRefundFailure === 'function') {
        await creditApi.reportRefundFailure({
          requestId,
          userId: ownerId,
          feature: 'code',
          error
        }).catch(() => null);
      }
      throw error;
    }
  }

  async function syncProject({
    request,
    project,
    providerSessionId
  }) {
    const bundle = buildProjectTarball(project);
    const state = await runtime.getRuntimeState({
      ownerId: request.ownerId,
      sandboxSessionId: request.sandboxSessionId
    });

    if (
      state &&
      state.syncedRevision === project.revision &&
      state.filesDigest === bundle.digest
    ) {
      return Object.freeze({
        ...bundle,
        synced: false,
        cacheHit: true,
        state
      });
    }

    await sandbox.writeArchive(
      providerSessionId,
      bundle.archive,
      {
        cwd: runtimeConfig.workspace.cwd,
        timeoutMs: 30000
      }
    );

    const nextState = await runtime.upsertRuntimeState({
      ownerId: request.ownerId,
      projectId: request.projectId,
      sandboxSessionId: request.sandboxSessionId,
      syncedRevision: project.revision,
      filesDigest: bundle.digest,
      dependencyDigest: state?.dependencyDigest || null,
      packageManager: state?.packageManager || null,
      runtimeScript: state?.runtimeScript || null,
      providerCommandId: state?.providerCommandId || null,
      processStatus: state?.processStatus || 'idle',
      previewPort: state?.previewPort || null,
      startedAt: state?.startedAt || null
    });

    return Object.freeze({
      ...bundle,
      synced: true,
      cacheHit: false,
      state: nextState
    });
  }

  async function persistProviderLogs({
    ownerId,
    jobId,
    providerSessionId,
    providerCommandId
  }) {
    let raw;
    try {
      raw = await sandbox.getCommandLogs(
        providerSessionId,
        providerCommandId
      );
    } catch (error) {
      if ([404, 410].includes(Number(error?.providerStatus))) {
        return Object.freeze([]);
      }
      throw error;
    }

    const chunks = commandLogChunks(raw?.text || '');
    for (let index = 0; index < chunks.length; index += 1) {
      await runtime.appendLog({
        ownerId,
        jobId,
        sequenceNo: index,
        stream: chunks[index].stream,
        message: chunks[index].message
      });
    }
    return chunks;
  }

  async function touchSandbox(ownerId, session) {
    const current = Number(now());
    const hardExpiry = new Date(session.expires_at).getTime();
    if (!Number.isFinite(hardExpiry) || hardExpiry <= current) return;
    const next = Math.min(
      hardExpiry,
      current + 300000
    );
    if (next <= current) return;
    await sandboxes.touch({
      ownerId,
      sessionId: session.id,
      idleExpiresAt: new Date(next).toISOString()
    }).catch(() => null);
  }

  async function finalQuote(job, runtimeMs) {
    return pricing.quoteRuntimeFinalAgainstReservation(
      runtimeMs,
      {
        costEntryId: job.cost_entry_id,
        pricingVersion: job.pricing_version
      },
      { env }
    );
  }

  async function settleAndFinalize({
    ownerId,
    job,
    command,
    finalStatus,
    result = {}
  }) {
    const runtimeMs = Math.max(0, Number(command?.durationMs || 0));
    const quote = await finalQuote(job, runtimeMs);
    await usage.settleUsage(job.request_id, quote.credits);

    const finalized = await runtime.finalize({
      ownerId,
      jobId: job.id,
      status: finalStatus,
      exitCode:
        Number.isInteger(command?.exitCode)
          ? command.exitCode
          : null,
      runtimeMs,
      finalCredits: quote.credits,
      result: {
        ...result,
        providerCommandId: job.provider_command_id,
        pricingVersion: quote.pricingVersion,
        costEntryId: quote.costEntryId,
        runtimeSeconds: quote.seconds,
        previewDeferred:
          job.operation === 'run'
            ? 'raw_provider_port_protection_unverified'
            : undefined
      }
    });

    if (job.operation === 'dependencies') {
      await sandbox.updateNetworkPolicy(
        (await sandboxes.getInternal({
          ownerId,
          sessionId: job.sandbox_session_id
        })).provider_session_id,
        { mode: 'deny-all', allowedDomains: [] }
      ).catch(() => null);
    }

    return finalized;
  }

  async function failBeforeProvider({
    ownerId,
    job,
    error
  }) {
    await refundIfReserved(job.request_id, ownerId).catch(() => null);
    return runtime.finalize({
      ownerId,
      jobId: job.id,
      status: 'failed',
      exitCode: null,
      runtimeMs: 0,
      finalCredits: 0,
      result: {
        error: String(error?.code || error?.message || 'code_runtime_failed'),
        providerStarted: false
      }
    }).catch(() => null);
  }

  async function start({
    ownerId,
    body,
    idempotencyKey = null
  } = {}) {
    const normalized = normalizeRuntimeRequest(body, { idempotencyKey });
    const request = Object.freeze({
      ...normalized,
      ownerId
    });

    // Pure financial gate first: while runtime pricing/M15 is not verified,
    // this throws before DB, permission, credit or provider mutation.
    const quote = pricing.quoteRuntimeReservation(
      request.operation,
      { env }
    );

    const project = await projects.get({
      ownerId,
      projectId: request.projectId
    });
    const session = await sandboxes.getInternal({
      ownerId,
      sessionId: request.sandboxSessionId
    });

    if (
      session.project_id !== request.projectId ||
      session.status !== 'running' ||
      !session.provider_session_id ||
      new Date(session.expires_at).getTime() <= now() ||
      new Date(session.idle_expires_at).getTime() <= now()
    ) {
      throw executorError('pack077_sandbox_not_runnable');
    }

    const commandSpec = commandSpecForOperation(request, project);
    let job = await runtime.reserve({
      ownerId,
      projectId: request.projectId,
      sandboxSessionId: request.sandboxSessionId,
      requestId: request.requestId,
      operation: request.operation,
      commandSpec,
      quote
    });

    if (['succeeded','failed','cancelled'].includes(job.status)) {
      return Object.freeze({ replayed: true, job });
    }
    if (job.status === 'running') {
      return Object.freeze({ replayed: true, job });
    }

    let creditsReserved = false;
    let networkOpened = false;
    let providerStarted = false;

    try {
      await authorize(request);

      await reserveCreditsForJob(request, quote, job.id);
      creditsReserved = true;

      const sync = await syncProject({
        request,
        project,
        providerSessionId: session.provider_session_id
      });

      if (request.operation === 'dependencies') {
        const prior = await runtime.getRuntimeState({
          ownerId,
          sandboxSessionId: request.sandboxSessionId
        });
        if (
          prior?.dependencyDigest &&
          prior.dependencyDigest === commandSpec.dependencyDigest
        ) {
          await usage.refundUsage(request.requestId);
          const finalized = await runtime.finalize({
            ownerId,
            jobId: job.id,
            status: 'succeeded',
            exitCode: 0,
            runtimeMs: 0,
            finalCredits: 0,
            result: {
              dependencyCacheHit: true,
              filesDigest: sync.digest
            }
          });
          return Object.freeze({ replayed: false, job: finalized });
        }

        await sandbox.updateNetworkPolicy(
          session.provider_session_id,
          runtimeConfig.dependencies.networkPolicy
        );
        networkOpened = true;
      }

      const commandId = deterministicCommandId(job.id);

      // Claim the deterministic provider command ID before provider start.
      // A crash after this point can safely replay the same cmdId.
      job = await runtime.claim({
        ownerId,
        jobId: job.id,
        providerCommandId: commandId,
        stage:
          request.operation === 'dependencies'
            ? 'network'
            : 'executing'
      });

      const started = await sandbox.startCommand(
        session.provider_session_id,
        commandSpec,
        commandId
      );
      providerStarted = true;

      const priorState = await runtime.getRuntimeState({
        ownerId,
        sandboxSessionId: request.sandboxSessionId
      });
      await runtime.upsertRuntimeState({
        ownerId,
        projectId: request.projectId,
        sandboxSessionId: request.sandboxSessionId,
        syncedRevision: project.revision,
        filesDigest: sync.digest,
        // Dependency cache becomes authoritative only after npm exits 0.
        dependencyDigest: priorState?.dependencyDigest || null,
        packageManager:
          request.operation === 'dependencies'
            ? 'npm'
            : priorState?.packageManager || null,
        runtimeScript:
          request.operation === 'run'
            ? commandSpec.script
            : priorState?.runtimeScript || null,
        providerCommandId: commandId,
        processStatus: 'running',
        previewPort: priorState?.previewPort || null,
        previewState:
          request.operation === 'build'
            ? 'building'
            : request.operation === 'run'
              ? 'starting'
              : priorState?.previewState,
        previewCandidatePort:
          request.operation === 'run'
            ? null
            : priorState?.previewCandidatePort,
        previewTransportStatus:
          request.operation === 'run'
            ? 'blocked'
            : priorState?.previewTransportStatus,
        lastDiagnostic:
          ['build','test','run'].includes(request.operation)
            ? {}
            : priorState?.lastDiagnostic,
        lastBuildJobId:
          request.operation === 'build'
            ? job.id
            : priorState?.lastBuildJobId,
        lastTestJobId:
          request.operation === 'test'
            ? job.id
            : priorState?.lastTestJobId,
        previewUpdatedAt:
          ['build','run'].includes(request.operation)
            ? new Date(now()).toISOString()
            : priorState?.previewUpdatedAt,
        startedAt: providerTimestamp(started.startedAt, now())
      });

      await touchSandbox(ownerId, session);

      return Object.freeze({
        replayed: started.replayed === true,
        job: await runtime.get({ ownerId, jobId: job.id }),
        runtime: {
          projectSynced: sync.synced,
          dependencyNetworkTemporary: networkOpened,
          previewDeferred:
            request.operation === 'run'
              ? 'raw_provider_port_protection_unverified'
              : null
        }
      });
    } catch (error) {
      if (networkOpened && !providerStarted) {
        await sandbox.updateNetworkPolicy(
          session.provider_session_id,
          { mode: 'deny-all', allowedDomains: [] }
        ).catch(() => null);
      }

      if (!providerStarted) {
        if (creditsReserved) {
          await refundIfReserved(request.requestId, ownerId).catch(() => null);
        }
        await failBeforeProvider({
          ownerId,
          job: await runtime.getInternal({ ownerId, jobId: job.id }),
          error
        });
      }

      throw error;
    }
  }

  async function refresh({
    ownerId,
    jobId
  } = {}) {
    let job = await runtime.getInternal({ ownerId, jobId });
    if (['succeeded','failed','cancelled'].includes(job.status)) {
      return runtime.get({ ownerId, jobId });
    }
    if (!job.provider_command_id) {
      return runtime.get({ ownerId, jobId });
    }

    const session = await sandboxes.getInternal({
      ownerId,
      sessionId: job.sandbox_session_id
    });

    const persistedChunks = await persistProviderLogs({
      ownerId,
      jobId: job.id,
      providerSessionId: session.provider_session_id,
      providerCommandId: job.provider_command_id
    }).catch(() => []);

    let command;
    try {
      command = await sandbox.getCommand(
        session.provider_session_id,
        job.provider_command_id
      );
    } catch (error) {
      if ([404,410].includes(Number(error?.providerStatus))) {
        throw executorError('code_runtime_provider_command_missing', error);
      }
      throw error;
    }

    if (!command.finished) {
      if (job.operation === 'run') {
        const priorState = await runtime.getRuntimeState({
          ownerId,
          sandboxSessionId: job.sandbox_session_id
        });
        const logText = persistedChunks
          .map(chunk => String(chunk?.message || ''))
          .join('\n');
        const candidatePort = detectPreviewPort(
          logText,
          job.command_spec?.previewPort
        );
        await runtime.upsertRuntimeState({
          ownerId,
          projectId: job.project_id,
          sandboxSessionId: job.sandbox_session_id,
          syncedRevision: priorState?.syncedRevision || null,
          filesDigest: priorState?.filesDigest || null,
          dependencyDigest: priorState?.dependencyDigest || null,
          packageManager: priorState?.packageManager || null,
          runtimeScript: priorState?.runtimeScript || job.command_spec?.script || null,
          providerCommandId: job.provider_command_id,
          processStatus: 'running',
          previewPort: priorState?.previewPort || null,
          previewState: 'unavailable',
          previewCandidatePort: candidatePort,
          previewTransportStatus: 'blocked',
          lastDiagnostic: priorState?.lastDiagnostic || {},
          lastBuildJobId: priorState?.lastBuildJobId,
          lastTestJobId: priorState?.lastTestJobId,
          previewUpdatedAt: new Date(now()).toISOString(),
          startedAt: priorState?.startedAt || job.started_at || null
        });
      }
      await touchSandbox(ownerId, session);
      return runtime.get({ ownerId, jobId });
    }

    if (job.operation === 'dependencies') {
      await sandbox.updateNetworkPolicy(
        session.provider_session_id,
        { mode: 'deny-all', allowedDomains: [] }
      );
    }

    const diagnostic =
      command.exitCode === 0
        ? null
        : structuredDiagnostic({
            operation: job.operation,
            exitCode: command.exitCode,
            chunks: persistedChunks,
            fallbackCode:
              job.operation === 'build'
                ? 'pack078_build_failed'
                : job.operation === 'test'
                  ? 'pack078_test_failed'
                  : 'pack078_runtime_failed'
          });

    const finalized = await settleAndFinalize({
      ownerId,
      job,
      command,
      finalStatus: command.exitCode === 0 ? 'succeeded' : 'failed',
      result: {
        providerFinished: true,
        diagnostic
      }
    });

    const priorState = await runtime.getRuntimeState({
      ownerId,
      sandboxSessionId: job.sandbox_session_id
    });
    const nextPreviewState =
      job.operation === 'build' && command.exitCode !== 0
        ? 'build_failed'
        : job.operation === 'run' && command.exitCode !== 0
          ? 'runtime_error'
          : priorState?.previewState || 'unavailable';

    await runtime.upsertRuntimeState({
      ownerId,
      projectId: job.project_id,
      sandboxSessionId: job.sandbox_session_id,
      syncedRevision: priorState?.syncedRevision || null,
      filesDigest: priorState?.filesDigest || null,
      dependencyDigest:
        job.operation === 'dependencies' && command.exitCode === 0
          ? job.command_spec?.dependencyDigest || priorState?.dependencyDigest || null
          : priorState?.dependencyDigest || null,
      packageManager:
        job.operation === 'dependencies' ? 'npm' : priorState?.packageManager || null,
      runtimeScript: priorState?.runtimeScript || null,
      providerCommandId:
        job.operation === 'run' ? job.provider_command_id : null,
      processStatus: command.exitCode === 0 ? 'stopped' : 'failed',
      previewPort: priorState?.previewPort || null,
      previewState: nextPreviewState,
      previewCandidatePort: priorState?.previewCandidatePort,
      previewTransportStatus: priorState?.previewTransportStatus || 'blocked',
      lastDiagnostic: diagnostic || {},
      lastBuildJobId:
        job.operation === 'build'
          ? job.id
          : priorState?.lastBuildJobId,
      lastTestJobId:
        job.operation === 'test'
          ? job.id
          : priorState?.lastTestJobId,
      previewUpdatedAt:
        ['build','run'].includes(job.operation)
          ? new Date(now()).toISOString()
          : priorState?.previewUpdatedAt,
      startedAt: priorState?.startedAt || null
    });

    return finalized;
  }

  async function cancel({
    ownerId,
    jobId
  } = {}) {
    let job = await runtime.getInternal({ ownerId, jobId });
    if (['succeeded','failed','cancelled'].includes(job.status)) {
      return runtime.get({ ownerId, jobId });
    }

    await runtime.requestCancel({ ownerId, jobId });
    job = await runtime.getInternal({ ownerId, jobId });

    if (!job.provider_command_id) {
      await refundIfReserved(job.request_id, ownerId);
      return runtime.finalize({
        ownerId,
        jobId: job.id,
        status: 'cancelled',
        exitCode: null,
        runtimeMs: 0,
        finalCredits: 0,
        result: { providerStarted: false }
      });
    }

    const session = await sandboxes.getInternal({
      ownerId,
      sessionId: job.sandbox_session_id
    });

    let command;
    try {
      command = await sandbox.killCommand(
        session.provider_session_id,
        job.provider_command_id,
        15
      );
    } catch (error) {
      if (![404,410].includes(Number(error?.providerStatus))) throw error;
      command = await sandbox.getCommand(
        session.provider_session_id,
        job.provider_command_id
      ).catch(() => ({
        providerCommandId: job.provider_command_id,
        finished: true,
        exitCode: null,
        durationMs: 0
      }));
    }

    await persistProviderLogs({
      ownerId,
      jobId: job.id,
      providerSessionId: session.provider_session_id,
      providerCommandId: job.provider_command_id
    }).catch(() => null);

    if (job.operation === 'dependencies') {
      await sandbox.updateNetworkPolicy(
        session.provider_session_id,
        { mode: 'deny-all', allowedDomains: [] }
      );
    }

    const finalized = await settleAndFinalize({
      ownerId,
      job,
      command,
      finalStatus: 'cancelled',
      result: { cancelledByUser: true }
    });

    const priorState = await runtime.getRuntimeState({
      ownerId,
      sandboxSessionId: job.sandbox_session_id
    });
    if (priorState) {
      await runtime.upsertRuntimeState({
        ownerId,
        projectId: job.project_id,
        sandboxSessionId: job.sandbox_session_id,
        syncedRevision: priorState.syncedRevision,
        filesDigest: priorState.filesDigest,
        dependencyDigest: priorState.dependencyDigest,
        packageManager: priorState.packageManager,
        runtimeScript: priorState.runtimeScript,
        providerCommandId: null,
        processStatus: 'stopped',
        previewPort: null,
        startedAt: priorState.startedAt
      });
    }

    return finalized;
  }

  async function listJobs({
    ownerId,
    projectId = null,
    limit = 30
  } = {}) {
    return runtime.list({ ownerId, projectId, limit });
  }

  async function reconcileActive({ limit = 50, logger = console } = {}) {
    const items = await runtime.activeJobs({ limit });
    const receipt = {
      scanned: items.length,
      refreshed: 0,
      terminal: 0,
      deferred: 0,
      failures: []
    };

    for (const item of items) {
      try {
        if (item.status === 'queued') {
          // Queued means provider execution never became authoritative.
          // Leave it for an idempotent POST replay or explicit cancel rather
          // than starting user code from maintenance.
          receipt.deferred += 1;
          continue;
        }

        const job = await refresh({
          ownerId: item.ownerId,
          jobId: item.id
        });
        receipt.refreshed += 1;
        if (['succeeded','failed','cancelled'].includes(job.status)) {
          receipt.terminal += 1;
        }
      } catch (error) {
        receipt.failures.push({
          jobId: item.id,
          code: String(error?.code || 'code_runtime_reconcile_failed')
        });
        logger.error(
          '[code-runtime-reconcile] job failed:',
          item.id,
          String(error?.code || error?.message || error)
        );
      }
    }

    return Object.freeze(receipt);
  }

  async function logs({
    ownerId,
    jobId,
    after = -1,
    limit = 100
  } = {}) {
    await refresh({ ownerId, jobId }).catch(error => {
      if (error?.code === 'code_runtime_provider_command_missing') return null;
      throw error;
    });
    return runtime.logs({ ownerId, jobId, after, limit });
  }

  return Object.freeze({
    start,
    refresh,
    cancel,
    listJobs,
    reconcileActive,
    logs,
    deterministicCommandId,
    commandLogChunks
  });
}

module.exports = {
  createCodeRuntimeExecutor,
  deterministicCommandId,
  permissionReplayAccepted,
  commandLogChunks,
  providerTimestamp
};
