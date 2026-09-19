'use strict';

const express = require('express');
const {
  buildChallenge,
  publicPolicy
} = require('./permissionCenterPolicy');
const {
  createPermissionCenterStore,
  getDefaultPermissionCenterStore
} = require('./permissionCenterRepository');
const { createVoiceRightsStore } = require('./voiceRightsRepository');

function statusFor(error) {
  const code = String(error?.code || '');
  if (code.includes('not_owned') || code.includes('required') || code.includes('mismatch')) return 403;
  if (code.includes('unavailable') || code.includes('failed')) return 503;
  return 400;
}

function createPermissionCenterRouter({ db = null, store = null } = {}) {
  const router = express.Router();
  const permissions = store || (db ? createPermissionCenterStore(db) : getDefaultPermissionCenterStore());
  const voiceRights = db ? createVoiceRightsStore(db) : null;

  router.get('/policy', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({ status: 'success', policy: publicPolicy() });
  });

  router.post('/challenge', async (req, res) => {
    try {
      const challenge = buildChallenge(req.body, { ownerId: req.userId });
      const owned = await permissions.resourceOwned({
        ownerId: req.userId,
        resourceNamespace: challenge.normalized.resourceNamespace,
        resourceId: challenge.normalized.resourceId
      });
      if (!owned) {
        const error = new Error('permission_resource_not_owned');
        error.code = 'permission_resource_not_owned';
        throw error;
      }
      res.set('Cache-Control', 'no-store');
      return res.json({
        status: 'success',
        challenge: {
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
          maxGrantSeconds: challenge.maxGrantSeconds,
          confirmationFingerprint: challenge.fingerprint
        }
      });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'permission_challenge_failed',
        message: 'Permission challenge could not be created.'
      });
    }
  });

  router.post('/grants', async (req, res) => {
    try {
      if (req.body?.explicitConsent !== true) {
        const error = new Error('permission_explicit_consent_required');
        error.code = 'permission_explicit_consent_required';
        throw error;
      }
      const challenge = buildChallenge(req.body, { ownerId: req.userId });
      const supplied = String(req.body?.confirmationFingerprint || '').trim().toLowerCase();
      if (!supplied || supplied !== challenge.fingerprint) {
        const error = new Error('permission_confirmation_fingerprint_mismatch');
        error.code = 'permission_confirmation_fingerprint_mismatch';
        throw error;
      }
      const owned = await permissions.resourceOwned({
        ownerId: req.userId,
        resourceNamespace: challenge.normalized.resourceNamespace,
        resourceId: challenge.normalized.resourceId
      });
      if (!owned) {
        const error = new Error('permission_resource_not_owned');
        error.code = 'permission_resource_not_owned';
        throw error;
      }
      const grant = await permissions.createGrant({
        ...challenge.normalized,
        confirmationFingerprint: challenge.fingerprint,
        explicitConsent: true
      });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ status: 'success', grant });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'permission_grant_failed',
        message: 'Permission grant could not be created.'
      });
    }
  });

  router.get('/grants', async (req, res) => {
    try {
      const grants = await permissions.listGrants(req.userId, {
        limit: req.query?.limit,
        activeOnly: String(req.query?.active || '').toLowerCase() === 'true'
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', grants });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'permission_grants_read_failed'
      });
    }
  });

  router.post('/grants/:id/revoke', async (req, res) => {
    try {
      const result = await permissions.revokeGrant({
        ownerId: req.userId,
        grantId: req.params.id
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'permission_grant_revoke_failed'
      });
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const events = await permissions.listAudit(req.userId, { limit: req.query?.limit });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', events });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'permission_audit_read_failed'
      });
    }
  });


  router.get('/voice-rights', async (req, res) => {
    if (!voiceRights) return res.status(503).json({ status: 'error', code: 'voice_rights_store_unavailable' });
    try {
      const rights = await voiceRights.list(req.userId, {
        limit: req.query?.limit,
        activeOnly: String(req.query?.active || '').toLowerCase() === 'true'
      });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', rights });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'voice_rights_read_failed'
      });
    }
  });

  router.post('/voice-rights', async (req, res) => {
    if (!voiceRights) return res.status(503).json({ status: 'error', code: 'voice_rights_store_unavailable' });
    try {
      const right = await voiceRights.create({
        ownerId: req.userId,
        sourceAudioAssetId: req.body?.sourceAudioAssetId,
        scope: req.body?.scope,
        rightsBasis: req.body?.rightsBasis,
        evidenceReference: req.body?.evidenceReference,
        explicitConsent: req.body?.explicitConsent === true
      });
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({ status: 'success', right });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'voice_rights_create_failed',
        message: 'Voice-use consent could not be recorded.'
      });
    }
  });

  router.post('/voice-rights/:id/revoke', async (req, res) => {
    if (!voiceRights) return res.status(503).json({ status: 'error', code: 'voice_rights_store_unavailable' });
    try {
      const result = await voiceRights.revoke({ ownerId: req.userId, id: req.params.id });
      res.set('Cache-Control', 'no-store');
      return res.json({ status: 'success', result });
    } catch (error) {
      return res.status(statusFor(error)).json({
        status: 'error',
        code: error.code || 'voice_rights_revoke_failed'
      });
    }
  });

  return router;
}

module.exports = { createPermissionCenterRouter };
