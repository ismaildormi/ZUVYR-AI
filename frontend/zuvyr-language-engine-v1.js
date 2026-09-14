(() => {
  'use strict';

  const RTL = /^(ar|ary|fa|he|ur)(-|$)/i;

  function normalizeLanguage(value) {
    const text = String(value || '').trim();
    return text || 'en';
  }

  function directionForLanguage(value) {
    return RTL.test(normalizeLanguage(value)) ? 'rtl' : 'ltr';
  }

  function applyDocumentDirection() {
    const root = document.documentElement;
    const lang = normalizeLanguage(root.lang || navigator.language || 'en');
    root.lang = lang;
    root.dir = directionForLanguage(lang);
  }

  function applyMessageDirection(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const nodes = root.querySelectorAll('.msg:not([data-zuvyr-language-dir])');
    for (const node of nodes) {
      node.setAttribute('dir', 'auto');
      node.setAttribute('data-zuvyr-language-dir', 'auto');
      node.style.unicodeBidi = 'plaintext';
      node.style.textAlign = 'start';
    }
  }

  function install() {
    applyDocumentDirection();
    applyMessageDirection();

    const langObserver = new MutationObserver(() => applyDocumentDirection());
    langObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });

    const contentObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node && node.nodeType === 1) {
            if (node.matches?.('.msg')) {
              node.setAttribute('dir', 'auto');
              node.setAttribute('data-zuvyr-language-dir', 'auto');
              node.style.unicodeBidi = 'plaintext';
              node.style.textAlign = 'start';
            }
            applyMessageDirection(node);
          }
        }
      }
    });
    contentObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  window.ZuvyrLanguageEngine = Object.freeze({
    directionForLanguage,
    applyDocumentDirection,
    applyMessageDirection
  });
})();
