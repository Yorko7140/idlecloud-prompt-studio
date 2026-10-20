/*
 * IdleCloud 提示词工坊 — 站点编辑器适配层
 * 只依赖结构特征（.prompt-editor-input / role=tab / MUI 表单），不依赖具体语言文案。
 */
(function () {
  'use strict';

  const NS = (globalThis.IdleAdapter = {});

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function promptSections() {
    const sections = [];
    document.querySelectorAll('.prompt-editor-input').forEach((el) => {
      let section =
        el.closest('section') ||
        el.closest('[role="region"]') ||
        el.closest('[role="tabpanel"]')?.parentElement ||
        el.parentElement?.parentElement?.parentElement;
      // 向上找到一个真正包含页签的容器，避免取到过深的局部节点
      let probe = section;
      for (let i = 0; i < 5 && probe && !probe.querySelector('[role="tab"]'); i += 1) {
        probe = probe.parentElement;
      }
      if (probe && probe.querySelector('[role="tab"]')) section = probe;
      if (section && !sections.includes(section)) sections.push(section);
    });
    return sections;
  }

  function promptSection() {
    const sections = promptSections();
    if (!sections.length) return null;
    return (
      sections.find((s) => isVisible(s.querySelector('textarea'))) ||
      sections[0] ||
      null
    );
  }

  function promptTabs(section) {
    if (!section) return [];
    return Array.from(section.querySelectorAll('[role="tab"]'));
  }

  function promptTextarea(section) {
    if (!section) return null;
    const list = section.querySelectorAll('.prompt-editor-input textarea');
    return Array.from(list).find(isVisible) || list[0] || null;
  }

  // 站点结构变化时的兜底：当前（或最后）获得焦点的多行输入框。
  // Shadow DOM 里点击面板按钮后 document.activeElement 会变成 host，
  // 所以额外记录 focusin 事件中最后聚焦的 textarea。
  let lastFocused = null;
  document.addEventListener(
    'focusin',
    (ev) => {
      const t = ev.target;
      if (t && t.tagName === 'TEXTAREA' && !t.closest('#idlecloud-prompt-studio-host')) lastFocused = t;
    },
    true
  );

  function focusedTextarea() {
    const el = document.activeElement;
    if (el && el.tagName === 'TEXTAREA' && isVisible(el) && !el.closest('#idlecloud-prompt-studio-host')) return el;
    if (lastFocused && lastFocused.isConnected && isVisible(lastFocused)) return lastFocused;
    return null;
  }

  function tabIndexFor(kind) {
    return kind === 'negative' ? 1 : 0;
  }

  async function selectPromptTab(kind) {
    const section = promptSection();
    if (!section) return { ok: false, reason: '未找到提示词编辑区，请确认当前在绘图页 /main。' };
    const tabs = promptTabs(section);
    if (!tabs.length) {
      return { ok: false, reason: '当前处于「指令编辑」模式，没有正向/负向页签。' };
    }
    const idx = tabIndexFor(kind);
    const tab = tabs[idx];
    if (!tab) return { ok: false, reason: '没有找到对应的提示词页签。' };
    if (tab.disabled || tab.getAttribute('aria-disabled') === 'true') {
      return {
        ok: false,
        reason: kind === 'negative' ? '当前模型使用固定负面提示词，无法编辑。' : '页签不可用。'
      };
    }
    if (tab.getAttribute('aria-selected') !== 'true') {
      tab.click();
      await sleep(90);
    }
    return { ok: true, section, tab };
  }

  function dispatchInput(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    try {
      el.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          cancelable: false,
          inputType: 'insertText',
          data: value
        })
      );
    } catch (e) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function insertText(el, text, opts) {
    const { mode = 'append', separator = ', ' } = opts || {};
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, reason: '要填入的内容为空。' };
    const current = String(el.value || '');
    if (mode !== 'replace' && current.trim()) {
      if (current.includes(clean)) {
        el.focus();
        return { ok: true, duplicate: true, value: current };
      }
      const glued = /[,\n]$/.test(current.trim())
        ? current.replace(/\s+$/, ' ') + clean
        : current + separator + clean;
      dispatchInput(el, glued);
      el.focus();
      try {
        el.setSelectionRange(glued.length, glued.length);
      } catch (e) {
        /* ignore */
      }
      return { ok: true, duplicate: false, value: glued };
    }
    dispatchInput(el, clean);
    el.focus();
    try {
      el.setSelectionRange(clean.length, clean.length);
    } catch (e) {
      /* ignore */
    }
    return { ok: true, duplicate: false, value: clean };
  }

  async function fillPrompt(kind, text, opts) {
    const target = await selectPromptTab(kind);
    if (!target.ok) {
      const el = focusedTextarea();
      if (el) return insertText(el, text, opts);
      return target;
    }
    const el = promptTextarea(target.section);
    if (!el) {
      const focused = focusedTextarea();
      if (focused) return insertText(focused, text, opts);
      return { ok: false, reason: '找不到提示词输入框。' };
    }
    return insertText(el, text, opts);
  }

  async function readPrompt(kind) {
    const target = await selectPromptTab(kind);
    if (!target.ok) return '';
    const el = promptTextarea(target.section);
    return el ? String(el.value || '') : '';
  }

  function parametersScope() {
    const add = findAddCharacterButton();
    if (!add) return document;
    return (
      add.closest('.MuiAccordionDetails-root') ||
      add.closest('[role="region"]') ||
      add.parentElement?.parentElement?.parentElement ||
      document
    );
  }

  function findAddCharacterButton() {
    const re =
      /add character|add a character|添加角色|添加人物|新增角色|キャラクター(を)?追加|캐릭터\s*추가/i;
    const buttons = Array.from(document.querySelectorAll('button'));
    return (
      buttons.find(
        (b) =>
          isVisible(b) &&
          !b.disabled &&
          re.test((b.textContent || '').trim()) &&
          !b.closest('[role="dialog"]')
      ) || null
    );
  }

  // 角色区通常紧邻「添加角色」按钮；据此收窄搜索范围，避免误填其它备注框。
  function characterScope() {
    const btn = findAddCharacterButton();
    if (!btn) return null;
    let node = btn.closest('section') || btn.closest('[role="region"]');
    if (node) return node;
    let probe = btn.parentElement;
    for (let i = 0; i < 7 && probe; i += 1, probe = probe.parentElement) {
      if (probe.querySelector('textarea')) return probe;
    }
    return null;
  }

  function characterTextareas() {
    const scope = characterScope() || document;
    return Array.from(scope.querySelectorAll('textarea')).filter(
      (t) =>
        isVisible(t) &&
        !t.closest('.prompt-editor-input') &&
        !t.closest('[role="dialog"]') &&
        !t.readOnly &&
        !t.disabled
    );
  }

  function characterTextarea() {
    if (!promptSection()) return null;
    const active = document.activeElement;
    if (
      active &&
      active.tagName === 'TEXTAREA' &&
      !active.closest('.prompt-editor-input') &&
      isVisible(active)
    ) {
      return active;
    }
    const list = characterTextareas();
    if (!list.length) return null;
    // 优先带 MUI FormControl 的输入（角色描述用的是 MUI TextField）
    return list.find((t) => t.closest('.MuiFormControl-root')) || list[0];
  }

  function expandFirstCharacterPanel() {
    const scope = parametersScope();
    const candidates = Array.from(
      scope.querySelectorAll('button[aria-expanded="false"]')
    ).filter((b) => {
      const label = b.getAttribute('aria-label') || '';
      return /expand|展开|展開|펼치기|развернуть/i.test(label);
    });
    if (candidates.length) {
      candidates[0].click();
      return true;
    }
    return false;
  }

  function tablistNear(el) {
    let node = el;
    for (let i = 0; i < 8 && node; i += 1) {
      const list = node.querySelector?.('[role="tablist"]');
      if (list) return list;
      node = node.parentElement;
    }
    return null;
  }

  async function selectCharacterTab(el, avoid) {
    const list = tablistNear(el);
    if (!list) return true;
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    const tab = tabs[avoid ? 1 : 0];
    if (!tab) return true;
    if (tab.disabled || tab.getAttribute('aria-disabled') === 'true') {
      if (avoid) return false;
      return true;
    }
    if (tab.getAttribute('aria-selected') !== 'true') {
      tab.click();
      await sleep(120);
    }
    return true;
  }

  async function fillCharacter(text, opts) {
    const { avoid = false } = opts || {};
    let el = characterTextarea();
    if (!el && !promptSection()) el = focusedTextarea();
    if (!el) {
      expandFirstCharacterPanel();
      await sleep(150);
      el = characterTextarea();
    }
    if (!el) {
      const add = findAddCharacterButton();
      if (add) {
        add.click();
        await sleep(250);
        el = characterTextarea();
      }
    }
    if (!el) {
      return {
        ok: false,
        reason: '没有可用的角色提示词框。请先在右侧「参数」里展开一个角色，或点击「添加角色」。'
      };
    }
    if (avoid) {
      const switched = await selectCharacterTab(el, true);
      if (!switched) {
        return { ok: false, reason: '当前模型使用固定负面，角色负面不可编辑。' };
      }
      const again = characterTextarea();
      if (again) el = again;
    } else {
      await selectCharacterTab(el, false);
      const again = characterTextarea();
      if (again) el = again;
    }
    return insertText(el, text, opts);
  }

  function readCharacters() {
    if (!promptSection()) return [];
    return characterTextareas().map((t) => {
      const control = t.closest('.MuiFormControl-root');
      const label = control?.querySelector('label')?.textContent?.trim() || '';
      return { label, value: String(t.value || '') };
    });
  }

  function currentContext() {
    const section = promptSection();
    const pos = promptTextarea(section);
    return {
      positive: pos ? String(pos.value || '') : '',
      characters: readCharacters()
    };
  }


  async function fillCharacters(list, opts) {
    const texts = (Array.isArray(list) ? list : []).map((t) => String(t || '').trim()).filter(Boolean);
    const results = [];
    for (let i = 0; i < texts.length; i += 1) {
      let tas = characterTextareas();
      if (!tas[i]) {
        if (i === 0 && !tas.length) {
          expandFirstCharacterPanel();
          await sleep(160);
          tas = characterTextareas();
        }
      }
      if (!tas[i]) {
        const add = findAddCharacterButton();
        if (add) {
          add.click();
          await sleep(280);
          tas = characterTextareas();
        }
      }
      let el = tas[i];
      if (!el) {
        results.push({ ok: false, reason: `角色框不足（需要 ${texts.length} 个）` });
        break;
      }
      await selectCharacterTab(el, false);
      tas = characterTextareas();
      el = tas[i] || el;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (e) {
        /* ignore */
      }
      results.push(insertText(el, texts[i], opts));
    }
    return results;
  }

  function diagnose() {
    const section = promptSection();
    const tabs = promptTabs(section).map((t) => ({
      label: (t.textContent || '').trim().slice(0, 24),
      selected: t.getAttribute('aria-selected') === 'true',
      disabled: !!t.disabled || t.getAttribute('aria-disabled') === 'true'
    }));
    const ta = promptTextarea(section);
    const chars = characterTextareas().map((t) => {
      const control = t.closest('.MuiFormControl-root');
      return {
        label: (control?.querySelector('label')?.textContent || '').trim().slice(0, 24),
        placeholder: String(t.getAttribute('placeholder') || '').slice(0, 40),
        value: String(t.value || '').slice(0, 40)
      };
    });
    return {
      url: location.href,
      foundSection: !!section,
      editorCount: document.querySelectorAll('.prompt-editor-input').length,
      tabs,
      activeTextarea: ta ? { placeholder: String(ta.getAttribute('placeholder') || '').slice(0, 40), value: String(ta.value || '').slice(0, 60) } : null,
      characterFields: chars,
      addCharacterButton: (() => {
        const b = findAddCharacterButton();
        return b ? (b.textContent || '').trim().slice(0, 30) : null;
      })()
    };
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  async function waitForApp(timeout = 20000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (promptSection()) return true;
      await sleep(400);
    }
    return false;
  }

  Object.assign(NS, {
    sleep,
    isVisible,
    promptSection,
    promptTabs,
    promptTextarea,
    selectPromptTab,
    fillPrompt,
    readPrompt,
    fillCharacter,
    fillCharacters,
    readCharacters,
    currentContext,
    copyText,
    focusedTextarea,
    diagnose,
    waitForApp,
    findAddCharacterButton,
    characterTextareas
  });
})();
