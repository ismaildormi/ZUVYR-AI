'use strict';

const {
  normalizeContentInput,
  normalizeContentRecord
} = require('./universalContent');

function repositoryError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function createContentRepository({ client } = {}) {
  if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') {
    throw repositoryError('CONTENT_REPOSITORY_CLIENT_REQUIRED');
  }

  function rpcData(name, result) {
    if (!result || typeof result !== 'object') {
      throw repositoryError('CONTENT_RPC_RESULT_INVALID', { name });
    }
    if (result.error) {
      throw repositoryError('CONTENT_RPC_FAILED', {
        name,
        code: result.error.code || null
      });
    }
    return result.data;
  }

  return Object.freeze({
    async ensure(input) {
      const normalized = normalizeContentInput(input);
      const data = rpcData(
        'upsert_zuvyr_content_version',
        await client.rpc('upsert_zuvyr_content_version', {
          p_owner_id: normalized.ownerId,
          p_project_id: normalized.projectId,
          p_kind: normalized.kind,
          p_title: normalized.title,
          p_source_kind: normalized.sourceKind,
          p_source_system: normalized.sourceSystem,
          p_source_id: normalized.sourceId,
          p_source_version_key: normalized.sourceVersionKey,
          p_metadata: normalized.metadata,
          p_version: normalized.version
        })
      );
      return normalizeContentRecord(data);
    },

    async resolveBySource({ ownerId, sourceSystem, sourceId } = {}) {
      const data = rpcData(
        'resolve_zuvyr_content_by_source',
        await client.rpc('resolve_zuvyr_content_by_source', {
          p_owner_id: ownerId,
          p_source_system: sourceSystem,
          p_source_id: sourceId
        })
      );
      return data || null;
    },

    async get({ ownerId, contentId } = {}) {
      const result = await client
        .from('zuvyr_content_objects')
        .select(
          'id,owner_id,project_id,kind,title,status,source_kind,source_system,source_id,metadata,current_version_id,created_at,updated_at'
        )
        .eq('id', contentId)
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (result.error) {
        throw repositoryError('CONTENT_LOOKUP_FAILED', {
          code: result.error.code || null
        });
      }
      return result.data || null;
    }
  });
}

module.exports = {
  createContentRepository
};
