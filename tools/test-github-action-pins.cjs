'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowsDir = path.resolve(__dirname, '..', '.github', 'workflows');
const workflowFiles = fs.readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

let externalActionUses = 0;

for (const file of workflowFiles) {
  const fullPath = path.join(workflowsDir, file);
  const source = fs.readFileSync(fullPath, 'utf8');
  const usesPattern = /^\s*-?\s*uses:\s*['"]?([^\s'"#]+)['"]?/gm;
  let match;

  while ((match = usesPattern.exec(source)) !== null) {
    const target = match[1];
    if (target.startsWith('./') || target.startsWith('docker://')) continue;

    externalActionUses += 1;
    const at = target.lastIndexOf('@');
    assert.ok(at > 0, `${file}: external action must include an immutable ref: ${target}`);

    const ref = target.slice(at + 1);
    assert.ok(
      /^[0-9a-f]{40}$/i.test(ref),
      `${file}: external action must be pinned to a 40-character commit SHA: ${target}`
    );
  }
}

assert.ok(externalActionUses > 0, 'expected at least one external GitHub Action use');
console.log(`PASS: ${externalActionUses} external GitHub Action uses are commit-SHA pinned across ${workflowFiles.length} workflows.`);
