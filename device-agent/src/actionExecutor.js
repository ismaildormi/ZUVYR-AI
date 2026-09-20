'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { ensurePrivateDir, agentError } = require('./security');

const MAX_READ_BYTES = 65536;
const MAX_WRITE_BYTES = 1048576;
const MAX_STDIO_BYTES = 16384;
const MAX_ARGS = 32;
const MAX_ARG_CHARS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;
const SECRET_KEY = /(password|secret|token|authorization|cookie|credential|private.?key|api.?key)/i;
const SECRET_VALUE = /(?:Bearer\s+[A-Za-z0-9._~+\/-]{12,}|(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,})/gi;
const SENSITIVE_PATH = /(^|[\\/])(\.ssh|\.aws)([\\/]|$)|(^|[\\/])\.env(?:[._-]|$)|credentials?|service[-_]?account|private[-_]?key/i;

function actionError(code, detail) {
  const error = new Error(code);
  error.code = code;
  if (detail !== undefined) error.detail = detail;
  return error;
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function redactString(value, state) {
  return String(value).replace(SECRET_VALUE, () => {
    state.redacted = true;
    return '[REDACTED]';
  });
}

function redact(value, state, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redactString(value, state).slice(0, 8000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redact(item, state, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value).slice(0, 80)) {
      if (SECRET_KEY.test(key)) {
        out[key] = '[REDACTED]';
        state.redacted = true;
      } else {
        out[key] = redact(child, state, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function redactResult(value) {
  const state = { redacted: false };
  return Object.freeze({
    result: redact(value, state),
    secretRedacted: state.redacted
  });
}

function splitList(value, delimiter = path.delimiter) {
  return String(value || '')
    .split(delimiter)
    .map(item => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function isWithin(base, target) {
  const root = path.resolve(base);
  const candidate = path.resolve(target);
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function realRoot(root) {
  const resolved = path.resolve(root);
  let stat;
  try { stat = fs.statSync(resolved); }
  catch (_) { throw actionError('pack087_file_root_missing'); }
  if (!stat.isDirectory()) throw actionError('pack087_file_root_invalid');
  return fs.realpathSync(resolved);
}

function allowedFileRoots(env = process.env) {
  return unique(splitList(env.ZUVYR_AGENT_FILE_ROOTS).map(realRoot));
}

function assertNotSensitive(target) {
  if (SENSITIVE_PATH.test(String(target || ''))) throw actionError('pack087_sensitive_target_blocked');
}

function resolveReadTarget(target, roots) {
  if (!roots.length) throw actionError('pack087_file_roots_unconfigured');
  const resolved = path.resolve(String(target || ''));
  assertNotSensitive(resolved);
  let stat;
  try { stat = fs.lstatSync(resolved); }
  catch (_) { throw actionError('pack087_file_not_found'); }
  if (stat.isSymbolicLink()) throw actionError('pack087_symlink_target_blocked');
  if (!stat.isFile()) throw actionError('pack087_file_target_invalid');
  const real = fs.realpathSync(resolved);
  if (!roots.some(root => isWithin(root, real))) throw actionError('pack087_file_scope_denied');
  return real;
}

function resolveWriteTarget(target, roots) {
  if (!roots.length) throw actionError('pack087_file_roots_unconfigured');
  const resolved = path.resolve(String(target || ''));
  assertNotSensitive(resolved);
  const parent = path.dirname(resolved);
  let realParent;
  try { realParent = fs.realpathSync(parent); }
  catch (_) { throw actionError('pack087_file_parent_missing'); }
  if (!roots.some(root => isWithin(root, realParent))) throw actionError('pack087_file_scope_denied');
  const candidate = path.join(realParent, path.basename(resolved));
  if (fs.existsSync(candidate)) {
    const stat = fs.lstatSync(candidate);
    if (stat.isSymbolicLink()) throw actionError('pack087_symlink_target_blocked');
    if (!stat.isFile()) throw actionError('pack087_file_target_invalid');
  }
  return candidate;
}

function commandExists(command, platform = process.platform) {
  if (!command) return false;
  const lookup = platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(lookup, [command], {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 1500
  });
  return result.status === 0;
}

function powershellCommand(platform = process.platform) {
  if (platform !== 'win32') return null;
  if (commandExists('powershell.exe', platform)) return 'powershell.exe';
  if (commandExists('pwsh.exe', platform)) return 'pwsh.exe';
  return null;
}

function nativeTools({ platform = process.platform } = {}) {
  if (platform === 'darwin') {
    return Object.freeze({
      screen: commandExists('screencapture', platform) ? 'screencapture' : null,
      clipboardRead: commandExists('pbpaste', platform) ? 'pbpaste' : null,
      clipboardWrite: commandExists('pbcopy', platform) ? 'pbcopy' : null,
      pointer: commandExists('cliclick', platform) ? 'cliclick' : null,
      keyboard: commandExists('osascript', platform) ? 'osascript' : null
    });
  }
  if (platform === 'win32') {
    const ps = powershellCommand(platform);
    return Object.freeze({
      screen: ps,
      clipboardRead: ps,
      clipboardWrite: ps,
      pointer: ps,
      keyboard: ps
    });
  }
  const clipboardRead = commandExists('wl-paste', platform)
    ? 'wl-paste'
    : commandExists('xclip', platform) ? 'xclip' : null;
  const clipboardWrite = commandExists('wl-copy', platform)
    ? 'wl-copy'
    : commandExists('xclip', platform) ? 'xclip' : null;
  const screen = commandExists('gnome-screenshot', platform)
    ? 'gnome-screenshot'
    : commandExists('scrot', platform) ? 'scrot' : null;
  const xdotool = commandExists('xdotool', platform) ? 'xdotool' : null;
  return Object.freeze({
    screen,
    clipboardRead,
    clipboardWrite,
    pointer: xdotool,
    keyboard: xdotool
  });
}

function parseJson(value, code) {
  try { return JSON.parse(String(value || '')); }
  catch (_) { throw actionError(code); }
}

function parseArgs(value) {
  const args = parseJson(value || '[]', 'pack087_command_args_invalid');
  if (!Array.isArray(args) || args.length > MAX_ARGS) throw actionError('pack087_command_args_invalid');
  return args.map(arg => {
    if (typeof arg !== 'string' || arg.length > MAX_ARG_CHARS || arg.includes('\0')) {
      throw actionError('pack087_command_arg_invalid');
    }
    return arg;
  });
}

function allowedExecutables(env = process.env) {
  return unique(splitList(env.ZUVYR_AGENT_ALLOWED_EXECUTABLES, ','));
}

function allowedApplications(env = process.env) {
  return unique(splitList(env.ZUVYR_AGENT_ALLOWED_APPLICATIONS, ','));
}

function assertAllowlisted(value, allowed, code) {
  const target = String(value || '').trim();
  if (!target || !allowed.includes(target)) throw actionError(code);
  return target;
}

function collectChild(child, { input = null, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let done = false;
    let timer = null;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(result);
    };
    const kill = code => {
      try { child.kill('SIGTERM'); } catch (_) {}
      setTimeout(() => {
        try { if (!child.killed) child.kill('SIGKILL'); } catch (_) {}
      }, 500).unref?.();
      finish(actionError(code));
    };
    const onAbort = () => kill('pack087_action_stopped');
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => kill('pack087_action_timeout'), timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', chunk => {
      if (stdoutBytes >= MAX_STDIO_BYTES) return;
      const piece = Buffer.from(chunk).subarray(0, MAX_STDIO_BYTES - stdoutBytes);
      stdout.push(piece);
      stdoutBytes += piece.length;
    });
    child.stderr?.on('data', chunk => {
      if (stderrBytes >= MAX_STDIO_BYTES) return;
      const piece = Buffer.from(chunk).subarray(0, MAX_STDIO_BYTES - stderrBytes);
      stderr.push(piece);
      stderrBytes += piece.length;
    });
    child.once('error', error => finish(error));
    child.once('exit', (code, sig) => finish(null, {
      code: Number.isInteger(code) ? code : null,
      signal: sig || null,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      stdoutTruncated: stdoutBytes >= MAX_STDIO_BYTES,
      stderrTruncated: stderrBytes >= MAX_STDIO_BYTES
    }));
    if (child.stdin) {
      if (input !== null && input !== undefined) child.stdin.write(String(input));
      child.stdin.end();
    }
  });
}

async function spawnCaptured(command, args, options = {}) {
  if (!command || !Array.isArray(args)) throw actionError('pack087_spawn_invalid');
  const child = spawn(command, args, {
    cwd: options.cwd || undefined,
    env: options.env || process.env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return collectChild(child, options);
}

function backupsDir(stateDir) {
  const dir = path.join(stateDir, 'backups');
  ensurePrivateDir(dir);
  return dir;
}

function createFileBackup(stateDir, target) {
  const id = crypto.randomUUID();
  const ref = 'backup:' + id;
  const dir = backupsDir(stateDir);
  const metadataPath = path.join(dir, id + '.json');
  const dataPath = path.join(dir, id + '.bin');
  const existed = fs.existsSync(target);
  let bytes = Buffer.alloc(0);
  let mode = null;
  if (existed) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw actionError('pack087_file_target_invalid');
    bytes = fs.readFileSync(target);
    mode = stat.mode & 0o777;
    fs.writeFileSync(dataPath, bytes, { mode: 0o600 });
  }
  const metadata = {
    version: 'pack087.file-backup.v1',
    ref,
    target,
    existed,
    mode,
    sha256: sha256(bytes),
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(metadataPath, 0o600); } catch (_) {}
  return Object.freeze({ ref, sha256: metadata.sha256 });
}

function restoreFileBackup(stateDir, ref, expectedTarget, roots) {
  const match = /^backup:([0-9a-f-]{36})$/i.exec(String(ref || '').trim());
  if (!match) throw actionError('pack087_backup_ref_invalid');
  const dir = backupsDir(stateDir);
  const metadataPath = path.join(dir, match[1].toLowerCase() + '.json');
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')); }
  catch (_) { throw actionError('pack087_backup_not_found'); }
  if (metadata.version !== 'pack087.file-backup.v1' || metadata.ref !== 'backup:' + match[1].toLowerCase()) {
    throw actionError('pack087_backup_invalid');
  }
  const target = resolveWriteTarget(expectedTarget, roots);
  if (path.resolve(metadata.target) !== path.resolve(target)) throw actionError('pack087_backup_target_mismatch');
  if (metadata.existed) {
    const dataPath = path.join(dir, match[1].toLowerCase() + '.bin');
    const bytes = fs.readFileSync(dataPath);
    if (sha256(bytes) !== metadata.sha256) throw actionError('pack087_backup_hash_mismatch');
    const temp = target + '.zuvyr-undo-' + crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(temp, bytes, { mode: metadata.mode || 0o600 });
    fs.renameSync(temp, target);
    if (metadata.mode !== null) {
      try { fs.chmodSync(target, metadata.mode); } catch (_) {}
    }
  } else {
    fs.rmSync(target, { force: true });
  }
  return Object.freeze({
    restored: true,
    target,
    previousExisted: metadata.existed,
    sha256: metadata.sha256
  });
}

function captureDir(stateDir) {
  const dir = path.join(stateDir, 'captures');
  ensurePrivateDir(dir);
  return dir;
}

async function executeScreen(stateDir, tools, options) {
  const id = crypto.randomUUID();
  const target = path.join(captureDir(stateDir), id + '.png');
  let result;
  if (process.platform === 'darwin' && tools.screen) {
    result = await spawnCaptured(tools.screen, ['-x', target], options);
  } else if (process.platform === 'win32' && tools.screen) {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      'Add-Type -AssemblyName System.Drawing;',
      '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
      '$i=New-Object System.Drawing.Bitmap($b.Width,$b.Height);',
      '$g=[System.Drawing.Graphics]::FromImage($i);',
      '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size);',
      '$i.Save($args[0],[System.Drawing.Imaging.ImageFormat]::Png);',
      '$g.Dispose();$i.Dispose();'
    ].join('');
    result = await spawnCaptured(tools.screen, ['-NoProfile','-NonInteractive','-Command',script,target], options);
  } else if (tools.screen === 'gnome-screenshot') {
    result = await spawnCaptured(tools.screen, ['-f', target], options);
  } else if (tools.screen === 'scrot') {
    result = await spawnCaptured(tools.screen, [target], options);
  } else {
    throw actionError('pack087_screen_capture_unsupported');
  }
  if (result.code !== 0 || !fs.existsSync(target)) throw actionError('pack087_screen_capture_failed');
  const bytes = fs.readFileSync(target);
  return {
    artifactRef: 'capture:' + id,
    mimeType: 'image/png',
    sizeBytes: bytes.length,
    sha256: sha256(bytes)
  };
}

async function executeClipboardRead(tools, options) {
  if (!tools.clipboardRead) throw actionError('pack087_clipboard_read_unsupported');
  let result;
  if (process.platform === 'win32') {
    result = await spawnCaptured(tools.clipboardRead, [
      '-NoProfile','-NonInteractive','-Command','Get-Clipboard -Raw'
    ], options);
  } else if (tools.clipboardRead === 'xclip') {
    result = await spawnCaptured('xclip', ['-selection','clipboard','-o'], options);
  } else {
    result = await spawnCaptured(tools.clipboardRead, [], options);
  }
  if (result.code !== 0) throw actionError('pack087_clipboard_read_failed');
  return { text: result.stdout };
}

async function executeClipboardWrite(text, tools, options) {
  if (!tools.clipboardWrite) throw actionError('pack087_clipboard_write_unsupported');
  let result;
  if (process.platform === 'win32') {
    result = await spawnCaptured(tools.clipboardWrite, [
      '-NoProfile','-NonInteractive','-Command','[Console]::In.ReadToEnd() | Set-Clipboard'
    ], { ...options, input: text });
  } else if (tools.clipboardWrite === 'xclip') {
    result = await spawnCaptured('xclip', ['-selection','clipboard','-i'], { ...options, input: text });
  } else {
    result = await spawnCaptured(tools.clipboardWrite, [], { ...options, input: text });
  }
  if (result.code !== 0) throw actionError('pack087_clipboard_write_failed');
  return { written: true, chars: String(text).length };
}

async function executePointer(type, target, tools, options) {
  if (!tools.pointer) throw actionError('pack087_pointer_control_unsupported');
  const value = target ? parseJson(target, 'pack087_pointer_target_invalid') : {};
  if (type === 'move_pointer') {
    const x = Number(value.x), y = Number(value.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 20000 || y > 20000) {
      throw actionError('pack087_pointer_target_invalid');
    }
    if (process.platform === 'win32') {
      const script = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class C{[DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y);}' ;[C]::SetCursorPos([int]$args[0],[int]$args[1]) | Out-Null`;
      const result = await spawnCaptured(tools.pointer, ['-NoProfile','-NonInteractive','-Command',script,String(x),String(y)], options);
      if (result.code !== 0) throw actionError('pack087_pointer_move_failed');
    } else if (process.platform === 'darwin') {
      const result = await spawnCaptured(tools.pointer, ['m:' + x + ',' + y], options);
      if (result.code !== 0) throw actionError('pack087_pointer_move_failed');
    } else {
      const result = await spawnCaptured(tools.pointer, ['mousemove',String(x),String(y)], options);
      if (result.code !== 0) throw actionError('pack087_pointer_move_failed');
    }
    return { moved: true, x, y };
  }

  const button = Number(value.button ?? 1);
  if (![1,2,3].includes(button)) throw actionError('pack087_pointer_button_invalid');
  if (process.platform === 'win32') {
    const flags = button === 1 ? [2,4] : button === 2 ? [32,64] : [8,16];
    const script = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class C{[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,uint e);}' ;[C]::mouse_event([uint32]$args[0],0,0,0,0);[C]::mouse_event([uint32]$args[1],0,0,0,0)`;
    const result = await spawnCaptured(tools.pointer, ['-NoProfile','-NonInteractive','-Command',script,String(flags[0]),String(flags[1])], options);
    if (result.code !== 0) throw actionError('pack087_pointer_click_failed');
  } else if (process.platform === 'darwin') {
    const result = await spawnCaptured(tools.pointer, ['c:.'], options);
    if (result.code !== 0) throw actionError('pack087_pointer_click_failed');
  } else {
    const result = await spawnCaptured(tools.pointer, ['click',String(button)], options);
    if (result.code !== 0) throw actionError('pack087_pointer_click_failed');
  }
  return { clicked: true, button };
}

async function executeKeyboard(text, tools, options) {
  if (!tools.keyboard) throw actionError('pack087_keyboard_unsupported');
  if (typeof text !== 'string' || text.length > 4000 || text.includes('\0')) throw actionError('pack087_keyboard_input_invalid');
  let result;
  if (process.platform === 'win32') {
    const script = 'Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait($args[0])';
    result = await spawnCaptured(tools.keyboard, ['-NoProfile','-NonInteractive','-Command',script,text], options);
  } else if (process.platform === 'darwin') {
    const script = 'on run argv\n tell application "System Events" to keystroke (item 1 of argv)\nend run';
    result = await spawnCaptured(tools.keyboard, ['-e',script,text], options);
  } else {
    result = await spawnCaptured(tools.keyboard, ['type','--clearmodifiers','--delay','1','--',text], options);
  }
  if (result.code !== 0) throw actionError('pack087_keyboard_failed');
  return { typed: true, chars: text.length };
}

async function executeApplication(name, env, options) {
  const app = assertAllowlisted(name, allowedApplications(env), 'pack087_application_not_allowlisted');
  let result;
  if (process.platform === 'darwin') {
    result = await spawnCaptured('/usr/bin/open', ['-a',app], options);
  } else if (process.platform === 'win32') {
    const ps = powershellCommand();
    if (!ps) throw actionError('pack087_application_open_unsupported');
    result = await spawnCaptured(ps, ['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $args[0]',app], options);
  } else {
    result = await spawnCaptured(app, [], options);
  }
  if (result.code !== 0) throw actionError('pack087_application_open_failed');
  return { opened: true, application: app };
}

async function executeCommand(executable, input, env, options) {
  const command = assertAllowlisted(
    executable,
    allowedExecutables(env),
    'pack087_shell_executable_not_allowlisted'
  );
  const args = parseArgs(input);
  const result = await spawnCaptured(command, args, options);
  return {
    exitCode: result.code,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated
  };
}

function detectActionCapabilities({
  env = process.env,
  platform = process.platform
} = {}) {
  const tools = nativeTools({ platform });
  const roots = (() => {
    try { return allowedFileRoots(env); } catch (_) { return []; }
  })();
  return Object.freeze({
    observe_screen: Boolean(tools.screen),
    move_pointer: Boolean(tools.pointer),
    click: Boolean(tools.pointer),
    type_text: Boolean(tools.keyboard),
    open_application: allowedApplications(env).length > 0,
    read_clipboard: Boolean(tools.clipboardRead),
    write_clipboard: Boolean(tools.clipboardWrite),
    read_file: roots.length > 0,
    write_file: roots.length > 0,
    run_command: allowedExecutables(env).length > 0
  });
}

async function executeAction(action, {
  stateDir,
  env = process.env,
  signal = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!action || typeof action !== 'object') throw actionError('pack087_action_required');
  if (!stateDir) throw actionError('pack087_state_dir_required');
  ensurePrivateDir(stateDir);
  const roots = allowedFileRoots(env);
  const tools = nativeTools();
  const options = { env, signal, timeoutMs };
  let backup = null;
  let raw;

  try {
    switch (action.type) {
      case 'observe_screen':
        raw = await executeScreen(stateDir, tools, options);
        break;
      case 'move_pointer':
      case 'click':
        raw = await executePointer(action.type, action.target, tools, options);
        break;
      case 'type_text':
        raw = await executeKeyboard(String(action.input || ''), tools, options);
        break;
      case 'open_application':
        raw = await executeApplication(action.target, env, options);
        break;
      case 'read_clipboard':
        raw = await executeClipboardRead(tools, options);
        break;
      case 'write_clipboard':
        raw = await executeClipboardWrite(String(action.input || ''), tools, options);
        break;
      case 'read_file': {
        const target = resolveReadTarget(action.target, roots);
        const stat = fs.statSync(target);
        if (stat.size > MAX_READ_BYTES) throw actionError('pack087_file_read_too_large');
        const bytes = fs.readFileSync(target);
        if (bytes.includes(0)) throw actionError('pack087_binary_file_read_blocked');
        raw = {
          target,
          sizeBytes: bytes.length,
          sha256: sha256(bytes),
          text: bytes.toString('utf8')
        };
        break;
      }
      case 'write_file': {
        const target = resolveWriteTarget(action.target, roots);
        const bytes = Buffer.from(String(action.input || ''), 'utf8');
        if (bytes.length > MAX_WRITE_BYTES) throw actionError('pack087_file_write_too_large');
        backup = createFileBackup(stateDir, target);
        const temp = target + '.zuvyr-write-' + crypto.randomBytes(6).toString('hex');
        fs.writeFileSync(temp, bytes, { mode: 0o600 });
        fs.renameSync(temp, target);
        raw = {
          target,
          sizeBytes: bytes.length,
          sha256: sha256(bytes),
          written: true
        };
        break;
      }
      case 'run_command':
        raw = await executeCommand(action.target, action.input, env, options);
        break;
      default:
        throw actionError('pack087_action_type_unsupported');
    }

    const redacted = redactResult(raw);
    return Object.freeze({
      success: action.type === 'run_command' ? raw.exitCode === 0 : true,
      result: redacted.result,
      errorCode: action.type === 'run_command' && raw.exitCode !== 0 ? 'pack087_command_nonzero_exit' : null,
      deviceActionExecuted: true,
      backupRef: backup?.ref || null,
      backupSha256: backup?.sha256 || null,
      secretRedacted: redacted.secretRedacted
    });
  } catch (error) {
    const redacted = redactResult({
      message: error && error.message ? error.message : 'Device action failed.',
      detail: error && error.detail !== undefined ? error.detail : null
    });
    return Object.freeze({
      success: false,
      result: redacted.result,
      errorCode: String(error && (error.code || error.message) || 'pack087_device_action_failed').slice(0, 160),
      deviceActionExecuted: false,
      backupRef: backup?.ref || null,
      backupSha256: backup?.sha256 || null,
      secretRedacted: redacted.secretRedacted
    });
  }
}

async function executeUndo(undo, {
  stateDir,
  env = process.env
} = {}) {
  try {
    const roots = allowedFileRoots(env);
    const raw = restoreFileBackup(stateDir, undo.backupRef, undo.target, roots);
    const redacted = redactResult(raw);
    return Object.freeze({
      success: true,
      result: redacted.result,
      errorCode: null,
      deviceActionExecuted: true,
      secretRedacted: redacted.secretRedacted
    });
  } catch (error) {
    const redacted = redactResult({ message: error && error.message ? error.message : 'Undo failed.' });
    return Object.freeze({
      success: false,
      result: redacted.result,
      errorCode: String(error && (error.code || error.message) || 'pack087_undo_failed').slice(0, 160),
      deviceActionExecuted: false,
      secretRedacted: redacted.secretRedacted
    });
  }
}

module.exports = {
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  MAX_STDIO_BYTES,
  actionError,
  redactResult,
  allowedFileRoots,
  allowedExecutables,
  allowedApplications,
  detectActionCapabilities,
  createFileBackup,
  restoreFileBackup,
  executeAction,
  executeUndo
};
