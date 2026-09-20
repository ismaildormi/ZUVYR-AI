'use strict';

const https = require('node:https');
const { buildSignedSessionRequest } = require('./pairingSession');
const { agentError } = require('./security');

const MAX_RESPONSE_BYTES = 262144;
const REQUEST_TIMEOUT_MS = 10000;

function apiError(code, statusCode = null, detail = null) {
  const error = agentError(code);
  if (statusCode !== null) error.statusCode = statusCode;
  if (detail !== null) error.detail = detail;
  return error;
}

function signedPost(stateDir, route, body = {}, {
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  const proof = buildSignedSessionRequest(stateDir, {
    method: 'POST',
    path: route,
    body
  });
  let url;
  try { url = new URL(route, proof.backendOrigin); }
  catch (_) { return Promise.reject(apiError('pack087_backend_url_invalid')); }
  if (url.protocol !== 'https:' || url.origin !== proof.backendOrigin) {
    return Promise.reject(apiError('pack087_backend_origin_mismatch'));
  }

  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  if (payload.length > 131072) return Promise.reject(apiError('pack087_request_body_too_large'));

  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port || 443,
      method: 'POST',
      path: url.pathname + url.search,
      headers: {
        ...proof.headers,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(payload.length),
        'User-Agent': 'ZUVYR-Device-Agent/0.3'
      },
      timeout: timeoutMs,
      servername: url.hostname
    }, response => {
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          request.destroy(apiError('pack087_response_too_large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => {
        let parsed = {};
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        } catch (_) {
          return reject(apiError('pack087_response_invalid', response.statusCode));
        }
        if (response.statusCode < 200 || response.statusCode >= 300 || parsed.status === 'error') {
          return reject(apiError(
            String(parsed.code || 'pack087_backend_request_failed'),
            response.statusCode,
            parsed
          ));
        }
        resolve(parsed);
      });
    });

    request.once('timeout', () => request.destroy(apiError('pack087_backend_timeout')));
    request.once('error', reject);
    request.end(payload);
  });
}

module.exports = {
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  signedPost
};
