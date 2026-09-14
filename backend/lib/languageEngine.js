'use strict';

const CONFIG = require('../config/language-engine.v1.json');

const ARABIC_RE = /\p{Script=Arabic}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const LETTER_RE = /\p{L}/u;
const TOKEN_RE = /[\p{L}\p{N}'’-]+/gu;

const DARIJA_LATIN = new Set([
  'ana','nta','nti','hna','ntoma','daba','wach','chno','chnou','ach','3lach','lach',
  'bghit','baghi','bagha','ghadi','kayn','kayna','makaynch','mzyan','bzaf','safi',
  'walakin','hit','7it','khass','khasni','dyal','dial','fhamt','fhemt','kifach',
  'fin','mnin','hadchi','hada','hadi','dakchi','ra','rah','ma3raftch','3afak'
]);
const DARIJA_ARABIC = new Set([
  'أنا','نتا','نتي','حنا','دابا','واش','شنو','علاش','بغيت','باغي','باغية','غادي',
  'كاين','كاينة','ماكاينش','مزيان','بزاف','صافي','ولكن','حيت','خاص','ديال','فهمت',
  'كيفاش','فين','منين','هادشي','هادا','هادي','داكشي','راه','عفاك'
]);
const FRENCH = new Set([
  'je','tu','il','elle','nous','vous','ils','elles','le','la','les','un','une','des',
  'du','de','avec','pour','mais','pas','que','qui','dans','sur','est','sont','être',
  'bonjour','merci','comment','pourquoi','maintenant','très','bien','aussi','faire'
]);
const ENGLISH = new Set([
  'i','you','he','she','we','they','the','a','an','and','or','but','is','are','was',
  'were','with','for','from','this','that','these','those','what','why','how','now',
  'very','good','also','make','please','thanks','hello'
]);

function freeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freeze));
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = freeze(value[key]);
    return Object.freeze(value);
  }
  return value;
}

function cleanText(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(text) {
  return [...text.matchAll(TOKEN_RE)].map(match => match[0].toLowerCase());
}

function scriptProfile(text) {
  let arabic = 0;
  let latin = 0;
  let letters = 0;
  let firstStrong = null;
  for (const char of text) {
    if (!LETTER_RE.test(char)) continue;
    letters += 1;
    if (ARABIC_RE.test(char)) {
      arabic += 1;
      if (!firstStrong) firstStrong = 'Arab';
    } else if (LATIN_RE.test(char)) {
      latin += 1;
      if (!firstStrong) firstStrong = 'Latn';
    }
  }
  const other = Math.max(0, letters - arabic - latin);
  const script = arabic > 0 && latin > 0
    ? 'Mixed'
    : arabic > 0 ? 'Arab'
    : latin > 0 ? 'Latn'
    : 'Zyyy';
  const direction = firstStrong === 'Arab' ? 'rtl' : 'ltr';
  return { letters, arabic, latin, other, script, direction, firstStrong };
}

function markerScore(tokens, set) {
  let score = 0;
  for (const token of tokens) if (set.has(token)) score += 1;
  return score;
}

function detectLanguage(textValue) {
  const text = cleanText(textValue);
  const scripts = scriptProfile(text);
  const tokens = tokensOf(text);

  let darija = markerScore(tokens, DARIJA_LATIN) + markerScore(tokens, DARIJA_ARABIC) * 2;
  let french = markerScore(tokens, FRENCH);
  let english = markerScore(tokens, ENGLISH);

  if (/[éèêëàâîïôùûüçœ]/iu.test(text)) french += 2;
  if (/\b(?:ma|mashi|makaynch|ma\w+ch)\b/iu.test(text)) darija += 1;
  if (/[3579]/u.test(text) && scripts.latin > 0) darija += 1;
  if (scripts.arabic > 0 && darija === 0) darija = 0.5;

  let language = 'und';
  let locale = 'und';
  const ranked = [
    ['ary', darija],
    ['fr', french],
    ['en', english]
  ].sort((a,b)=>b[1]-a[1]);

  if (scripts.arabic > 0 && ranked[0][1] < 2) {
    language = 'ar';
    locale = 'ar';
  } else if (ranked[0][1] > 0) {
    language = ranked[0][0];
    locale = language === 'ary' ? 'ary-MA' : language;
  } else if (scripts.latin > 0) {
    language = 'en';
    locale = 'en';
  }

  const secondaryStrong = ranked[1][1] >= CONFIG.mixedLanguage.minimumSecondaryScore;
  const totalLetters = Math.max(1, scripts.letters);
  const scriptMixed =
    scripts.arabic / totalLetters >= CONFIG.mixedLanguage.minimumScriptShare &&
    scripts.latin / totalLetters >= CONFIG.mixedLanguage.minimumScriptShare;
  const mixed = secondaryStrong || scriptMixed;

  const routingLanguage =
    CONFIG.routingLanguageMap[locale] ||
    CONFIG.routingLanguageMap[language] ||
    (language === 'und' ? null : language);

  return freeze({
    version: 1,
    language,
    locale,
    routingLanguage,
    script: scripts.script,
    direction: scripts.direction,
    mixed,
    scores: {
      darija,
      french,
      english
    },
    scripts: {
      arabic: scripts.arabic,
      latin: scripts.latin,
      other: scripts.other
    }
  });
}

function normalizeLanguageContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const language = String(value.language || '').trim().toLowerCase();
  const locale = String(value.locale || '').trim();
  const routingLanguage = String(value.routingLanguage || '').trim().toLowerCase() || null;
  const script = String(value.script || '').trim();
  const direction = value.direction === 'rtl' ? 'rtl' : 'ltr';
  return freeze({
    version: 1,
    language: language || 'und',
    locale: locale || 'und',
    routingLanguage,
    script: script || 'Zyyy',
    direction,
    mixed: value.mixed === true
  });
}

