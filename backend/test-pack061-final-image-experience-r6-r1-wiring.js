"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'index.html'),
  'utf8'
).replaceAll('\r\n','\n');

const count = text =>
  html.split(text).length - 1;

assert.strictEqual(
  count("actions.classList.add('is-media-actions');"),
  2
);

assert.strictEqual(
  count("downloadButton.classList.remove('rox-gpt-hidden-action');"),
  2
);

assert.strictEqual(
  count("downloadButton.classList.add('rox-media-primary-action');"),
  2
);

assert.strictEqual(
  count("'<span class=\"rox-media-action-label\"></span>'"),
  2
);

assert.strictEqual(
  count("copyButton.classList.add('rox-gpt-hidden-action');"),
  2
);

assert.strictEqual(
  count("shareButton.classList.add('rox-gpt-hidden-action');"),
  2
);

assert.strictEqual(
  count("sendMessage(retryFeature);"),
  2
);

assert.strictEqual(
  count(
    "'images',\n" +
    "        'videos',"
  ),
  2
);

assert.strictEqual(
  count("mediaNode.requestFullscreen()"),
  2
);

assert.strictEqual(
  count("mediaNode.dataset.zuvyrMediaOpenBound"),
  4
);

assert.strictEqual(
  count("labels.copyPrompt"),
  2
);

assert.strictEqual(
  count("labels.openMedia"),
  6
);

assert.strictEqual(
  count(
    "menu.append(\n" +
    "        time,\n" +
    "        copyPromptButton,\n" +
    "        openMediaButton"
  ),
  2
);

assert.strictEqual(
  count(".msg-actions.rox-gpt-actions .rox-media-primary-action{"),
  4
);

assert.strictEqual(
  count(".rox-media-action-label{"),
  4
);


assert.strictEqual(
  count("rgba(255,90,31,.26)"),
  2
);

assert.strictEqual(
  count("rgba(255,112,64,.48)"),
  2
);

assert.strictEqual(
  count("rgba(255,90,31,.82)"),
  2
);

assert.strictEqual(
  count(
    "canonicalContentId&&canonicalAssetId\n" +
    "        ? 'artifact.download'\n" +
    "        : 'feedback.download'"
  ),
  2
);

assert.strictEqual(
  count(
    "buildHistorySection('Recents',recentItems)+\n" +
    "        buildHistorySection('Pinned',pinnedItems)"
  ),
  2
);

assert.strictEqual(
  count('/* ZUVYR PACK061 FIX5 IMAGE HISTORY RELOAD */'),
  2
);

console.log(
  'PASS: Pack061 R6 R1 source-grounded final image experience wiring'
);
