'use strict';

const {
  checkpointError,
  normalizeCheckpointRequest,
  buildArtifactInput,
  billingReceipt
} = require('./researchArtifactCheckpoint');

function createResearchArtifactCheckpointRepository({
  documentStudio,
  officeStudio,
  libraryStore
} = {}) {
  if (!documentStudio || typeof documentStudio.renderDocument !== 'function') {
    throw new TypeError('Research artifact checkpoint requires Document Studio.');
  }
  if (
    !officeStudio ||
    typeof officeStudio.renderSpreadsheet !== 'function' ||
    typeof officeStudio.renderPresentation !== 'function'
  ) {
    throw new TypeError('Research artifact checkpoint requires Office Artifact Studio.');
  }
  if (!libraryStore || typeof libraryStore.getItem !== 'function') {
    throw new TypeError('Research artifact checkpoint requires Library reload support.');
  }

  function assertNotCancelled(signal) {
    if (signal && signal.aborted) throw checkpointError('research_checkpoint_cancelled', 409);
  }

  async function create({ ownerId, input, signal = null }) {
    const request = normalizeCheckpointRequest(input);
    assertNotCancelled(signal);

    const artifactInput = buildArtifactInput(request);
    assertNotCancelled(signal);

    let artifact;
    if (request.outputKind === 'document') {
      artifact = await documentStudio.renderDocument({ ownerId, input: artifactInput });
    } else if (request.outputKind === 'spreadsheet') {
      artifact = await officeStudio.renderSpreadsheet({ ownerId, input: artifactInput });
    } else {
      artifact = await officeStudio.renderPresentation({ ownerId, input: artifactInput });
    }

    if (!artifact || !artifact.contentId) {
      throw checkpointError('research_checkpoint_artifact_missing', 500);
    }

    const reloaded = await libraryStore.getItem({
      ownerId,
      contentId: artifact.contentId
    });

    const assets = Array.isArray(artifact.assets) ? artifact.assets : [];
    return Object.freeze({
      schemaVersion: 'pack060.research-artifact-checkpoint.v1',
      status: 'completed',
      requestId: request.requestId,
      outputKind: request.outputKind,
      researchMode: request.researchMode,
      contentId: artifact.contentId,
      versionId: artifact.versionId || null,
      projectId: request.projectId,
      sourceRecordIds: request.sourceRecordIds,
      artifact,
      reload: {
        verified: Boolean(reloaded && reloaded.id === artifact.contentId),
        canonicalContentId: reloaded?.id || null,
        currentVersionId: reloaded?.current_version_id || artifact.versionId || null,
        activeAssetCount: Array.isArray(reloaded?.assets)
          ? reloaded.assets.filter(item => item.status === 'active').length
          : assets.length
      },
      download: {
        route: `/api/workspace/library/items/${artifact.contentId}/download`,
        assetIds: assets.map(item => item.assetId).filter(Boolean),
        signedUrlCreated: false
      },
      billing: billingReceipt(request),
      cancellation: {
        supportedBeforePersistence: true,
        postPersistenceCancellation: false
      },
      failurePolicy: {
        conversionChargeOnFailure: 0,
        replayUsesCanonicalArtifactIdentity: true
      }
    });
  }

  return Object.freeze({ create });
}

function getDefaultResearchArtifactCheckpointRepository({
  documentStudio = null,
  officeStudio = null,
  libraryStore = null,
  projectStore = null
} = {}) {
  const { getDefaultWorkspaceLibraryStore } = require('./workspaceLibraryRepository');
  const { getDefaultDocumentStudioRepository } = require('./documentStudioRepository');
  const { getDefaultOfficeArtifactRepository } = require('./officeArtifactRepository');
  const resolvedLibrary = libraryStore || getDefaultWorkspaceLibraryStore();
  return createResearchArtifactCheckpointRepository({
    documentStudio: documentStudio || getDefaultDocumentStudioRepository({ projectStore }),
    officeStudio: officeStudio || getDefaultOfficeArtifactRepository({ projectStore }),
    libraryStore: resolvedLibrary
  });
}

module.exports = {
  createResearchArtifactCheckpointRepository,
  getDefaultResearchArtifactCheckpointRepository
};
