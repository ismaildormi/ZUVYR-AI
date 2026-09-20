'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const config = require('../config.v1.json');
const {
  ensurePrivateDir,
  ensureIdentity,
  publicIdentity,
  ensureAuthToken,
  secureTokenEqual
} = require('./security');
const { sessionPath } = require('./pairingSession');

function isLoopbackAddress(value) {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function hostAllowed(value, port) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw.includes('/') || raw.includes('@')) return false;
  const expected = new Set([
    '127.0.0.1',
    'localhost',
    '127.0.0.1:' + port,
    'localhost:' + port
  ]);
  return expected.has(raw);
}

function bearerToken(req) {
  const value = String(req.headers.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function capabilities(paired = false) {
  return Object.freeze({
    version: config.version,
    protocolVersion: config.protocolVersion,
    paired: paired === true,
    pairingEnabled: true,
    executionEnabled: false,
    actions: Object.freeze({
      screenCapture: false,
      pointerControl: false,
      keyboardControl: false,
      applicationControl: false,
      filesystemControl: false,
      shellControl: false
    }),
    nextAuthority: Object.freeze({
      pairing: 'PACK086',
      actions: 'PACK087'
    })
  });
}

function createAgentServer({ stateDir, onShutdown } = {}) {
  ensurePrivateDir(stateDir);
  const identity = ensureIdentity(stateDir);
  const expectedToken = ensureAuthToken(stateDir);
  const paired = fs.existsSync(sessionPath(stateDir));
  let server;

  server = http.createServer({
    requestTimeout: config.bind.requestTimeoutMs,
    headersTimeout: config.bind.requestTimeoutMs,
    maxHeaderSize: 8192
  }, (req, res) => {
    const remote = req.socket && req.socket.remoteAddress;
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : config.bind.port;

    if (!isLoopbackAddress(remote)) return sendJson(res, 403, { status: 'error', code: 'device_agent_loopback_required' });
    if (!hostAllowed(req.headers.host, port)) return sendJson(res, 421, { status: 'error', code: 'device_agent_host_rejected' });
    if (req.headers.origin) return sendJson(res, 403, { status: 'error', code: 'device_agent_browser_origin_rejected' });

    const declared = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declared) && declared > config.bind.requestBodyMaxBytes) {
      return sendJson(res, 413, { status: 'error', code: 'device_agent_request_too_large' });
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      return sendJson(res, 200, {
        status: 'ok',
        version: config.version,
        protocolVersion: config.protocolVersion,
        paired,
        pairingEnabled: true,
        executionEnabled: false
      });
    }

    if (!secureTokenEqual(bearerToken(req), expectedToken)) {
      return sendJson(res, 401, { status: 'error', code: 'device_agent_auth_required' });
    }

    if (req.method === 'GET' && req.url === '/v1/identity') {
      return sendJson(res, 200, { status: 'success', identity: publicIdentity(identity) });
    }
    if (req.method === 'GET' && req.url === '/v1/capabilities') {
      return sendJson(res, 200, { status: 'success', capabilities: capabilities(paired) });
    }
    if (req.method === 'POST' && req.url === '/v1/shutdown') {
      sendJson(res, 202, { status: 'accepted', executionEnabled: false });
      setImmediate(() => {
        try { if (typeof onShutdown === 'function') onShutdown(); } finally { server.close(); }
      });
      return;
    }

    return sendJson(res, 404, {
      status: 'error',
      code: 'device_agent_route_not_found',
      executionEnabled: false
    });
  });

  return { server, identity: publicIdentity(identity), token: expectedToken };
}

async function startSecureAgent({ stateDir, port = config.bind.port, onShutdown } = {}) {
  const target = path.resolve(String(stateDir || ''));
  const instance = createAgentServer({ stateDir: target, onShutdown });
  await new Promise((resolve, reject) => {
    instance.server.once('error', reject);
    instance.server.listen({ host: config.bind.host, port, exclusive: true }, () => {
      instance.server.removeListener('error', reject);
      resolve();
    });
  });
  const address = instance.server.address();
  if (!address || typeof address !== 'object' || address.address !== config.bind.host) {
    instance.server.close();
    throw new Error('device_agent_bind_invariant_failed');
  }
  const runtime = {
    pid: process.pid,
    host: config.bind.host,
    port: address.port,
    startedAt: new Date().toISOString(),
    executionEnabled: false,
    paired
  };
  fs.writeFileSync(path.join(target, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  const runtimePath = path.join(target, 'runtime.json');
  let cleaned = false;
  const cleanupRuntime = () => {
    if (cleaned) return;
    cleaned = true;
    try { fs.rmSync(runtimePath, { force: true }); } catch (_) {}
  };
  instance.server.once('close', cleanupRuntime);
  return Object.freeze({
    server: instance.server,
    address: Object.freeze({ host: address.address, port: address.port }),
    identity: instance.identity,
    runtime,
    close: () => new Promise((resolve, reject) => {
      instance.server.close(error => {
        cleanupRuntime();
        if (error) reject(error);
        else resolve();
      });
    })
  });
}

module.exports = { isLoopbackAddress, hostAllowed, capabilities, createAgentServer, startSecureAgent };
