'use strict';

const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = new Set(['voice_clone','voice_design_reference']);
const BASES = new Set(['self_voice','documented_permission']);

function rightsError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requiredUuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!UUID.test(text)) throw rightsError(code);
  return text;
}

function normalizeScope(value) {
  const scope = String(value || 'voice_clone').trim().toLowerCase();
  if (!SCOPES.has(scope)) throw rightsError('voice_rights_scope_invalid');
  return scope;
}

function normalizeBasis(value) {
  const basis = String(value || '').trim().toLowerCase();
  if (!BASES.has(basis)) throw rightsError('voice_rights_basis_invalid');
  return basis;
}

function normalizeEvidence(value, basis) {
  const evidence = value == null ? null : String(value).trim();
  if (evidence && evidence.length > 500) throw rightsError('voice_rights_evidence_invalid');
  if (basis === 'documented_permission' && (!evidence || evidence.length < 3)) {
    throw rightsError('voice_rights_evidence_required');
  }
  return evidence || null;
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function createVoiceRightsStore(db) {
  if (!db || typeof db.from !== 'function') throw rightsError('voice_rights_store_unavailable');

  async function inspectSource({ ownerId, sourceAudioAssetId }) {
    const owner = requiredUuid(ownerId, 'voice_rights_owner_invalid');
    const source = requiredUuid(sourceAudioAssetId, 'voice_rights_source_invalid');
    const result = await db.from('conversation_assets')
      .select('id,owner_id,asset_type,scan_status,canonical_asset_id')
      .eq('id', source)
      .eq('owner_id', owner)
      .maybeSingle();
    if (result.error) throw rightsError('voice_rights_source_lookup_failed');
    const row = result.data;
    if (!row || String(row.asset_type || '').toLowerCase() !== 'audio') {
      throw rightsError('voice_rights_source_not_owned');
    }
    if (String(row.scan_status || '').toLowerCase() !== 'clean') {
      throw rightsError('voice_rights_source_not_ready');
    }
    const canonicalAssetId = requiredUuid(
      row.canonical_asset_id,
      'voice_rights_source_not_canonical'
    );
    return Object.freeze({ ownerId: owner, sourceAudioAssetId: source, canonicalAssetId });
  }

  async function create(input) {
    if (input?.explicitConsent !== true) throw rightsError('voice_rights_explicit_consent_required');
    const source = await inspectSource(input);
    const scope = normalizeScope(input.scope);
    const rightsBasis = normalizeBasis(input.rightsBasis);
    const evidenceReference = normalizeEvidence(input.evidenceReference, rightsBasis);
    const issuedAt = new Date().toISOString();
    const consentFingerprint = fingerprint({
      ownerId: source.ownerId,
      sourceAudioAssetId: source.sourceAudioAssetId,
      canonicalSourceAssetId: source.canonicalAssetId,
      scope,
      rightsBasis,
      evidenceReference,
      issuedAt
    });
    const inserted = await db.from('zuvyr_voice_rights').insert({
      owner_id: source.ownerId,
      source_audio_asset_id: source.sourceAudioAssetId,
      canonical_source_asset_id: source.canonicalAssetId,
      scope,
      rights_basis: rightsBasis,
      evidence_reference: evidenceReference,
      explicit_consent: true,
      consent_fingerprint: consentFingerprint,
      issued_at: issuedAt,
      updated_at: issuedAt
    }).select('id,source_audio_asset_id,canonical_source_asset_id,scope,rights_basis,evidence_reference,consent_fingerprint,issued_at,revoked_at,created_at').single();
    if (inserted.error || !inserted.data) throw rightsError('voice_rights_create_failed');
    return inserted.data;
  }

  async function list(ownerId, { limit = 50, activeOnly = false } = {}) {
    const owner = requiredUuid(ownerId, 'voice_rights_owner_invalid');
    const bounded = Math.max(1, Math.min(Number(limit) || 50, 200));
    let query = db.from('zuvyr_voice_rights')
      .select('id,source_audio_asset_id,canonical_source_asset_id,scope,rights_basis,evidence_reference,consent_fingerprint,issued_at,revoked_at,created_at')
      .eq('owner_id', owner)
      .order('created_at', { ascending: false })
      .limit(bounded);
    if (activeOnly) query = query.is('revoked_at', null);
    const result = await query;
    if (result.error) throw rightsError('voice_rights_read_failed');
    return result.data || [];
  }

  async function revoke({ ownerId, id }) {
    const owner = requiredUuid(ownerId, 'voice_rights_owner_invalid');
    const rightId = requiredUuid(id, 'voice_rights_id_invalid');
    const now = new Date().toISOString();
    const result = await db.from('zuvyr_voice_rights')
      .update({ revoked_at: now, updated_at: now })
      .eq('id', rightId)
      .eq('owner_id', owner)
      .is('revoked_at', null)
      .select('id,revoked_at')
      .maybeSingle();
    if (result.error) throw rightsError('voice_rights_revoke_failed');
    if (!result.data) throw rightsError('voice_rights_not_found');
    return result.data;
  }

  async function assertActive({ ownerId, sourceAudioAssetId, scope = 'voice_clone' }) {
    const source = await inspectSource({ ownerId, sourceAudioAssetId });
    const normalizedScope = normalizeScope(scope);
    const result = await db.from('zuvyr_voice_rights')
      .select('id,canonical_source_asset_id,scope,rights_basis,consent_fingerprint,issued_at')
      .eq('owner_id', source.ownerId)
      .eq('source_audio_asset_id', source.sourceAudioAssetId)
      .eq('canonical_source_asset_id', source.canonicalAssetId)
      .eq('scope', normalizedScope)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (result.error) throw rightsError('voice_rights_read_failed');
    const row = Array.isArray(result.data) ? result.data[0] : null;
    if (!row) throw rightsError('voice_rights_active_consent_required');
    return row;
  }

  return Object.freeze({ inspectSource, create, list, revoke, assertActive });
}

let defaultStore = null;
function getDefaultVoiceRightsStore() {
  if (!defaultStore) {
    const { supabaseAdmin } = require('./supabaseAdmin');
    defaultStore = createVoiceRightsStore(supabaseAdmin);
  }
  return defaultStore;
}

module.exports = {
  createVoiceRightsStore,
  getDefaultVoiceRightsStore,
  normalizeScope,
  normalizeBasis
};
