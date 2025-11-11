// subscribe-form client script
(function () {
  function showMessage(msgEl, text, link) {
    if (!msgEl) {
      // 静默失败，不输出到控制台
      return;
    }
    msgEl.textContent = '';
    msgEl.style.display = 'block';
    msgEl.appendChild(document.createTextNode(text));
    if (link) {
      msgEl.appendChild(document.createTextNode(' '));
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = 'Open Buttondown';
      msgEl.appendChild(anchor);
    }
  }

  const buttondownConfig = (() => {
    try {
      const prefs = (typeof window !== 'undefined' && window.__SITE_PREFS) || {};
      const user = (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.subscribeUser) || prefs.subscribeUser || '';
      if (typeof user === 'string' && user.trim().length > 0) {
        const slug = user.trim();
        // Build a safe Buttondown URL for the user. Example: https://buttondown.email/slug?subscribe=1
        const base = 'https://buttondown.email/' + encodeURIComponent(slug);
        return {
          subscribe: base + '?subscribe=1',
          manage: base,
        };
      }
    } catch (_) {
      // ignore
    }
    return null;
  })();

  function handleClick(msgEl) {
    try { console.debug && console.debug('[subscribe] handleClick, buttondownConfig=', buttondownConfig); } catch (_) {}
    if (!buttondownConfig) {
      showMessage(msgEl, 'Subscribe endpoint not configured. Please contact the site owner.');
      try { document.dispatchEvent(new CustomEvent('subscribe:error', { detail: { error: 'endpoint missing' } })); } catch (_) {}
      return;
    }

    let opened = null;
    try {
      opened = window.open(buttondownConfig.subscribe, '_blank', 'noopener');
    } catch (_) {
      opened = null;
    }

    if (opened) {
      showMessage(msgEl, 'Buttondown subscribe page opened in a new tab. Please confirm there.');
    } else {
      showMessage(msgEl, 'Please allow pop-ups, then click again or open manually.', buttondownConfig.subscribe);
    }

    try { document.dispatchEvent(new CustomEvent('subscribe:external', { detail: { url: buttondownConfig.subscribe } })); } catch (_) {}
  }

  function attachToNode(root) {
    if (!root) return;
    // If this form is inside a dialog, prefer binding on the dialog root so we can
    // find the action buttons placed outside the .subscribe-form element.
    const dialogRoot = root.closest && root.closest('.pref-subscribe-dialog') ? root.closest('.pref-subscribe-dialog') : root;
    if (!dialogRoot || (dialogRoot.dataset && dialogRoot.dataset.sfBound === '1')) return;
    // The visible message lives inside the .subscribe-form, so keep that reference
    const msg = root.querySelector('.sf-message');
    // The trigger button may be placed in the actions container outside the .subscribe-form.
    const trigger = dialogRoot.querySelector('[data-subscribe-open]');
    if (!trigger) return;
    try { console.debug && console.debug('[subscribe] attachToNode: binding trigger for subscribe in', dialogRoot); } catch (_) {}
    if (dialogRoot.dataset) dialogRoot.dataset.sfBound = '1';
    trigger.addEventListener('click', function () {
      if (msg) msg.style.display = 'none';
      handleClick(msg);
    });
  }

  function scan(root) {
    try {
      const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
      scope.querySelectorAll('.subscribe-form').forEach(attachToNode);
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    scan(document);
  });

  if (typeof window !== 'undefined') {
    window.attachSubscribeForms = function attachSubscribeForms(root) {
      scan(root);
    };
  }
})();
