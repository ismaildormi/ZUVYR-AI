'use strict';

const crypto = require('node:crypto');
const {
  createBrowserAgentRepository
} = require('./browserAgentRepository');
const {
  createCloudBrowserRepository
} = require('./cloudBrowserRepository');
const {
  createBrowserbaseProvider
} = require('./browserbaseProvider');
const {
  createCdpConnection
} = require('./cloudBrowserCdp');
const {
  createPermissionCenterStore
} = require('./permissionCenterRepository');
const {
  buildChallenge
} = require('./permissionCenterPolicy');
const {
  createBrowserAgentBrainPlan
} = require('./browserAgentPlanner');
const {
  classifyAction,
  normalizeText,
  assertObservationBoundary,
  permissionRequestForAction,
  assertConsumedGrantMatches,
  agentError,
  fingerprint
} = require('./browserAgentPolicy');
const {
  creditsForCostMicroUsd
} = require('./cloudBrowserPolicy');
const config = require('../config/browser-agent.v1.json');

const REASONING_RESERVATION_CREDITS = 10;

function controllerError(code, details = {}) {
  const error = agentError(code, details);
  return error;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(String(value || ''));
}

function parseDecisionText(value) {
  let text = String(value || '').trim()
    .replace(/^\s*\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`\s*$/i, '')
    .trim();

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first < 0 || last <= first) {
    throw controllerError('browser_agent_decision_invalid');
  }

  let parsed;
  try {
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch (_) {
    throw controllerError('browser_agent_decision_invalid');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw controllerError('browser_agent_decision_invalid');
  }

  const done = parsed.done === true;
  if (done) {
    return Object.freeze({
      done: true,
      expectedOutcome: String(parsed.expectedOutcome || '').slice(0, 500)
    });
  }

  if (!parsed.action || typeof parsed.action !== 'object' || Array.isArray(parsed.action)) {
    throw controllerError('browser_agent_action_required');
  }

  return Object.freeze({
    done: false,
    action: Object.freeze({ ...parsed.action }),
    expectedOutcome: String(parsed.expectedOutcome || '').slice(0, 500)
  });
}

function publicChallenge(challenge) {
  return Object.freeze({
    action: challenge.normalized.action,
    grantMode: challenge.normalized.grantMode,
    scopeType: challenge.normalized.scopeType,
    resourceNamespace: challenge.normalized.resourceNamespace,
    resourceId: challenge.normalized.resourceId,
    sessionId: challenge.normalized.sessionId,
    expiresAt: challenge.normalized.expiresAt,
    constraints: challenge.normalized.constraints,
    consequenceId: challenge.consequenceId,
    consequence: challenge.consequence,
    risk: challenge.risk,
    confirmationFingerprint: challenge.fingerprint
  });
}

function reasoningMessages({ run, observation, actions }) {
  const history = (actions || []).slice(-8).map(action => ({
    sequenceNo: action.sequenceNo,
    type: action.actionType,
    status: action.status,
    target: action.target,
    outcome: action.outcome
  }));

  const visibleItems = observation.items.map(item => ({
    handle: item.handle,
    tag: item.tag,
    role: item.role,
    type: item.type,
    text: item.text,
    sensitive: item.sensitive,
    submitLike: item.submitLike,
    link: item.link
  }));

  return [
    {
      role: 'system',
      content: [
        'You are the ZUVYR Browser Agent action selector.',
        'Return JSON only. Do not include chain-of-thought or rationale.',
        'Schema: {"done":boolean,"action":object|null,"expectedOutcome":string}.',
        'Allowed action types: navigate, click, type, scroll, wait, verify.',
        'For click/type use only a handle from the supplied observation.',
        'Never request or type passwords, OTPs, payment-card data, API keys, tokens or secrets.',
        'Never solve or bypass CAPTCHAs, authentication challenges, robots restrictions, or site safety controls.',
        'Do not invent elements or hosts.',
        'Use the smallest next action toward the goal.',
        'If the task is visibly complete, set done=true.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        goal: run.goal,
        allowedHosts: run.allowedHosts,
        page: observation.page,
        robots: observation.robots,
        captchaDetected: observation.captchaDetected,
        authChallengeDetected: observation.authChallengeDetected,
        items: visibleItems,
        recentActions: history
      })
    }
  ];
}

function actionFromDecision(decision, observation) {
  if (decision.done) return null;
  const action = { ...decision.action };
  const type = String(action.type || '').trim().toLowerCase();
  action.type = type;

  if (['click','type','submit'].includes(type)) {
    const handle = String(action.handle || action.target?.handle || '').trim();
    const item = observation.items.find(candidate => candidate.handle === handle);
    if (!item) throw controllerError('browser_agent_decision_target_not_observed');
    action.target = {
      ...item,
      host: observation.page?.host || null,
      path: observation.page?.path || null,
      captcha: observation.captchaDetected === true,
      authChallenge: observation.authChallengeDetected === true
    };
  }

  if (type === 'navigate') {
    action.url = String(action.url || '').trim();
  }

  if (type === 'scroll') {
    action.deltaY = Number(action.deltaY);
  }

  if (type === 'wait') {
    action.waitMs = Number(action.waitMs);
  }

  return action;
}

function verifiedTransientInput(internal, inputText, { required = false } = {}) {
  if (internal.action_type !== 'type') return null;

  if (inputText == null) {
    if (required) {
      throw controllerError('browser_agent_input_resubmission_required');
    }
    return null;
  }

  const text = normalizeText(inputText);
  const sha256 = crypto
    .createHash('sha256')
    .update(text, 'utf8')
    .digest('hex');
  const expectedSha = internal.input_sha256 || null;
  const expectedLength =
    internal.input_length == null
      ? null
      : Number(internal.input_length);

  if (
    !expectedSha ||
    expectedLength == null ||
    sha256 !== expectedSha ||
    text.length !== expectedLength
  ) {
    throw controllerError('browser_agent_input_integrity_mismatch');
  }

  return text;
}

function reconstructClassified(internal, { inputText = null } = {}) {
  return Object.freeze({
    type: internal.action_type,
    target: Object.freeze({ ...(internal.target || {}) }),
    text: verifiedTransientInput(internal, inputText, { required: false }),
    assetId: internal.target?.assetId || null,
    risk: internal.risk,
    permissionAction: internal.permission_action || null,
    retry: internal.permission_action ? 'never_blind' : 'safe',
    actionFingerprint: internal.action_fingerprint,
    persistedTarget: Object.freeze({ ...(internal.target || {}) }),
    inputSha256: internal.input_sha256 || null,
    inputLength:
      internal.input_length == null
        ? null
        : Number(internal.input_length)
  });
}

function createBrowserAgentController({
  db,
  storage,
  creditApi,
  routeRequestImpl = null,
  decisionEngine = null,
  browserProvider = null,
  permissionStore = null,
  WebSocketImpl = null,
  env = process.env
} = {}) {
  if (!db || !storage) {
    throw controllerError('browser_agent_dependencies_unavailable');
  }

  const agent = createBrowserAgentRepository(db);
  const browser = createCloudBrowserRepository({ db, storage });
  const permissions = permissionStore || createPermissionCenterStore(db);
  const provider = browserProvider || createBrowserbaseProvider({ env });

  async function withCdp(internal, work) {
    const connection = createCdpConnection({
      connectUrl: provider.connectUrl(internal.provider_session_id),
      allowedHosts: Array.isArray(internal.network_policy?.allowedHosts)
        ? internal.network_policy.allowedHosts
        : [],
      ...(WebSocketImpl ? { WebSocketImpl } : {})
    });
    await connection.connect();
    try {
      return await work(connection);
    } finally {
      await connection.disconnect().catch(() => null);
    }
  }

  async function captureEvidence({ ownerId, run, actionId, phase, cdp }) {
    const image = await cdp.screenshot({ format: 'png' });
    return browser.uploadCanonical({
      ownerId,
      sessionId: run.browserSessionId,
      kind: 'screenshot',
      buffer: image.buffer,
      mimeType: image.mimeType,
      fileName:
        'pack082-' + run.id + '-' +
        String(actionId || 'observe') + '-' + phase + '.png',
      metadata: {
        pack: 82,
        runId: run.id,
        actionId: actionId || null,
        phase
      }
    });
  }

  async function observe({ ownerId, run, cdp, evidencePhase = null, actionId = null }) {
    const [snapshot, robots] = await Promise.all([
      cdp.interactiveSnapshot({
        maxElements: config.run.observationMaxElements
      }),
      cdp.robotsStatus()
    ]);
    const observation = Object.freeze({
      ...snapshot,
      robots
    });
    let evidence = null;
    if (evidencePhase) {
      evidence = await captureEvidence({
        ownerId,
        run,
        actionId,
        phase: evidencePhase,
        cdp
      });
    }
    return Object.freeze({ observation, evidence });
  }

  async function reasoningCall({
    ownerId,
    run,
    observation,
    actions,
    requestId
  }) {
    const observationSha256 = fingerprint({
      page: observation.page,
      robots: observation.robots,
      captchaDetected: observation.captchaDetected,
      authChallengeDetected: observation.authChallengeDetected,
      items: observation.items.map(item => ({
        handle: item.handle,
        tag: item.tag,
        role: item.role,
        type: item.type,
        text: item.text,
        sensitive: item.sensitive,
        submitLike: item.submitLike,
        link: item.link
      }))
    });

    const begun = await agent.beginReasoning({
      ownerId,
      runId: run.id,
      requestId,
      observationSha256
    });

    if (begun.replayed) {
      if (begun.row.status === 'processing') {
        throw controllerError('browser_agent_reasoning_in_progress_or_unknown');
      }
      if (begun.row.status === 'failed') {
        throw controllerError('browser_agent_reasoning_previous_failed');
      }
      if (begun.row.status === 'succeeded') {
        return Object.freeze({
          replayed: true,
          actionId: begun.row.action_id || null,
          decisionSummary: begun.row.decision_summary || {}
        });
      }
    }

    const creditRequestId = ('browser-agent-reason:' + requestId).slice(0, 200);
    let reserved = false;
    let settled = false;

    try {
      if (!creditApi ||
          typeof creditApi.reserveCredits !== 'function' ||
          typeof creditApi.settleCredits !== 'function' ||
          typeof creditApi.refundCredits !== 'function') {
        throw controllerError('browser_agent_credit_api_unavailable');
      }

      await creditApi.reserveCredits({
        userId: ownerId,
        requestId: creditRequestId,
        feature: 'ip',
        modelUsed: decisionEngine ? 'pack082-test-decision-engine' : 'router',
        creditsConsumed: REASONING_RESERVATION_CREDITS,
        taskId: run.taskRunId || run.id,
        stepId: 'browser-agent-reasoning',
        usageKind: 'browser_agent_reasoning',
        pricingVersion: 'pack082.measured-model-cost.v1'
      });
      reserved = true;

      let decision;
      let model = 'pack082-test-decision-engine';
      let providerCostMicroUsd = 0;
      let modelUsage = null;

      if (typeof decisionEngine === 'function') {
        decision = await decisionEngine({
          run,
          observation,
          actions: Object.freeze([...(actions || [])])
        });
      } else {
        if (typeof routeRequestImpl !== 'function') {
          throw controllerError('browser_agent_model_router_unavailable');
        }
        const result = await routeRequestImpl(
          'chat',
          reasoningMessages({ run, observation, actions }),
          {
            requestId: creditRequestId,
            isPro: true,
            loadLevel: 'normal'
          }
        );
        decision = parseDecisionText(result.text);
        model = String(result.model || 'router').slice(0, 200);
        const costUsd = Number(result.cost_usd);
        if (!Number.isFinite(costUsd) || costUsd < 0) {
          throw controllerError('browser_agent_reasoning_cost_invalid');
        }
        providerCostMicroUsd = Math.ceil(costUsd * 1_000_000);
        modelUsage = result.usage || null;
      }

      if (!decision || typeof decision !== 'object') {
        throw controllerError('browser_agent_decision_invalid');
      }
      if (!Object.prototype.hasOwnProperty.call(decision, 'done')) {
        decision = parseDecisionText(JSON.stringify(decision));
      }

      const finalCredits = providerCostMicroUsd === 0 && decisionEngine
        ? 0
        : Math.max(1, creditsForCostMicroUsd(providerCostMicroUsd));

      await creditApi.settleCredits(creditRequestId, finalCredits);
      settled = true;

      if (typeof creditApi.logCreditEvent === 'function') {
        await creditApi.logCreditEvent({
          userId: ownerId,
          feature: 'ip',
          modelUsed: model,
          status: 'success',
          requestId: (creditRequestId + ':detail').slice(0, 200),
          metadata: {
            usage_kind: 'browser_agent_reasoning',
            run_id: run.id,
            provider_cost_micro_usd: providerCostMicroUsd,
            credits_charged: finalCredits,
            usage: modelUsage
          }
        });
      }

      return Object.freeze({
        replayed: false,
        decision,
        model,
        providerCostMicroUsd,
        creditsCharged: finalCredits,
        reasoningRequestId: requestId
      });
    } catch (error) {
      if (reserved && !settled) {
        try {
          await creditApi.refundCredits(creditRequestId);
        } catch (refundError) {
          if (typeof creditApi?.reportRefundFailure === 'function') {
            await creditApi.reportRefundFailure({
              requestId: creditRequestId,
              userId: ownerId,
              feature: 'ip',
              error: refundError
            }).catch(() => null);
          }
        }
      }
      await agent.failReasoning({
        ownerId,
        requestId,
        failureCode: error.code || error.message
      }).catch(() => null);
      throw error;
    }
  }

  function approvalFor({ ownerId, run, classified }) {
    const request = permissionRequestForAction({
      ownerId,
      browserSessionId: run.browserSessionId,
      classified,
      host: classified.target?.host || run.currentHost || null
    });
    if (!request) return null;
    return publicChallenge(buildChallenge(request, { ownerId }));
  }

  async function transitionFailedAction({
    ownerId,
    action,
    uncertain,
    beforeArtifactId,
    error
  }) {
    const state = uncertain ? 'uncertain' : 'failed';
    return agent.transitionAction({
      ownerId,
      actionId: action.id,
      expectedStatus: 'executing',
      status: state,
      beforeArtifactId,
      outcome: {
        visibleEvidenceAfterAction: false
      },
      failureCode: error.code || error.message
    });
  }

  async function executeAction({
    ownerId,
    run,
    action,
    cdp,
    inputText = null
  }) {
    const internal = await agent.getActionInternal({
      ownerId,
      actionId: action.id
    });
    const classified = reconstructClassified(internal, { inputText });
    const transientText = verifiedTransientInput(
      internal,
      inputText,
      { required: internal.action_type === 'type' }
    );

    if (!['planned','approved'].includes(internal.status)) {
      if (internal.status === 'executing') {
        const uncertain = await agent.transitionAction({
          ownerId,
          actionId: internal.id,
          expectedStatus: 'executing',
          status: 'uncertain',
          outcome: { reason: 'execution_state_recovered_after_interruption' },
          failureCode: 'browser_agent_execution_interrupted_unknown'
        });
        return Object.freeze({ state: 'uncertain', action: uncertain });
      }
      return Object.freeze({ state: internal.status, action });
    }

    const fresh = await cdp.interactiveSnapshot({
      maxElements: config.run.observationMaxElements
    });
    const robots = await cdp.robotsStatus();
    const observation = Object.freeze({ ...fresh, robots });

    if (observation.captchaDetected) {
      throw controllerError('browser_agent_captcha_user_required');
    }
    if (observation.page?.host && observation.robots !== 'allowed') {
      throw controllerError(
        observation.robots === 'disallowed'
          ? 'browser_agent_robots_disallowed'
          : 'browser_agent_robots_unknown'
      );
    }

    if (classified.target?.handle) {
      const current = observation.items.find(
        item => item.handle === classified.target.handle
      );
      if (!current) {
        throw controllerError('browser_agent_target_stale');
      }
      if (current.sensitive) {
        throw controllerError('browser_agent_sensitive_input_blocked');
      }
    }

    let before = null;
    if (classified.permissionAction && config.evidence.beforeConsequenceAction) {
      before = await captureEvidence({
        ownerId,
        run,
        actionId: internal.id,
        phase: 'before',
        cdp
      });
    }

    const executing = await agent.transitionAction({
      ownerId,
      actionId: internal.id,
      expectedStatus: internal.status,
      status: 'executing',
      permissionGrantId: internal.permission_grant_id,
      beforeArtifactId: before?.id || null,
      outcome: {}
    });

    let outcome = {};
    let sideEffectStarted = false;

    try {
      switch (internal.action_type) {
        case 'observe':
        case 'verify':
          outcome = {
            page: observation.page,
            robots: observation.robots,
            visibleElements: observation.items.length
          };
          break;

        case 'navigate': {
          const protocol = String(internal.target?.protocol || 'https:');
          const host = String(internal.target?.host || '');
          const path = String(internal.target?.path || '/');
          sideEffectStarted = true;
          outcome = await cdp.navigate(protocol + '//' + host + path);
          break;
        }

        case 'click':
          sideEffectStarted = true;
          outcome = await cdp.clickHandle(internal.target?.handle);
          break;

        case 'type':
          sideEffectStarted = true;
          outcome = await cdp.typeHandle(
            internal.target?.handle,
            transientText
          );
          break;

        case 'submit':
          sideEffectStarted = true;
          outcome = await cdp.submitHandle(internal.target?.handle);
          break;

        case 'scroll':
          outcome = await cdp.scrollBy(internal.target?.deltaY);
          break;

        case 'wait':
          await new Promise(resolve =>
            setTimeout(
              resolve,
              Math.max(
                50,
                Math.min(config.run.waitMaxMs, Number(internal.target?.waitMs) || 500)
              )
            )
          );
          outcome = { waitedMs: Number(internal.target?.waitMs) || 500 };
          break;

        case 'upload': {
          const assetId = internal.target?.assetId;
          const owned = await browser.downloadOwnedAssetBuffer({
            ownerId,
            assetId
          });
          sideEffectStarted = true;
          const staged = await provider.uploadFile(
            (await browser.internal({
              ownerId,
              sessionId: run.browserSessionId
            })).provider_session_id,
            {
              buffer: owned.buffer,
              fileName: owned.fileName,
              mimeType: owned.mimeType
            }
          );
          await browser.recordOwnedUpload({
            ownerId,
            sessionId: run.browserSessionId,
            assetId,
            providerArtifactId: staged.providerArtifactId,
            fileName: staged.fileName
          });
          outcome = {
            staged: true,
            assetId
          };
          break;
        }

        default:
          throw controllerError('browser_agent_action_unsupported');
      }

      const after = await captureEvidence({
        ownerId,
        run,
        actionId: internal.id,
        phase: 'after',
        cdp
      });

      const page = await cdp.currentPage();
      const succeeded = await agent.transitionAction({
        ownerId,
        actionId: internal.id,
        expectedStatus: 'executing',
        status: 'succeeded',
        permissionGrantId: internal.permission_grant_id,
        beforeArtifactId: before?.id || null,
        afterArtifactId: after.id,
        outcome: {
          ...outcome,
          verifiedPage: page,
          visibleEvidenceAfterAction: true
        }
      });

      const updatedRun = await agent.getRun({ ownerId, runId: run.id });
      if (
        updatedRun.status === 'approval_required' &&
        !updatedRun.stopRequested
      ) {
        await agent.transitionRun({
          ownerId,
          runId: run.id,
          status: 'running',
          currentHost: page.host || null
        }).catch(() => null);
      }

      return Object.freeze({
        state: 'succeeded',
        action: succeeded,
        evidence: {
          beforeArtifactId: before?.id || null,
          afterArtifactId: after.id
        },
        page
      });
    } catch (error) {
      const uncertain =
        sideEffectStarted &&
        ['click','type','submit','upload'].includes(internal.action_type);
      const failed = await transitionFailedAction({
        ownerId,
        action: executing,
        uncertain,
        beforeArtifactId: before?.id || null,
        error
      }).catch(() => null);
      if (uncertain) {
        await agent.transitionRun({
          ownerId,
          runId: run.id,
          status: 'approval_required'
        }).catch(() => null);
      }
      error.action = failed;
      throw error;
    }
  }

  async function planRun({
    ownerId,
    browserSessionId,
    requestId,
    goal,
    conversationId = null,
    taskRunId = null,
    maxSteps = config.run.defaultMaxSteps
  } = {}) {
    if (!uuid(browserSessionId)) {
      throw controllerError('browser_agent_session_invalid');
    }

    const internal = await browser.internal({
      ownerId,
      sessionId: browserSessionId
    });
    if (!['running','detached'].includes(internal.status)) {
      throw controllerError('pack082_browser_session_not_available');
    }

    const allowedHosts = Array.isArray(internal.network_policy?.allowedHosts)
      ? internal.network_policy.allowedHosts
      : [];
    if (!allowedHosts.length) {
      throw controllerError('browser_agent_allowed_hosts_required');
    }

    const brain = createBrowserAgentBrainPlan({
      requestId,
      goal,
      conversationId,
      taskRunId,
      allowedHosts,
      maxSteps
    });

    let run = await agent.reserveRun({
      ownerId,
      browserSessionId,
      conversationId,
      taskRunId,
      requestId,
      goalRedacted: brain.goalRedacted,
      goalSha256: brain.goalSha256,
      planVersion: brain.planVersion,
      intentFingerprint: brain.intentFingerprint,
      allowedHosts,
      maxSteps: Math.max(1, Math.min(config.run.maxSteps, Number(maxSteps) || config.run.defaultMaxSteps))
    });

    if (run.status === 'planned') {
      run = await agent.transitionRun({
        ownerId,
        runId: run.id,
        status: 'running'
      });
    }

    return Object.freeze({
      run,
      brain: Object.freeze({
        plannerId: brain.plan.plannerId,
        graphVersion: brain.plan.graphVersion,
        planFingerprint: brain.plan.planFingerprint,
        intentFingerprint: brain.intentFingerprint,
        capability: brain.plan.steps[0].capability
      })
    });
  }

  async function existingApproval({ ownerId, run, action }) {
    const internal = await agent.getActionInternal({
      ownerId,
      actionId: action.id
    });
    const classified = reconstructClassified(internal);
    return Object.freeze({
      state: 'approval_required',
      run,
      action,
      approval: approvalFor({ ownerId, run, classified }),
      transientInput:
        internal.action_type === 'type'
          ? Object.freeze({
              requiredOnApprove: true,
              available: false
            })
          : null
    });
  }

  async function advance({
    ownerId,
    runId,
    requestId
  } = {}) {
    let run = await agent.getRun({ ownerId, runId });
    if (['succeeded','failed','cancelled','stopped'].includes(run.status)) {
      return Object.freeze({ state: run.status, run });
    }
    if (run.stopRequested) {
      return Object.freeze({ state: 'stopping', run });
    }

    const actions = await agent.listActions({ ownerId, runId });
    const last = actions[actions.length - 1] || null;

    if (last?.status === 'approval_required') {
      return existingApproval({ ownerId, run, action: last });
    }
    if (last?.status === 'uncertain') {
      return Object.freeze({
        state: 'uncertain',
        run,
        action: last,
        requiresUserDecision: true
      });
    }

    const internalSession = await browser.internal({
      ownerId,
      sessionId: run.browserSessionId
    });

    return withCdp(internalSession, async cdp => {
      if (last?.status === 'approved' || last?.status === 'planned' || last?.status === 'executing') {
        return executeAction({ ownerId, run, action: last, cdp });
      }

      const existingReasoning = await agent.getReasoning({
        ownerId,
        requestId
      });
      if (existingReasoning) {
        if (existingReasoning.run_id !== run.id) {
          throw controllerError('pack082_reasoning_idempotency_scope_mismatch');
        }
        if (existingReasoning.status === 'processing') {
          throw controllerError('browser_agent_reasoning_in_progress_or_unknown');
        }
        if (existingReasoning.status === 'failed') {
          throw controllerError('browser_agent_reasoning_previous_failed');
        }
        if (existingReasoning.action_id) {
          const replayedAction = await agent.getAction({
            ownerId,
            actionId: existingReasoning.action_id
          });
          if (replayedAction.status === 'approval_required') {
            return existingApproval({
              ownerId,
              run,
              action: replayedAction
            });
          }
          return executeAction({
            ownerId,
            run,
            action: replayedAction,
            cdp
          });
        }
        run = await agent.getRun({ ownerId, runId });
        return Object.freeze({ state: run.status, run, replayed: true });
      }

      const { observation } = await observe({
        ownerId,
        run,
        cdp
      });

      if (observation.captchaDetected) {
        if (run.status === 'running') {
          run = await agent.transitionRun({
            ownerId,
            runId: run.id,
            status: 'approval_required',
            currentHost: observation.page?.host || null
          });
        }
        return Object.freeze({
          state: 'human_required',
          reason: 'captcha',
          run,
          observation: {
            page: observation.page,
            captchaDetected: true
          }
        });
      }

      if (observation.page?.host && observation.robots !== 'allowed') {
        if (observation.robots === 'disallowed') {
          run = await agent.transitionRun({
            ownerId,
            runId: run.id,
            status: 'failed',
            currentHost: observation.page.host,
            failureCode: 'browser_agent_robots_disallowed'
          });
          return Object.freeze({
            state: 'failed',
            reason: 'robots_disallowed',
            run
          });
        }
        if (run.status === 'running') {
          run = await agent.transitionRun({
            ownerId,
            runId: run.id,
            status: 'approval_required',
            currentHost: observation.page.host
          });
        }
        return Object.freeze({
          state: 'human_required',
          reason: 'robots_unknown',
          run
        });
      }

      assertObservationBoundary(observation);

      const reasoned = await reasoningCall({
        ownerId,
        run,
        observation,
        actions,
        requestId
      });

      if (reasoned.replayed) {
        if (reasoned.actionId) {
          const replayedAction = await agent.getAction({
            ownerId,
            actionId: reasoned.actionId
          });
          return replayedAction.status === 'approval_required'
            ? existingApproval({ ownerId, run, action: replayedAction })
            : executeAction({ ownerId, run, action: replayedAction, cdp });
        }
        run = await agent.getRun({ ownerId, runId });
        return Object.freeze({ state: run.status, run, replayed: true });
      }

      const decision = reasoned.decision;
      if (decision.done === true) {
        await agent.completeReasoning({
          ownerId,
          requestId,
          actionId: null,
          decisionSummary: {
            done: true,
            expectedOutcome: decision.expectedOutcome
          },
          model: reasoned.model,
          providerCostMicroUsd: reasoned.providerCostMicroUsd,
          creditsCharged: reasoned.creditsCharged
        });
        const page = await cdp.currentPage();
        run = await agent.transitionRun({
          ownerId,
          runId: run.id,
          status: 'succeeded',
          currentHost: page.host || null
        });
        return Object.freeze({
          state: 'succeeded',
          run,
          verifiedPage: page
        });
      }

      const proposed = actionFromDecision(decision, observation);
      const classified = classifyAction(proposed, {
        allowedHosts: run.allowedHosts
      });
      const action = await agent.reserveAction({
        ownerId,
        runId: run.id,
        requestId: ('browser-agent-action:' + requestId).slice(0, 200),
        classified
      });

      await agent.completeReasoning({
        ownerId,
        requestId,
        actionId: action.id,
        decisionSummary: {
          done: false,
          actionType: classified.type,
          actionFingerprint: classified.actionFingerprint,
          target: classified.persistedTarget,
          expectedOutcome: decision.expectedOutcome
        },
        model: reasoned.model,
        providerCostMicroUsd: reasoned.providerCostMicroUsd,
        creditsCharged: reasoned.creditsCharged
      });

      if (classified.permissionAction) {
        run = await agent.getRun({ ownerId, runId });
        return Object.freeze({
          state: 'approval_required',
          run,
          action,
          approval: approvalFor({
            ownerId,
            run,
            classified
          }),
          transientInput:
            classified.type === 'type'
              ? Object.freeze({
                  requiredOnApprove: true,
                  available: true,
                  text: classified.text
                })
              : null
        });
      }

      return executeAction({
        ownerId,
        run,
        action,
        cdp
      });
    });
  }

  async function approveAction({
    ownerId,
    runId,
    actionId,
    inputText = null
  } = {}) {
    let run = await agent.getRun({ ownerId, runId });
    let internal = await agent.getActionInternal({ ownerId, actionId });

    if (internal.run_id !== run.id) {
      throw controllerError('browser_agent_action_run_mismatch');
    }

    if (['succeeded','failed','uncertain','cancelled'].includes(internal.status)) {
      return Object.freeze({
        state: internal.status,
        run,
        action: await agent.getAction({ ownerId, actionId }),
        replayed: true
      });
    }

    if (!['approval_required','approved'].includes(internal.status)) {
      throw controllerError('browser_agent_action_not_awaiting_approval');
    }
    if (!internal.permission_action) {
      throw controllerError('browser_agent_action_permission_missing');
    }

    // Validate transient type payload before consuming an allow-once grant.
    const transientText = verifiedTransientInput(
      internal,
      inputText,
      { required: internal.action_type === 'type' }
    );
    const classified = reconstructClassified(internal, {
      inputText: transientText
    });

    let replayedGrant = internal.status === 'approved';

    if (internal.status === 'approval_required') {
      const consumeRequestId =
        ('browser-agent-permission:' + internal.id).slice(0, 200);
      let consumed = await permissions.consume({
        ownerId,
        action: internal.permission_action,
        resourceNamespace: 'browser_session',
        resourceId: run.browserSessionId,
        sessionId: run.browserSessionId,
        requestId: consumeRequestId
      });

      if (
        consumed.allowed !== true &&
        consumed.replayed === true &&
        consumed.grant_id
      ) {
        const grants = await permissions.listGrants(ownerId, { limit: 100 });
        const grant = grants.find(item => item.id === consumed.grant_id);
        if (grant) {
          consumed = {
            ...consumed,
            allowed: true,
            constraints: grant.constraints || {}
          };
        }
      }

      assertConsumedGrantMatches(classified, consumed);

      await agent.transitionAction({
        ownerId,
        actionId: internal.id,
        expectedStatus: 'approval_required',
        status: 'approved',
        permissionGrantId: consumed.grant_id,
        outcome: {}
      });
      replayedGrant = consumed.replayed === true;

      if (run.status === 'approval_required') {
        run = await agent.transitionRun({
          ownerId,
          runId: run.id,
          status: 'running'
        });
      }

      internal = await agent.getActionInternal({ ownerId, actionId });
    } else {
      // A previous approve request may have committed the grant transition
      // before its browser execution response was delivered. Continue safely
      // from the durable approved state without consuming another grant.
      if (!internal.permission_grant_id) {
        throw controllerError('browser_agent_permission_grant_required');
      }
    }

    const internalSession = await browser.internal({
      ownerId,
      sessionId: run.browserSessionId
    });

    const approvedAction = await agent.getAction({
      ownerId,
      actionId
    });
    const executed = await withCdp(internalSession, cdp =>
      executeAction({
        ownerId,
        run,
        action: approvedAction,
        cdp,
        inputText: transientText
      })
    );

    return Object.freeze({
      ...executed,
      replayed: replayedGrant
    });
  }

  async function resumeHumanBoundary({ ownerId, runId } = {}) {
    let run = await agent.getRun({ ownerId, runId });
    if (run.status !== 'approval_required') {
      return Object.freeze({ run, resumed: false });
    }

    const actions = await agent.listActions({ ownerId, runId });
    if (actions.some(item => item.status === 'approval_required')) {
      throw controllerError('browser_agent_action_approval_pending');
    }

    const internalSession = await browser.internal({
      ownerId,
      sessionId: run.browserSessionId
    });

    await withCdp(internalSession, async cdp => {
      const snapshot = await cdp.interactiveSnapshot({
        maxElements: config.run.observationMaxElements
      });
      const robots = await cdp.robotsStatus();
      if (snapshot.captchaDetected) {
        throw controllerError('browser_agent_captcha_user_required');
      }
      if (snapshot.authChallengeDetected) {
        throw controllerError('browser_agent_auth_user_required');
      }
      if (snapshot.page?.host && robots !== 'allowed') {
        throw controllerError(
          robots === 'disallowed'
            ? 'browser_agent_robots_disallowed'
            : 'browser_agent_robots_unknown'
        );
      }
    });

    run = await agent.transitionRun({
      ownerId,
      runId: run.id,
      status: 'running'
    });
    return Object.freeze({ run, resumed: true });
  }

  async function stopRun({ ownerId, runId } = {}) {
    let run = await agent.getRun({ ownerId, runId });
    if (['succeeded','failed','cancelled','stopped'].includes(run.status)) {
      return Object.freeze({ run, replayed: true });
    }

    if (run.status === 'planned') {
      run = await agent.transitionRun({
        ownerId,
        runId,
        status: 'cancelled'
      });
      return Object.freeze({ run, replayed: false });
    }

    if (run.status !== 'stopping') {
      run = await agent.transitionRun({
        ownerId,
        runId,
        status: 'stopping'
      });
    }

    const actions = await agent.listActions({ ownerId, runId });
    const active = actions.find(item =>
      ['planned','approval_required','approved'].includes(item.status)
    );
    if (active) {
      await agent.transitionAction({
        ownerId,
        actionId: active.id,
        expectedStatus: active.status,
        status: 'cancelled',
        outcome: { reason: 'global_stop' }
      }).catch(() => null);
    }

    run = await agent.transitionRun({
      ownerId,
      runId,
      status: 'stopped'
    });
    return Object.freeze({ run, replayed: false });
  }

  async function getRun({ ownerId, runId } = {}) {
    const run = await agent.getRun({ ownerId, runId });
    const actions = await agent.listActions({ ownerId, runId });
    return Object.freeze({ run, actions });
  }

  async function listRuns({
    ownerId,
    browserSessionId = null,
    limit = 30
  } = {}) {
    return agent.listRuns({
      ownerId,
      browserSessionId,
      limit
    });
  }

  return Object.freeze({
    planRun,
    advance,
    approveAction,
    resumeHumanBoundary,
    stopRun,
    getRun,
    listRuns
  });
}

module.exports = {
  REASONING_RESERVATION_CREDITS,
  parseDecisionText,
  reasoningMessages,
  actionFromDecision,
  createBrowserAgentController
};
