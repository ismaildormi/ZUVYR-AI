'use strict';

const crypto = require('crypto');
const CONFIG = require('../config/requirement-extraction.v1.json');
const { assertUniversalRequest } = require('./universalRequest');

const CATEGORY_BY_SOURCE_PATH = new Map(
  Object.entries(CONFIG.explicitSourcePaths).flatMap(([category, paths]) =>
    paths.map(path => [path, category])
  )
);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function deepFreeze(value) {
  if (Array.isArray(value)) {
    value.forEach(deepFreeze);
    return Object.freeze(value);
  }
  if (isObject(value)) {
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }
  return value;
}

function getPath(source, path) {
  return path.split('.').reduce((current, key) => {
    if (current == null) return undefined;
    return current[key];
  }, source);
}

function stableValue(value) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requirementId(category, sourcePath, index, value) {
  const digest = crypto
    .createHash('sha256')
    .update(`${category}\n${sourcePath}\n${index}\n${stableValue(value)}`, 'utf8')
    .digest('hex')
    .slice(0, 20);
  return `req_${digest}`;
}

function normalizeItems(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .map(item => clone(item))
      .filter(item => {
        if (typeof item === 'string') return item.trim().length > 0;
        return item != null;
      });
  }

  if (isObject(value)) {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => ({ key, value: clone(item) }));
  }

  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }

  return [clone(value)];
}

function pushItems(target, category, sourcePath, rawValue) {
  const items = normalizeItems(rawValue);
  items.forEach((value, index) => {
    target[category].push({
      id: requirementId(category, sourcePath, index, value),
      category,
      sourcePath,
      value
    });
  });
}

function ignoreStructuredValue(rule, value) {
  if (!rule || !Array.isArray(rule.ignoreValues)) return false;
  return rule.ignoreValues.some(ignore => {
    if (ignore === null) return value == null;
    if (typeof value === 'string' && typeof ignore === 'string') {
      return value.trim().toLowerCase() === ignore.toLowerCase();
    }
    return Object.is(value, ignore);
  });
}

function topLevelConstraintKeysConsumed() {
  const consumed = new Set();
  for (const path of CATEGORY_BY_SOURCE_PATH.keys()) {
    const [root, key] = path.split('.');
    if (root === 'constraints' && key) consumed.add(key);
  }
  consumed.add('clarification');
  return consumed;
}

function explicitClarificationRequired(request) {
  return getPath(request, CONFIG.clarificationThreshold.explicitForcePath) === true;
}

function unknownIsBlocking(entry) {
  const value = entry && entry.value;
  if (!isObject(value)) return false;

  if (value.blocking === true || value.required === true) return true;
  if (typeof value.severity === 'string') {
    return ['blocking', 'critical', 'required'].includes(value.severity.trim().toLowerCase());
  }
  if (isObject(value.value)) {
    return unknownIsBlocking({ value: value.value });
  }
  return false;
}

function extractRequirements(universalRequest) {
  const request = assertUniversalRequest(universalRequest);

  const result = {
    version: CONFIG.version,
    requestId: request.requestId,
    surface: request.surface,
    hardRequirements: [],
    softPreferences: [],
    unknowns: [],
    outputCriteria: [],
    unclassifiedConstraints: [],
    clarification: null
  };

  for (const [sourcePath, category] of CATEGORY_BY_SOURCE_PATH.entries()) {
    pushItems(result, category, sourcePath, getPath(request, sourcePath));
  }

  for (const [sourcePath, rule] of Object.entries(CONFIG.structuredFieldRules)) {
    const value = getPath(request, sourcePath);
    if (value === undefined || ignoreStructuredValue(rule, value)) continue;
    pushItems(result, rule.category, sourcePath, value);
  }

  const consumed = topLevelConstraintKeysConsumed();
  for (const [key, value] of Object.entries(request.constraints || {})) {
    if (consumed.has(key)) continue;
    pushItems(result, 'unclassifiedConstraints', `constraints.${key}`, value);
  }

  const blockingUnknowns = result.unknowns.filter(unknownIsBlocking).length;
  const explicitForce = explicitClarificationRequired(request);
  const required =
    explicitForce ||
    blockingUnknowns >= Number(CONFIG.clarificationThreshold.blockingUnknownCount) ||
    result.unknowns.length >= Number(CONFIG.clarificationThreshold.unknownCount);

  let reason = 'BELOW_THRESHOLD';
  if (explicitForce) reason = 'EXPLICIT_REQUIRED';
  else if (blockingUnknowns >= Number(CONFIG.clarificationThreshold.blockingUnknownCount)) {
    reason = 'BLOCKING_UNKNOWN';
  } else if (result.unknowns.length >= Number(CONFIG.clarificationThreshold.unknownCount)) {
    reason = 'UNKNOWN_COUNT_THRESHOLD';
  }

  result.clarification = {
    required,
    reason,
    blockingUnknownCount: blockingUnknowns,
    unknownCount: result.unknowns.length,
    thresholds: {
      blockingUnknownCount: Number(CONFIG.clarificationThreshold.blockingUnknownCount),
      unknownCount: Number(CONFIG.clarificationThreshold.unknownCount)
    }
  };

  return deepFreeze(result);
}

module.exports = {
  CONFIG,
  extractRequirements
};
