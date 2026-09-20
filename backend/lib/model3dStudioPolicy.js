'use strict';

const config = require('../config/model3d-studio.v1.json');

function studioCapabilities(pack083Availability = {}) {
  const liveExecution = pack083Availability.live === true;
  const blockers = Array.isArray(pack083Availability.blockers)
    ? [...pack083Availability.blockers]
    : [];

  return Object.freeze({
    pack: config.pack,
    version: config.version,
    title: config.title,
    generation: Object.freeze({
      inheritedPack: 83,
      liveExecution,
      externalGate: pack083Availability.externalGate || 'M18',
      provider: pack083Availability.provider || 'fal',
      blockers: Object.freeze(blockers)
    }),
    viewer: Object.freeze({
      ...config.viewer,
      controls: Object.freeze([...config.viewer.controls])
    }),
    operations: Object.freeze(
      Object.fromEntries(
        Object.entries(config.operations).map(([key, value]) => [
          key,
          Object.freeze({...value})
        ])
      )
    ),
    exports: Object.freeze({
      verifiedWhenPresent: Object.freeze({...config.exports.verifiedWhenPresent}),
      blocked: Object.freeze({...config.exports.blocked})
    }),
    truthRules: Object.freeze({...config.truthRules})
  });
}

function exportRoleForFormat(format) {
  const key = String(format || '').trim().toLowerCase();
  return config.exports.verifiedWhenPresent[key] || null;
}

function blockedExportReason(format) {
  const key = String(format || '').trim().toLowerCase();
  return config.exports.blocked[key] || null;
}

module.exports = {
  config,
  studioCapabilities,
  exportRoleForFormat,
  blockedExportReason
};
