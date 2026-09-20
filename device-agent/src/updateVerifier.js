'use strict';

const crypto = require('node:crypto');
const net = require('node:net');
const config = require('../config.v1.json');
const { agentError } = require('./security');

function validateManifest(manifest, { allowedHosts = config.update.allowedHosts, maxArtifactBytes = config.update.maxArtifactBytes } = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw agentError('device_agent_update_manifest_invalid');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(manifest.version || ''))) {
    throw agentError('device_agent_update_version_invalid');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(manifest.sha256 || ''))) throw agentError('device_agent_update_sha256_invalid');
  const size = Number(manifest.sizeBytes);
  if (!Number.isSafeInteger(size) || size <= 0 || size > Number(maxArtifactBytes)) throw agentError('device_agent_update_size_invalid');

  let url;
  try { url = new URL(String(manifest.url || '')); } catch (cause) {
    throw agentError('device_agent_update_url_invalid', cause);
  }
  if (url.protocol !== 'https:') throw agentError('device_agent_update_https_required');
  if (url.username || url.password) throw agentError('device_agent_update_url_credentials_forbidden');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    net.isIP(hostname)
  ) {
    throw agentError('device_agent_update_host_forbidden');
  }
  const hosts = Array.isArray(allowedHosts) ? allowedHosts.map(v => String(v).toLowerCase()) : [];
  if (!hosts.length || !hosts.includes(hostname)) throw agentError('device_agent_update_host_untrusted');
  return Object.freeze({ ...manifest, url: url.href, sizeBytes: size });
}

function verifySignedManifest({
  manifestBytes,
  signatureBase64,
  publicKeyPem = config.update.releasePublicKeyPem,
  allowedHosts = config.update.allowedHosts,
  maxArtifactBytes = config.update.maxArtifactBytes
} = {}) {
  if (!publicKeyPem) throw agentError('device_agent_update_verification_not_configured');
  const bytes = Buffer.isBuffer(manifestBytes) ? manifestBytes : Buffer.from(manifestBytes || '');
  if (!bytes.length || bytes.length > 64 * 1024) throw agentError('device_agent_update_manifest_size_invalid');

  const encodedSignature = String(signatureBase64 || '').trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encodedSignature) || encodedSignature.length % 4 !== 0) {
    throw agentError('device_agent_update_signature_invalid');
  }
  let signature;
  try { signature = Buffer.from(encodedSignature, 'base64'); } catch (cause) {
    throw agentError('device_agent_update_signature_invalid', cause);
  }
  if (!signature.length || signature.toString('base64') !== encodedSignature) {
    throw agentError('device_agent_update_signature_invalid');
  }

  let valid = false;
  try { valid = crypto.verify(null, bytes, publicKeyPem, signature); } catch (cause) {
    throw agentError('device_agent_update_signature_invalid', cause);
  }
  if (!valid) throw agentError('device_agent_update_signature_invalid');

  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); } catch (cause) {
    throw agentError('device_agent_update_manifest_json_invalid', cause);
  }
  return validateManifest(manifest, { allowedHosts, maxArtifactBytes });
}

function verifyArtifact(manifest, artifactBytes) {
  const bytes = Buffer.isBuffer(artifactBytes) ? artifactBytes : Buffer.from(artifactBytes || '');
  if (bytes.length !== Number(manifest.sizeBytes)) throw agentError('device_agent_update_artifact_size_mismatch');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest.toLowerCase() !== String(manifest.sha256).toLowerCase()) throw agentError('device_agent_update_artifact_hash_mismatch');
  return true;
}

module.exports = { validateManifest, verifySignedManifest, verifyArtifact };
