'use strict';

const { detectLanguage } = require('./languageEngine');

function requestText(body) {
  if (!body || typeof body !== 'object') return '';
  const candidates = [
    body.message,
    body.prompt,
    body.text,
    body.input,
    body.query
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function createLanguageContextMiddleware() {
  return function languageContextMiddleware(req, _res, next) {
    try {
      const text = requestText(req.body);
      if (text) {
        const languageContext = detectLanguage(text);
        req.zuvyrLanguageContext = languageContext;

        if (req.body && typeof req.body === 'object') {
          const current =
            req.body.aiPreferences &&
            typeof req.body.aiPreferences === 'object' &&
            !Array.isArray(req.body.aiPreferences)
              ? req.body.aiPreferences
              : {};

          req.body.aiPreferences = {
            ...current,
            languageContext
          };
        }
      }
    } catch {
      // Language detection is advisory. A classification failure must not
      // break an otherwise valid request.
    }
    return next();
  };
}

module.exports = {
  requestText,
  createLanguageContextMiddleware
};
