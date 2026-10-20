/*
 * IdleCloud 提示词工坊 — 轻量 UI 原语（无框架）
 */
(function () {
  'use strict';

  const NS = (globalThis.IdleUI = {});

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'dataset') {
          Object.entries(v).forEach(([dk, dv]) => {
            el.dataset[dk] = dv;
          });
        } else if (k === 'style' && typeof v === 'object') {
          Object.assign(el.style, v);
        } else {
          el.setAttribute(k, v === true ? '' : String(v));
        }
      });
    }
    (Array.isArray(children) ? children : children != null ? [children] : []).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }

  const ICONS = {
    spark:
      '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/>',
    brush:
      '<path d="M4 20c0-2 1-3 2.5-3.5C8 16 9 15 9 13.5 9 12 10 11 11.5 11c1.6 0 2.5 1 2.5 2.5C14 16 10 20 4 20z"/><path d="M14 10l6-6"/><path d="M15 5l4 4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V22a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H2a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H8a1.7 1.7 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V8a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    close: '<path d="M18 6L6 18M6 6l12 12"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    star: '<path d="M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17.8 6.4 20l1.3-6.1L3 9.6l6.3-.7L12 3z"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    sparkles:
      '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z"/><path d="M19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7L19 14z"/>'
  };

  function icon(name, size = 18, cls = '') {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 24 24');
    wrap.setAttribute('width', String(size));
    wrap.setAttribute('height', String(size));
    wrap.setAttribute('fill', 'none');
    wrap.setAttribute('stroke', 'currentColor');
    wrap.setAttribute('stroke-width', '1.8');
    wrap.setAttribute('stroke-linecap', 'round');
    wrap.setAttribute('stroke-linejoin', 'round');
    if (cls) wrap.setAttribute('class', cls);
    wrap.innerHTML = ICONS[name] || '';
    return wrap;
  }

  function button(label, opts = {}) {
    const { icon: iconName, variant = 'ghost', onClick, title, disabled, className = '' } = opts;
    const b = h(
      'button',
      {
        class: `is-btn is-${variant} ${className}`.trim(),
        type: 'button',
        title: title || label || '',
        disabled: !!disabled,
        onClick
      },
      [
        iconName ? icon(iconName, opts.iconSize || 16) : null,
        label ? h('span', { class: 'is-btn-label', text: label }) : null
      ]
    );
    return b;
  }

  function iconButton(name, opts = {}) {
    return button('', { ...opts, icon: name });
  }

  function toast(host, message, type = 'info', ms = 2600) {
    if (!host) return;
    const el = h('div', { class: `is-toast is-${type}`, text: message });
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-show'));
    setTimeout(() => {
      el.classList.remove('is-show');
      setTimeout(() => el.remove(), 220);
    }, ms);
  }

  function dialog(host, { title, body, confirmText = '保存', cancelText = '取消', danger = false, onConfirm }) {
    const overlay = h('div', { class: 'is-modal-overlay' });
    const modal = h('div', { class: 'is-modal' }, [
      h('div', { class: 'is-modal-head' }, [
        h('div', { class: 'is-modal-title', text: title }),
        iconButton('close', { onClick: () => overlay.remove() })
      ]),
      h('div', { class: 'is-modal-body' }, [body]),
      h('div', { class: 'is-modal-foot' }, [
        button(cancelText, { variant: 'ghost', onClick: () => overlay.remove() }),
        button(confirmText, {
          variant: danger ? 'danger' : 'primary',
          onClick: async () => {
            const result = onConfirm ? await onConfirm() : true;
            if (result !== false) overlay.remove();
          }
        })
      ])
    ]);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    host.appendChild(overlay);
    const first = modal.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return overlay;
  }

  function field(label, inputEl, hint) {
    return h('label', { class: 'is-field' }, [
      h('span', { class: 'is-field-label', text: label }),
      inputEl,
      hint ? h('span', { class: 'is-field-hint', text: hint }) : null
    ]);
  }

  function input(value, opts = {}) {
    return h('input', {
      class: 'is-input',
      type: opts.type || 'text',
      value: value || '',
      placeholder: opts.placeholder || '',
      autocomplete: 'off',
      spellcheck: 'false'
    });
  }

  function textarea(value, opts = {}) {
    return h('textarea', {
      class: 'is-textarea',
      rows: opts.rows || 3,
      placeholder: opts.placeholder || '',
      spellcheck: 'false',
      value: value || ''
    });
  }

  Object.assign(NS, { h, icon, button, iconButton, toast, dialog, field, input, textarea, ICONS });
})();
