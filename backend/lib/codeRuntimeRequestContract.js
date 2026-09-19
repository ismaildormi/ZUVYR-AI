'use strict';

const crypto = require('node:crypto');
const runtimeConfig = require('../config/code-runtime.v1.json');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXECUTABLE_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const BLOCKED_EXECUTABLES = new Set([
  'sh','bash','zsh','fish','dash','ksh',
  'sudo','su','mount','umount','nsenter',
  'docker','podman','containerd','runc',
  'powershell','pwsh','cmd'
]);

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function uuid(value, code) {
  const text = String(value || '').trim().toLowerCase();
  if (!UUID_RE.test(text)) throw contractError(code);
  return text;
}

function operation(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!runtimeConfig.operations.includes(normalized)) {
    throw contractError('pack077_operation_invalid');
  }
  return normalized;
}

function requestId(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 200) {
    throw contractError('pack077_request_id_invalid');
  }
  return text;
}

function normalizeTerminalCommand(value) {
  const command = String(value || '').trim();
  if (
    !command ||
    command.length > runtimeConfig.terminal.maxCommandChars ||
    !EXECUTABLE_RE.test(command) ||
    BLOCKED_EXECUTABLES.has(command.toLowerCase())
  ) {
    throw contractError('pack077_terminal_command_invalid');
  }
  return command;
}

function normalizeTerminalArgs(value) {
  const args = value == null ? [] : value;
  if (
    !Array.isArray(args) ||
    args.length > runtimeConfig.terminal.maxArgs
  ) {
    throw contractError('pack077_terminal_args_invalid');
  }

  let total = 0;
  return Object.freeze(args.map(raw => {
    if (typeof raw !== 'string' || raw.includes('\0')) {
      throw contractError('pack077_terminal_arg_invalid');
    }
    const item = raw;
    if (item.length > runtimeConfig.terminal.maxArgChars) {
      throw contractError('pack077_terminal_arg_too_long');
    }
    total += Buffer.byteLength(item, 'utf8');
    if (total > 16384) {
      throw contractError('pack077_terminal_args_too_large');
    }
    return item;
  }));
}

function normalizeRuntimeRequest(value = {}, {
  idempotencyKey = null
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError('pack077_request_invalid');
  }

  const normalizedOperation = operation(value.operation);
  const output = {
    operation: normalizedOperation,
    projectId: uuid(value.projectId, 'pack077_project_id_invalid'),
    sandboxSessionId: uuid(
      value.sandboxSessionId,
      'pack077_sandbox_session_id_invalid'
    ),
    requestId: requestId(idempotencyKey || value.requestId)
  };

  if (normalizedOperation === 'terminal') {
    output.command = normalizeTerminalCommand(value.command);
    output.args = normalizeTerminalArgs(value.args);
  }

  return Object.freeze(output);
}

function packageFile(project, name) {
  return (Array.isArray(project?.files) ? project.files : [])
    .find(file => file?.path === name) || null;
}

function parsePackageJson(project) {
  const file = packageFile(project, 'package.json');
  if (!file) throw contractError('pack077_package_json_required');

  let value;
  try {
    value = JSON.parse(String(file.content || ''));
  } catch (_) {
    throw contractError('pack077_package_json_invalid');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError('pack077_package_json_invalid');
  }

  const packageManager = String(value.packageManager || '').trim();
  if (
    packageManager &&
    !/^npm(?:@|$)/i.test(packageManager)
  ) {
    throw contractError('pack077_package_manager_unsupported');
  }

  const scripts =
    value.scripts &&
    typeof value.scripts === 'object' &&
    !Array.isArray(value.scripts)
      ? value.scripts
      : {};

  const dependencies = {
    ...(value.dependencies &&
    typeof value.dependencies === 'object' &&
    !Array.isArray(value.dependencies)
      ? value.dependencies
      : {}),
    ...(value.devDependencies &&
    typeof value.devDependencies === 'object' &&
    !Array.isArray(value.devDependencies)
      ? value.devDependencies
      : {})
  };

  return Object.freeze({
    raw: value,
    scripts: Object.freeze({ ...scripts }),
    dependencies: Object.freeze({ ...dependencies }),
    hasLock:
      !!packageFile(project, 'package-lock.json') ||
      !!packageFile(project, 'npm-shrinkwrap.json')
  });
}

