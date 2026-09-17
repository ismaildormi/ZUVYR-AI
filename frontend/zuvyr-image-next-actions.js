(function (root) {
  'use strict';
  function plan(context) {
    if (!context.contentId || !context.assetId || !context.prompt) return [];
    const actions = [];
    if (!context.prepared) actions.push({ intent: 'prepare_image_prompt', provenance: 'VERIFIED' });
    if (!context.copied) actions.push({ intent: 'copy_image_prompt', provenance: 'VERIFIED' });
    if (context.prepared) actions.push({ intent: 'restore_image_draft', provenance: 'VERIFIED' });
    return actions;
  }
  if (typeof module === 'object' && module.exports) { module.exports = { plan }; return; }
  const labels = {
    en: ['Next steps for this image', 'Reuse this image prompt', 'Copy this prompt', 'Restore my previous draft', 'Prompt ready to edit. Review it before sending; generation may use credits.', 'Prompt copied.', 'Previous draft restored.', 'Your draft changed. It has been preserved.', 'Could not copy. Try again.'],
    fr: ['Suite pour cette image', 'Réutiliser ce prompt', 'Copier ce prompt', 'Restaurer mon brouillon', 'Prompt prêt à modifier. Vérifiez avant envoi ; la génération peut utiliser des crédits.', 'Prompt copié.', 'Brouillon restauré.', 'Votre brouillon a changé. Il est conservé.', 'Copie impossible. Réessayez.'],
    ar: ['الخطوة التالية لهذه الصورة', 'حضّر وصف نسخة جديدة', 'انسخ وصف هذه الصورة', 'استرجع المسودة السابقة', 'الوصف جاهز للتعديل. راجعه قبل الإرسال؛ التوليد قد يستهلك رصيداً.', 'تم نسخ الوصف.', 'تم استرجاع المسودة.', 'تغيّرت المسودة، واحتفظنا بها.', 'تعذّر النسخ. حاول مجدداً.']
  };
  function attach(message) {
    if (message.dataset.zuvyrNextActions || !message.querySelector('img')) return;
    const meta = message._zuvyrMeta || {};
    let previous = message.previousElementSibling;
    while (previous && !previous.matches('.msg.user')) previous = previous.previousElementSibling;
    const context = { contentId: meta.canonicalContentId, assetId: meta.canonicalAssetId,
      conversationId: meta.conversationId || null, prompt: (previous?.textContent || '').trim(), prepared: false, copied: false };
    if (!plan(context).length) return;
    message.dataset.zuvyrNextActions = 'true';
    const panel = document.createElement('div');
    panel.className = 'zuvyr-image-next-actions';
    panel.setAttribute('role', 'group');
    const lang = typeof getRoxUiLanguage === 'function' ? getRoxUiLanguage() : 'en';
    const text = labels[lang] || labels.en;
    panel.setAttribute('aria-label', text[0]);
    const caption = document.createElement('div');
    caption.textContent = text[0] + ': ' + context.prompt.slice(0, 90) + (context.prompt.length > 90 ? '…' : '');
    const buttons = document.createElement('div');
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    panel.append(caption, buttons, status);
    message.appendChild(panel);
    let savedDraft = '';
    function render() {
      buttons.replaceChildren();
      for (const action of plan(context)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.intent = action.intent;
        button.textContent = text[action.intent === 'prepare_image_prompt' ? 1 : action.intent === 'copy_image_prompt' ? 2 : 3];
        button.addEventListener('click', async () => {
          // Resolve the live composer again; never send a generation or overwrite a changed draft on undo.
          const input = document.querySelector('[data-feature="images"]');
          if (!message.isConnected || !input) return;
          button.disabled = true;
          if (action.intent === 'prepare_image_prompt') {
            savedDraft = input.value;
            input.value = context.prompt;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
            context.prepared = true;
            status.textContent = text[4];
          } else if (action.intent === 'restore_image_draft') {
            if (input.value === context.prompt) {
              input.value = savedDraft;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              status.textContent = text[6];
            } else status.textContent = text[7];
            context.prepared = false;
          } else {
            try {
              await navigator.clipboard.writeText(context.prompt);
              context.copied = true;
              status.textContent = text[5];
            } catch (_) { status.textContent = text[8]; }
          }
          render();
        });
        buttons.appendChild(button);
      }
    }
    render();
  }
  const scan = () => document.querySelectorAll('#msgs-images .msg.bot').forEach(attach);
  const style = document.createElement('style');
  style.textContent = '.zuvyr-image-next-actions{margin-top:12px;font-size:12px;line-height:1.5;white-space:normal}.zuvyr-image-next-actions button{margin:6px 6px 0 0;padding:8px 12px;border:1px solid #737373;border-radius:18px;background:transparent;color:inherit;cursor:pointer}.zuvyr-image-next-actions button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}';
  document.head.appendChild(style);
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})(typeof window === 'undefined' ? null : window);
