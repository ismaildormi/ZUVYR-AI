'use strict';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sourceRecordError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  error.cause = cause || null;
  return error;
}

function safeMessageId(value) {
  const text = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw sourceRecordError('invalid_source_message_id');
  }
  return text;
}

function safeCitationKey(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 80) {
    throw sourceRecordError('invalid_source_citation_key');
  }
  return text;
}

function publicSourceRecord(row, openUrl = null) {
  return {
    id: row.id,
    citationId: row.citation_key,
    type: row.source_type,
    title: row.title,
    url: row.url || null,
    openUrl: openUrl || row.url || null,
    snippet: row.snippet || '',
    externalId: row.external_id || null,
    projectId: row.project_id || null,
    canonicalAssetId: row.canonical_asset_id || null,
    canonicalContentId: row.canonical_content_id || null,
    metadata:
      row.metadata &&
      typeof row.metadata === 'object' &&
      !Array.isArray(row.metadata)
        ? row.metadata
        : {},
    verifiedAt: row.verified_at || null,
    createdAt: row.created_at || null
  };
}

function createSourceRecordRepository({
  db = null,
  storage = null,
  signedUrlSeconds = 600
} = {}) {
  function getDb() {
    if (db) return db;
    return require('./supabaseAdmin').supabaseAdmin;
  }

  function getStorage() {
    if (storage) return storage;
    return require('./supabaseAdmin').supabaseAdmin.storage;
  }

  async function requireOwnedConversation(conversationId, ownerId) {
    const { data, error } = await getDb()
      .from('shared_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('owner_id', ownerId)
      .maybeSingle();

    if (error) {
      throw sourceRecordError('source_conversation_lookup_failed', error);
    }
    if (!data) {
      throw sourceRecordError('conversation_not_found');
    }
  }

  async function listMessageSources({
    conversationId,
    ownerId,
    messageId
  }) {
    await requireOwnedConversation(conversationId, ownerId);
    const safeId = safeMessageId(messageId);

    const { data, error } = await getDb()
      .from('conversation_sources')
      .select(
        'id,conversation_id,message_id,owner_id,source_type,citation_key,' +
        'title,url,snippet,asset_id,canonical_asset_id,canonical_content_id,' +
        'project_id,external_id,metadata,verified_at,created_at'
      )
      .eq('conversation_id', conversationId)
      .eq('message_id', safeId)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });

    if (error) {
      throw sourceRecordError('conversation_sources_load_failed', error);
    }

    return (data || []).map(row => publicSourceRecord(row));
  }

  async function loadFileOpenUrl(row, ownerId) {
    let asset = null;

    if (row.asset_id) {
      const legacy = await getDb()
        .from('conversation_assets')
        .select('storage_bucket,storage_path,scan_status')
        .eq('id', row.asset_id)
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (legacy.error) {
        throw sourceRecordError('source_file_lookup_failed', legacy.error);
      }
      if (legacy.data && legacy.data.scan_status === 'clean') {
        asset = legacy.data;
      }
    }

    if (!asset && row.canonical_asset_id) {
      const canonical = await getDb()
        .from('zuvyr_assets')
        .select('storage_bucket,storage_path,status')
        .eq('id', row.canonical_asset_id)
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (canonical.error) {
        throw sourceRecordError(
          'source_canonical_file_lookup_failed',
          canonical.error
        );
      }
      if (canonical.data && canonical.data.status === 'active') {
        asset = canonical.data;
      }
    }

    if (!asset || !asset.storage_bucket || !asset.storage_path) {
      throw sourceRecordError('source_file_not_available');
    }

    const { data, error } = await getStorage()
      .from(asset.storage_bucket)
      .createSignedUrl(asset.storage_path, signedUrlSeconds);

    if (error || !data || !data.signedUrl) {
      throw sourceRecordError(
        'source_file_signed_url_failed',
        error || null
      );
    }

    return data.signedUrl;
  }

  async function getSourceRecord({
    conversationId,
    ownerId,
    messageId,
    citationKey
  }) {
    await requireOwnedConversation(conversationId, ownerId);
    const safeId = safeMessageId(messageId);
    const safeCitation = safeCitationKey(citationKey);

    const { data: row, error } = await getDb()
      .from('conversation_sources')
      .select(
        'id,conversation_id,message_id,owner_id,source_type,citation_key,' +
        'title,url,snippet,asset_id,canonical_asset_id,canonical_content_id,' +
        'project_id,external_id,metadata,verified_at,created_at'
      )
      .eq('conversation_id', conversationId)
      .eq('message_id', safeId)
      .eq('owner_id', ownerId)
      .eq('citation_key', safeCitation)
      .maybeSingle();

    if (error) {
      throw sourceRecordError('conversation_source_load_failed', error);
    }
    if (!row) {
      throw sourceRecordError('conversation_source_not_found');
    }

    let openUrl = row.url || null;
    if (row.source_type === 'file') {
      openUrl = await loadFileOpenUrl(row, ownerId);
    }

    return publicSourceRecord(row, openUrl);
  }

  return {
    listMessageSources,
    getSourceRecord
  };
}

const sourceRecordRepository = createSourceRecordRepository();

module.exports = {
  UUID_PATTERN,
  sourceRecordError,
  safeMessageId,
  safeCitationKey,
  publicSourceRecord,
  createSourceRecordRepository,
  ...sourceRecordRepository
};
