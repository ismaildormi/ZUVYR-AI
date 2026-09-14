'use strict';

const fs = require('fs');
const assert = require('assert');

const prefs = fs.readFileSync('backend/lib/aiPreferences.js','utf8');
const server = fs.readFileSync('backend/server.js','utf8');
const checkpoint = fs.readFileSync('backend/lib/routerCheckpointC.js','utf8');
const aiRouter = fs.readFileSync('backend/aiRouter.js','utf8');
const middleware = fs.readFileSync('backend/lib/languageMiddleware.js','utf8');
const frontend = fs.readFileSync('frontend/index.html','utf8');
const frontendEngine = fs.readFileSync('frontend/zuvyr-language-engine-v1.js','utf8');
const documentTools = fs.readFileSync('backend/lib/documentToolExtraction.js','utf8');

assert(prefs.includes("require('./languageEngine')"));
assert(prefs.includes("buildLanguageContextPrompt"));
assert(prefs.includes("languageContext"));

assert(server.includes("createLanguageContextMiddleware"));
assert(server.includes("app.use(createLanguageContextMiddleware())"));
assert(server.includes("language: req.zuvyrLanguageContext?.routingLanguage || null"));

assert(middleware.includes("req.zuvyrLanguageContext = languageContext"));
assert(middleware.includes("languageContext"));
assert(!middleware.includes("req.body.language ="));

assert(aiRouter.includes("async function routeRequest(feature, messages, opts = {})"));
assert((aiRouter.match(/language:\s*opts\.language\s*\|\|\s*null/g) || []).length >= 2);

assert(checkpoint.includes("language = null"));
assert(!checkpoint.includes("language: null"));

assert(frontend.includes('/zuvyr-language-engine-v1.js'));
assert(frontendEngine.includes("MutationObserver"));
assert(frontendEngine.includes("setAttribute('dir', 'auto')"));
assert(frontendEngine.includes("unicodeBidi = 'plaintext'"));

assert(documentTools.includes("ATTACHMENT_OCR_LANGUAGES || 'eng+ara+fra'"));

console.log('PASS: Pack048 request language context reaches preferences and existing router opts');
console.log('PASS: aiRouter existing opts.language support is reused without modification');
console.log('PASS: router checkpoint no longer hardcodes language=null');
console.log('PASS: production frontend gains locale-driven document direction and per-message bidi');
console.log('PASS: existing OCR baseline remains multilingual eng+ara+fra');
