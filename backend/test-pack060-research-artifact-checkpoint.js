'use strict';
const assert = require('node:assert/strict');
const {
  normalizeCheckpointRequest,
  buildArtifactInput,
  billingReceipt,
  presentationSlides
} = require('./lib/researchArtifactCheckpoint');
const {
  createResearchArtifactCheckpointRepository
} = require('./lib/researchArtifactCheckpointRepository');

const SOURCE = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

async function run() {
  const normalized = normalizeCheckpointRequest({
    title: 'Market research',
    researchText: 'Finding one.\n\nFinding two.',
    outputKind: 'presentation',
    researchMode: 'deep_research',
    projectId: PROJECT,
    sourceRecordIds: [SOURCE]
  });
  assert.equal(normalized.outputKind, 'presentation');
  assert.equal(normalized.sourceRecordIds[0], SOURCE);
  assert.throws(() => normalizeCheckpointRequest({
    title: 'No sources',
    researchText: 'Result',
    outputKind: 'document',
    sourceRecordIds: []
  }), /research_checkpoint_sources_required/);

  const presentationInput = buildArtifactInput(normalized);
  assert.equal(presentationInput.projectId, PROJECT);
  assert.equal(presentationInput.sourceRecordIds[0], SOURCE);
  assert.ok(presentationSlides(normalized).length >= 2);

  const sheetInput = buildArtifactInput({
    ...normalized,
    outputKind: 'spreadsheet'
  });
  assert.deepEqual(sheetInput.formats, ['xlsx','csv']);
  assert.equal(sheetInput.sheets[0].name, 'Research');

  const billing = billingReceipt(normalized);
  assert.equal(billing.conversionCreditsCharged, 0);
  assert.equal(billing.conversionProviderCalls, 0);
  assert.equal(billing.duplicateCharge, false);
  assert.equal(billing.upstreamResearchBillingUnaffected, true);

  const calls = [];
  const artifact = {
    contentId: '33333333-3333-4333-8333-333333333333',
    versionId: '44444444-4444-4444-8444-444444444444',
    assets: [{ assetId: '55555555-5555-4555-8555-555555555555', format: 'pdf' }],
    providerCalls: 0,
    billedCredits: 0
  };
  const repository = createResearchArtifactCheckpointRepository({
    documentStudio: {
      async renderDocument(input) { calls.push(['document', input]); return artifact; }
    },
    officeStudio: {
      async renderSpreadsheet(input) { calls.push(['spreadsheet', input]); return artifact; },
      async renderPresentation(input) { calls.push(['presentation', input]); return artifact; }
    },
    libraryStore: {
      async getItem(input) {
        calls.push(['reload', input]);
        return {
          id: artifact.contentId,
          current_version_id: artifact.versionId,
          assets: [{ id: artifact.assets[0].assetId, status: 'active' }]
        };
      }
    }
  });

  const result = await repository.create({
    ownerId: 'owner-60',
    input: {
      title: 'Cited brief',
      researchText: 'Verified result with [source-1].',
      outputKind: 'document',
      researchMode: 'web_search',
      projectId: PROJECT,
      sourceRecordIds: [SOURCE],
      requestId: 'pack060-test'
    }
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.reload.verified, true);
  assert.equal(result.download.assetIds[0], artifact.assets[0].assetId);
  assert.equal(result.billing.conversionCreditsCharged, 0);
  assert.equal(calls[0][0], 'document');
  assert.equal(calls[1][0], 'reload');
  assert.equal(calls[0][1].input.sourceRecordIds[0], SOURCE);

  const aborted = new AbortController();
  aborted.abort();
  let renderCount = 0;
  const cancellable = createResearchArtifactCheckpointRepository({
    documentStudio: { async renderDocument() { renderCount += 1; return artifact; } },
    officeStudio: { async renderSpreadsheet(){ return artifact; }, async renderPresentation(){ return artifact; } },
    libraryStore: { async getItem(){ return { id: artifact.contentId, assets: [] }; } }
  });
  await assert.rejects(
    () => cancellable.create({
      ownerId: 'owner-60',
      input: {
        title: 'Cancelled',
        researchText: 'Result',
        outputKind: 'document',
        sourceRecordIds: [SOURCE]
      },
      signal: aborted.signal
    }),
    error => error.code === 'research_checkpoint_cancelled'
  );
  assert.equal(renderCount, 0);

  let reloadCount = 0;
  const failing = createResearchArtifactCheckpointRepository({
    documentStudio: { async renderDocument(){ throw Object.assign(new Error('render_failed'), { code: 'render_failed' }); } },
    officeStudio: { async renderSpreadsheet(){ return artifact; }, async renderPresentation(){ return artifact; } },
    libraryStore: { async getItem(){ reloadCount += 1; return {}; } }
  });
  await assert.rejects(
    () => failing.create({
      ownerId: 'owner-60',
      input: {
        title: 'Failure',
        researchText: 'Result',
        outputKind: 'document',
        sourceRecordIds: [SOURCE]
      }
    }),
    /render_failed/
  );
  assert.equal(reloadCount, 0);


  const fs = require('node:fs');
  const path = require('node:path');
  const workspace = require('./config/workspace-system.v1.json');
  assert.ok(Number(workspace.pack) >= 60);
  assert.equal(workspace.foundations.researchArtifactCheckpoint, true);
  assert.equal(workspace.researchArtifactCheckpoint.requiresVerifiedSourceRecords, true);
  assert.equal(workspace.researchArtifactCheckpoint.conversionProviderCalls, 0);
  assert.equal(workspace.researchArtifactCheckpoint.conversionCredits, 0);

  const flags = require('./config/feature-flags.json');
  assert.equal(flags.research_artifact_checkpoint.enabled, true);
  assert.equal(flags.research_artifact_checkpoint.status, 'implemented_pending_visual_e2e');

  const product = require('./config/unified-product.v1.json');
  assert.equal(product.sections.find(item => item.id === 'research').status, 'implemented_pending_visual_e2e');
  for (const destination of ['documents','spreadsheets','presentations']) {
    assert.ok(product.connections.some(item => item.from === 'research' && item.to === destination), `Missing research→${destination} handoff`);
  }

  const frontend = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'zuvyr-suite-v1.js'), 'utf8');
  for (const marker of [
    '/api/workspace/research/artifacts',
    'data-zs-research-artifact-form',
    'conversion provider calls',
    'Verified source record IDs'
  ]) assert.ok(frontend.includes(marker), `Missing Pack060 frontend marker: ${marker}`);

  const repositorySource = fs.readFileSync(path.join(__dirname, 'lib', 'researchArtifactCheckpointRepository.js'), 'utf8');
  assert.doesNotMatch(repositorySource, /openrouter|anthropic|groq|stripe|reserveCredits|settleCredits|refundCredits/i);

  console.log('PASS: Pack060 research→cited result→artifact checkpoint preserves verified source IDs, reloads canonical Library content, avoids duplicate billing, and cancels before persistence');
}
run().catch(error => { console.error(error); process.exit(1); });
