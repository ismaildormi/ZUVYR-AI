'use strict';

const { parsePackageJson } = require('./codeRuntimeRequestContract');

function repairPolicyError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function assertRepairableJob(job) {
  if (!job || typeof job !== 'object') {
    throw repairPolicyError('pack078_repair_source_job_invalid');
  }
  if (job.status !== 'failed') {
    throw repairPolicyError('pack078_repair_requires_failed_job');
  }
  if (!['build','test','run'].includes(job.operation)) {
    throw repairPolicyError('pack078_repair_operation_unsupported');
  }
  const diagnostic = job.result?.diagnostic;
  if (
    !diagnostic ||
    typeof diagnostic !== 'object' ||
    !/^[0-9a-f]{64}$/.test(String(diagnostic.fingerprint || ''))
  ) {
    throw repairPolicyError('pack078_repair_diagnostic_required');
  }
  return diagnostic;
}

function repairTargets(project, diagnostic) {
  const files = Array.isArray(project?.files) ? project.files : [];
  const paths = new Set(files.map(file => String(file.path || '')));

  const candidates = [
    diagnostic?.file,
    project?.editorState?.activeFile,
    project?.entryFile,
    files[0]?.path
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  const target = candidates.find(path => paths.has(path));
  if (!target) throw repairPolicyError('pack078_repair_target_unavailable');
  return Object.freeze([target]);
}

function repairInstruction(diagnostic, attemptNo) {
  const n = Number(attemptNo);
  if (!Number.isInteger(n) || n < 1 || n > 2) {
    throw repairPolicyError('pack078_repair_attempt_invalid');
  }
  const parts = [
    'Fix the verified Code Studio failure with the smallest correct edit.',
    'Do not add, delete, or rename files.',
    'Do not change unrelated behavior.',
    'Repair attempt ' + n + ' of 2.',
    'Failure kind: ' + String(diagnostic?.kind || 'runtime_error') + '.',
    'Message: ' + String(diagnostic?.message || 'Runtime command failed.').slice(0, 1800)
  ];
  if (diagnostic?.file) {
    parts.push(
      'Affected location: ' +
      diagnostic.file +
      (diagnostic.line ? ':' + diagnostic.line : '') +
      (diagnostic.column ? ':' + diagnostic.column : '') +
      '.'
    );
  }
  return parts.join(' ');
}

function retestOperation(project, sourceOperation) {
  if (sourceOperation === 'test') return 'test';
  if (sourceOperation === 'build') return 'build';

  try {
    const pkg = parsePackageJson(project);
    if (typeof pkg.scripts.build === 'string' && pkg.scripts.build.trim()) {
      return 'build';
    }
    if (typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim()) {
      return 'test';
    }
  } catch (_) {}

  return 'run';
}

function repairStatusFromJob(job) {
  if (!job || typeof job !== 'object') {
    throw repairPolicyError('pack078_retest_job_invalid');
  }
  if (job.status === 'succeeded') return 'succeeded';
  if (job.status === 'failed') return 'failed';
  if (job.status === 'cancelled') return 'failed';
  return 'retesting';
}

module.exports = {
  assertRepairableJob,
  repairTargets,
  repairInstruction,
  retestOperation,
  repairStatusFromJob
};