function dependencyDigest(project) {
  const names = ['package.json','package-lock.json','npm-shrinkwrap.json'];
  const hash = crypto.createHash('sha256');
  let count = 0;
  for (const name of names) {
    const file = packageFile(project, name);
    if (!file) continue;
    count += 1;
    hash.update(name, 'utf8');
    hash.update(Buffer.from([0]));
    hash.update(String(file.content || ''), 'utf8');
    hash.update(Buffer.from([0]));
  }
  if (!count) throw contractError('pack077_package_json_required');
  return hash.digest('hex');
}

function dependencyCommand(project) {
  const pkg = parsePackageJson(project);
  return Object.freeze({
    command: 'npm',
    args: Object.freeze([
      ...(pkg.hasLock
        ? runtimeConfig.dependencies.argsWithLock
        : runtimeConfig.dependencies.argsWithoutLock)
    ]),
    cwd: runtimeConfig.workspace.cwd,
    env: Object.freeze({}),
    wait: true,
    logs: true,
    sudo: false,
    timeout: runtimeConfig.dependencies.timeoutMs,
    dependencyDigest: dependencyDigest(project)
  });
}

function frameworkPort(pkg) {
  const names = new Set(Object.keys(pkg.dependencies || {}));
  if (names.has('vite')) return 5173;
  if (names.has('astro')) return 4321;
  if (
    names.has('next') ||
    names.has('react-scripts') ||
    names.has('@remix-run/dev')
  ) return 3000;
  return runtimeConfig.run.candidatePorts[0];
}

function inferRunCommand(project) {
  const pkg = parsePackageJson(project);
  const script = runtimeConfig.run.candidateScripts
    .find(name => typeof pkg.scripts[name] === 'string' && pkg.scripts[name].trim());
  if (!script) throw contractError('pack077_run_script_unavailable');

  const previewPort = frameworkPort(pkg);
  return Object.freeze({
    command: 'npm',
    args: Object.freeze(['run', script]),
    cwd: runtimeConfig.workspace.cwd,
    env: Object.freeze({
      ...runtimeConfig.run.environment,
      PORT: String(previewPort)
    }),
    wait: false,
    logs: true,
    sudo: false,
    timeout: runtimeConfig.run.timeoutMs,
    script,
    previewPort
  });
}

function terminalCommand(request) {
  return Object.freeze({
    command: request.command,
    args: request.args,
    cwd: runtimeConfig.workspace.cwd,
    env: Object.freeze({}),
    wait: true,
    logs: true,
    sudo: false,
    timeout: runtimeConfig.terminal.timeoutMs
  });
}

function commandSpecForOperation(request, project) {
  if (request.operation === 'terminal') return terminalCommand(request);
  if (request.operation === 'dependencies') return dependencyCommand(project);
  if (request.operation === 'run') return inferRunCommand(project);
  throw contractError('pack077_operation_invalid');
}

function detectPreviewPort(text, fallback = null) {
  const source = String(text || '').slice(-131072);
  const patterns = [
    /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|[A-Za-z0-9.-]+):(\d{2,5})\b/gi,
    /(?:local|network|listening|ready|server)[^\n\r]{0,100}?(?:port\s*)?(\d{2,5})\b/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const port = Number(match[1]);
      if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
        return port;
      }
    }
  }

  const candidate = Number(fallback);
  if (
    Number.isInteger(candidate) &&
    candidate >= 1024 &&
    candidate <= 65535
  ) {
    return candidate;
  }
  return null;
}

module.exports = {
  normalizeTerminalCommand,
  normalizeTerminalArgs,
  normalizeRuntimeRequest,
  parsePackageJson,
  dependencyDigest,
  dependencyCommand,
  inferRunCommand,
  terminalCommand,
  commandSpecForOperation,
  detectPreviewPort
};
