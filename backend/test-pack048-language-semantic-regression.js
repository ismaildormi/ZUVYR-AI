'use strict';

const assert = require('assert');
const { detectLanguage, buildLanguageContextPrompt } = require('./lib/languageEngine');
const { buildTextPreferencePrompt } = require('./lib/aiPreferences');

const cases = [
  {
    text: 'واش نقدر نخلي هاد الزر فليسار ولكن الجواب يكون طبيعي؟',
    expected: 'ary'
  },
  {
    text: 'Je veux garder le contexte du projet et répondre en français.',
    expected: 'fr'
  },
  {
    text: 'Please keep the project context and answer in English.',
    expected: 'en'
  },
  {
    text: 'دابا deploy this change mais بلا ما تبدل anything else',
    mixed: true
  }
];

for (const item of cases) {
  const context = detectLanguage(item.text);
  if (item.expected) assert.equal(context.language, item.expected);
  if (item.mixed) assert.equal(context.mixed, true);

  const autoPrompt = buildTextPreferencePrompt({
    language: 'auto',
    length: 'balanced',
    tone: 'natural',
    languageContext: context
  });
  assert(autoPrompt.includes('[ZUVYR Language Engine v1]'));

  const explicitFrench = buildTextPreferencePrompt({
    language: 'fr',
    length: 'balanced',
    tone: 'natural',
    languageContext: context
  });
  assert(explicitFrench.includes('Response language is explicitly locked to fr'));
}

const mixedContext=detectLanguage('واش نقدر keep this exact behavior sans traduction؟');
assert.match(buildLanguageContextPrompt(mixedContext,'auto'),/code-switching/);

console.log('PASS: Arabic/Darija/French/English mixed semantic language regressions');
console.log('PASS: explicit response language wins over automatic detection');
