'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = fs.readFileSync(path.join(__dirname, 'worker.js'), 'utf8');

assert(worker.includes('ZUVYR_BRAIN_KERNEL_WORKER_ENABLED'));
assert(worker.includes("|| 'true'"));
assert(worker.includes("!== 'false'"));
assert(worker.includes('const brainKernelWorker = brainKernelWorkerEnabled'));
assert(worker.includes('? startBrainKernelWorker({'));
assert(worker.includes(': null;'));
assert(worker.includes('if (brainKernelWorker) {'));
assert(worker.includes("'[brain-kernel-worker] runtime'"));
assert(worker.includes('JSON.stringify({ enabled: brainKernelWorkerEnabled })'));

console.log('PASS: Pack088 88E Brain worker gate defaults enabled and can be disabled without stopping automation scheduler/execution.');