function resolveResponseLanguage(preference, languageContext) {
  const selected = String(preference || 'auto').trim().toLowerCase();
  if (selected && selected !== 'auto') {
    return freeze({
      mode: 'explicit',
      responseLanguage: selected,
      responseLocale: selected,
      preserveCodeSwitching: false
    });
  }
  const context = normalizeLanguageContext(languageContext);
  if (!context || context.language === 'und') {
    return freeze({
      mode: 'auto',
      responseLanguage: 'auto',
      responseLocale: 'auto',
      preserveCodeSwitching: false
    });
  }
  return freeze({
    mode: 'auto',
    responseLanguage: context.language,
    responseLocale: context.locale,
    preserveCodeSwitching: context.mixed === true
  });
}

function buildLanguageContextPrompt(languageContext, preference = 'auto') {
  const context = normalizeLanguageContext(languageContext);
  if (!context) return '';
  const response = resolveResponseLanguage(preference, context);
  const lines = [
    '[ZUVYR Language Engine v1]',
    `Detected language: ${context.language}.`,
    `Detected locale: ${context.locale}.`,
    `Detected script: ${context.script}.`,
    `Text direction: ${context.direction}.`,
    `Mixed-language input: ${context.mixed ? 'yes' : 'no'}.`
  ];
  if (response.mode === 'explicit') {
    lines.push(`Response language is explicitly locked to ${response.responseLanguage}; preserve meaning but do not override this preference.`);
  } else if (context.language === 'ary') {
    lines.push('Reply naturally in Moroccan Darija. Preserve Darija vocabulary and code-switching when it improves fidelity.');
  } else if (response.preserveCodeSwitching) {
    lines.push('Preserve the user’s natural language mixing/code-switching unless they explicitly ask for translation or a single language.');
  } else {
    lines.push(`Reply in ${response.responseLocale}; preserve the user’s language rather than silently translating it.`);
  }
  return lines.join('\n');
}

function ocrLanguagesForContext(languageContext) {
  const context = normalizeLanguageContext(languageContext);
  if (!context) return CONFIG.ocr.default;
  if (context.mixed) {
    const parts = new Set();
    if (context.script === 'Arab' || context.script === 'Mixed') parts.add('ara');
    const mapped = CONFIG.ocr.byLanguage[context.language];
    if (mapped) parts.add(mapped);
    if (context.language === 'ary') {
      parts.add('ara');
      parts.add('fra');
      parts.add('eng');
    }
    if (parts.size) return [...parts].sort().join('+');
  }
  return CONFIG.ocr.byLanguage[context.language] || CONFIG.ocr.default;
}

function embeddingLanguageHints(languageContext) {
  const context = normalizeLanguageContext(languageContext);
  if (!context || context.language === 'und') return freeze([]);
  const hints = new Set([context.locale, context.language]);
  if (context.language === 'ary') hints.add('ar');
  return freeze([...hints].filter(Boolean));
}

module.exports = {
  cleanText,
  detectLanguage,
  normalizeLanguageContext,
  resolveResponseLanguage,
  buildLanguageContextPrompt,
  ocrLanguagesForContext,
  embeddingLanguageHints
};
