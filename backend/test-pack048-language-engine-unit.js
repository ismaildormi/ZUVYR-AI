'use strict';

const assert = require('assert');
const {
  detectLanguage,
  resolveResponseLanguage,
  buildLanguageContextPrompt,
  ocrLanguagesForContext,
  embeddingLanguageHints
} = require('./lib/languageEngine');

const darijaLatin = detectLanguage('wach daba bghit nkml hadchi m3ak 3afak');
assert.equal(darijaLatin.language, 'ary');
assert.equal(darijaLatin.locale, 'ary-MA');
assert.equal(darijaLatin.routingLanguage, 'ar');
assert.equal(darijaLatin.direction, 'ltr');

const darijaArabic = detectLanguage('واش دابا نقدر نكمل هادشي معاك عفاك');
assert.equal(darijaArabic.language, 'ary');
assert.equal(darijaArabic.routingLanguage, 'ar');
assert.equal(darijaArabic.direction, 'rtl');

const french = detectLanguage('Bonjour, je veux faire ce projet avec vous maintenant');
assert.equal(french.language, 'fr');
assert.equal(french.routingLanguage, 'fr');

const english = detectLanguage('Hello, I want to make this project with you now');
assert.equal(english.language, 'en');
assert.equal(english.routingLanguage, 'en');

const mixed = detectLanguage('واش نقدر deploy this project maintenant please');
assert.equal(mixed.mixed, true);
assert.equal(mixed.script, 'Mixed');

const automatic = resolveResponseLanguage('auto', darijaArabic);
assert.equal(automatic.responseLanguage, 'ary');

const explicit = resolveResponseLanguage('fr', darijaArabic);
assert.equal(explicit.mode, 'explicit');
assert.equal(explicit.responseLanguage, 'fr');

const prompt = buildLanguageContextPrompt(mixed, 'auto');
assert.match(prompt, /Mixed-language input: yes/);
assert.match(prompt, /code-switching/);

assert.equal(ocrLanguagesForContext(darijaArabic), 'ara');
assert.deepEqual(embeddingLanguageHints(darijaArabic), ['ary-MA','ary','ar']);

console.log('PASS: Pack048 detects Darija Arabic/Latin, French, English and mixed language');
console.log('PASS: response-language resolution preserves auto language and explicit overrides');
console.log('PASS: OCR and embedding language hints are deterministic and local');
