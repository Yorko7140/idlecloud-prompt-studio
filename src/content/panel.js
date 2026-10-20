/*
 * IdleCloud 提示词工坊 — 悬浮面板（骨架 / 画师库 / 角色库）
 */
(function () {
  'use strict';

  const { h, icon, button, iconButton, toast, dialog, field, input, textarea } = globalThis.IdleUI;
  const Store = globalThis.IdleStore;
  const Adapter = globalThis.IdleAdapter;

  const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.is-root {
  --bg: #0d1118;
  --bg2: #141a25;
  --card: #1a2231;
  --card2: #202a3c;
  --line: rgba(255,255,255,.075);
  --line2: rgba(255,255,255,.13);
  --text: #e9eef8;
  --muted: #8e99ad;
  --accent: #7c9cff;
  --accent2: #b78cff;
  --ok: #4ade80;
  --warn: #fbbf24;
  --danger: #f87171;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", sans-serif;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
}
.is-root button, .is-root input, .is-root textarea, .is-root select { font-family: inherit; }
.is-launcher {
  position: fixed; right: 18px; bottom: 96px;
  width: 52px; height: 52px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,.18);
  background: linear-gradient(145deg, #6f8cff, #a06bff 55%, #ff86c8);
  color: #fff; cursor: pointer; pointer-events: auto;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 10px 30px rgba(80,90,255,.45), 0 2px 8px rgba(0,0,0,.4);
  transition: transform .18s ease, box-shadow .18s ease;
}
.is-launcher:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 14px 36px rgba(80,90,255,.55); }
.is-launcher:active { transform: scale(.97); }
.is-launcher.is-hidden { opacity: 0; pointer-events: none; transform: scale(.8); }
.is-launcher svg { width: 26px; height: 26px; }

.is-panel {
  position: fixed; top: 16px; left: 16px;
  width: 414px; max-width: calc(100vw - 24px);
  height: calc(100vh - 32px); max-height: 940px;
  display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(19,25,37,.985), rgba(11,15,23,.99));
  border: 1px solid var(--line2);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.02) inset;
  pointer-events: auto;
  overflow: hidden;
  backdrop-filter: blur(18px) saturate(1.1);
  transform: translateX(calc(100% + 24px));
  opacity: 0;
  transition: transform .24s cubic-bezier(.22,.8,.3,1), opacity .18s ease;
}
.is-panel.is-open { transform: none; opacity: 1; }
.is-panel.is-min { height: 58px; }
.is-panel.is-min .is-tabs, .is-panel.is-min .is-body { display: none; }

.is-head.is-dragging { cursor: grabbing; }
.is-head {
  display: flex; align-items: center; gap: 10px;
  cursor: grab; touch-action: none;
  padding: 12px 12px 10px; border-bottom: 1px solid var(--line);
  background: linear-gradient(180deg, rgba(124,156,255,.08), transparent);
}
.is-logo {
  width: 30px; height: 30px; border-radius: 10px; flex: none;
  background: linear-gradient(145deg, #6f8cff, #a06bff 60%, #ff86c8);
  display: flex; align-items: center; justify-content: center; color: #fff;
  box-shadow: 0 4px 12px rgba(110,120,255,.35);
}
.is-brand { min-width: 0; flex: 1; }
.is-title { font-size: 13.5px; font-weight: 650; letter-spacing: .2px; white-space: nowrap; }
.is-sub { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.is-head-actions { display: flex; align-items: center; gap: 2px; }
.is-head-actions .is-btn { width: 28px; height: 28px; padding: 0; }

.is-tabs {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--line); padding: 0 6px;
  background: rgba(255,255,255,.012);
}
.is-tab {
  position: relative; border: 0; background: transparent; color: var(--muted);
  padding: 9px 4px 10px; cursor: pointer; font-size: 12px;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  transition: color .15s ease;
}
.is-tab:hover { color: var(--text); }
.is-tab.is-active { color: var(--text); font-weight: 600; }
.is-tab.is-active::after {
  content: ""; position: absolute; left: 18%; right: 18%; bottom: -1px; height: 2px;
  border-radius: 2px; background: linear-gradient(90deg, var(--accent), var(--accent2));
}
.is-tab .is-count {
  font-size: 9.5px; padding: 1px 5px; border-radius: 999px;
  background: rgba(255,255,255,.07); color: var(--muted); font-weight: 500;
}
.is-tab.is-active .is-count { background: rgba(124,156,255,.18); color: #cdd8ff; }

.is-body { flex: 1; min-height: 0; display: flex; }
.is-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.is-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.is-scroll::-webkit-scrollbar, .is-chat-list::-webkit-scrollbar { width: 8px; }
.is-scroll::-webkit-scrollbar-thumb, .is-chat-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.13); border-radius: 8px; }
.is-scroll::-webkit-scrollbar-track, .is-chat-list::-webkit-scrollbar-track { background: transparent; }

.is-toolbar { padding: 10px 12px 8px; display: flex; flex-direction: column; gap: 8px; }
.is-toolbar-row { display: flex; gap: 7px; align-items: center; }
.is-search { position: relative; flex: 1; min-width: 0; }
.is-search svg { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.is-search .is-input { padding-left: 30px; height: 32px; }
.is-input, .is-select, .is-textarea {
  width: 100%; background: rgba(255,255,255,.045); border: 1px solid var(--line2);
  color: var(--text); border-radius: 9px; padding: 7px 9px; font-size: 12px;
  outline: none; transition: border-color .15s ease, background .15s ease;
}
.is-input:focus, .is-select:focus, .is-textarea:focus { border-color: rgba(124,156,255,.65); background: rgba(124,156,255,.06); }
.is-input::placeholder, .is-textarea::placeholder { color: #6b7588; }
.is-select { height: 32px; padding: 0 8px; }
.is-textarea { resize: vertical; min-height: 66px; line-height: 1.55; }
.is-chip-row { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 12px 8px; }
.is-filter-chip {
  border: 1px solid var(--line); background: rgba(255,255,255,.03); color: var(--muted);
  border-radius: 999px; padding: 3px 9px; font-size: 11px; cursor: pointer;
}
.is-filter-chip.is-active { color: #dbe4ff; border-color: rgba(124,156,255,.5); background: rgba(124,156,255,.12); }

.is-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  border: 1px solid transparent; border-radius: 9px; padding: 6px 10px;
  font-size: 12px; cursor: pointer; color: var(--text); background: transparent;
  white-space: nowrap; transition: background .14s ease, border-color .14s ease, color .14s ease, transform .1s ease;
}
.is-btn:active { transform: translateY(1px); }
.is-btn:disabled { opacity: .45; cursor: not-allowed; }
.is-btn.is-primary {
  background: linear-gradient(135deg, #6f8cff, #9b6dff); border-color: transparent; color: #fff;
  box-shadow: 0 4px 14px rgba(110,120,255,.28);
}
.is-btn.is-primary:hover { filter: brightness(1.08); }
.is-btn.is-ghost { background: rgba(255,255,255,.045); border-color: var(--line2); }
.is-btn.is-ghost:hover { background: rgba(255,255,255,.08); }
.is-btn.is-soft { background: rgba(124,156,255,.12); border-color: rgba(124,156,255,.28); color: #cdd8ff; }
.is-btn.is-soft:hover { background: rgba(124,156,255,.2); }
.is-btn.is-danger { background: rgba(248,113,113,.12); border-color: rgba(248,113,113,.3); color: #fca5a5; }
.is-btn.is-danger:hover { background: rgba(248,113,113,.2); }
.is-btn.is-icon { width: 28px; height: 28px; padding: 0; flex: none; }
.is-btn.is-sm { padding: 4px 8px; font-size: 11px; border-radius: 7px; }

.is-card {
  margin: 0 12px 8px; border: 1px solid var(--line); border-radius: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,.018));
  display: flex; overflow: hidden; position: relative;
  transition: border-color .15s ease, background .15s ease, transform .15s ease;
}
.is-card:hover { border-color: rgba(124,156,255,.32); background: rgba(124,156,255,.06); }
.is-card.is-fav { border-color: rgba(251,191,36,.28); }
.is-card-main { flex: 1; min-width: 0; padding: 9px 4px 9px 11px; cursor: pointer; }
.is-card-name { display: flex; align-items: center; gap: 5px; font-weight: 600; font-size: 12.5px; }
.is-card-name .is-star { color: var(--warn); display: flex; }
.is-card-tags {
  color: #aab6cc; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 10.8px; line-height: 1.45; margin-top: 3px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  word-break: break-word;
}
.is-card-meta { display: flex; gap: 6px; align-items: center; margin-top: 5px; color: #6f7a8f; font-size: 10px; }
.is-badge { background: rgba(255,255,255,.06); border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; font-size: 9.5px; color: #a4aec2; }
.is-card-actions {
  display: flex; flex-direction: row; align-items: center; gap: 1px; padding: 4px 6px;
  opacity: .5; transition: opacity .15s ease;
}
.is-card:hover .is-card-actions { opacity: 1; }
.is-card-actions .is-btn { width: 26px; height: 26px; padding: 0; border-radius: 7px; color: #9aa6bd; }
.is-card-actions .is-btn.is-soft { color: #cdd8ff; }
.is-card-actions .is-btn svg { width: 14px; height: 14px; }
.is-empty { padding: 36px 20px; text-align: center; color: var(--muted); font-size: 12px; }
.is-empty strong { display: block; color: var(--text); font-size: 13px; margin-bottom: 4px; }
.is-empty .is-btn { margin-top: 12px; }
.is-foot-tip { padding: 8px 14px; border-top: 1px solid var(--line); color: #6f7a8f; font-size: 10.5px; display: flex; gap: 6px; align-items: center; }

.is-toast-wrap { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 6px; align-items: center; pointer-events: none; z-index: 30; }
.is-toast {
  max-width: 100%; padding: 8px 12px; border-radius: 10px; font-size: 12px;
  background: rgba(28,36,52,.96); border: 1px solid var(--line2); color: var(--text);
  box-shadow: 0 8px 24px rgba(0,0,0,.45); opacity: 0; transform: translateY(8px);
  transition: opacity .18s ease, transform .18s ease;
}
.is-toast.is-show { opacity: 1; transform: none; }
.is-toast.is-error { border-color: rgba(248,113,113,.5); color: #fecaca; }
.is-toast.is-success { border-color: rgba(74,222,128,.45); color: #bbf7d0; }
.is-toast.is-warn { border-color: rgba(251,191,36,.5); color: #fde68a; }

.is-modal-overlay {
  position: absolute; inset: 0; background: rgba(4,7,12,.66); backdrop-filter: blur(3px);
  display: flex; align-items: center; justify-content: center; padding: 18px; z-index: 40;
}
.is-modal {
  width: 100%; max-width: 360px; max-height: calc(100% - 24px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, #1b2333, #121822); border: 1px solid var(--line2);
  border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.6); overflow: hidden;
}
.is-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 12px; border-bottom: 1px solid var(--line); }
.is-modal-title { font-weight: 650; font-size: 13px; }
.is-modal-body { padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
.is-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--line); }
.is-field { display: flex; flex-direction: column; gap: 4px; }
.is-field-label { font-size: 11px; color: #aab6cc; }
.is-field-hint { font-size: 10px; color: #6f7a8f; }
.is-field .is-input, .is-field .is-select { height: 32px; }

.is-menu {
  position: absolute; z-index: 50; min-width: 150px; padding: 4px;
  pointer-events: auto;
  background: #1b2333; border: 1px solid var(--line2); border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,.55);
}
.is-menu-item {
  display: flex; align-items: center; gap: 7px; width: 100%; text-align: left;
  border: 0; background: transparent; color: var(--text); font-size: 12px;
  padding: 6px 8px; border-radius: 7px; cursor: pointer;
  white-space: nowrap;
}
.is-menu-item:hover { background: rgba(124,156,255,.14); }
.is-menu-item.is-danger { color: #fca5a5; }
.is-menu-item.is-danger:hover { background: rgba(248,113,113,.14); }

.is-section { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.is-section + .is-section { border-top: 1px solid var(--line); }
.is-section-title { font-size: 11px; font-weight: 650; letter-spacing: .4px; color: #aab6cc; text-transform: uppercase; }
.is-row { display: flex; gap: 8px; align-items: center; }
.is-row > * { min-width: 0; }
.is-seg { display: flex; background: rgba(255,255,255,.045); border: 1px solid var(--line2); border-radius: 9px; padding: 2px; }
.is-seg button { flex: 1; border: 0; background: transparent; color: var(--muted); font-size: 11.5px; padding: 5px 6px; border-radius: 7px; cursor: pointer; }
.is-seg button.is-on { background: rgba(124,156,255,.2); color: #dbe4ff; }
.is-switch { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
.is-switch input { appearance: none; width: 34px; height: 20px; border-radius: 999px; background: rgba(255,255,255,.14); position: relative; cursor: pointer; flex: none; transition: background .15s ease; }
.is-switch input::after { content: ""; position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: #cfd8ea; transition: transform .15s ease; }
.is-switch input:checked { background: linear-gradient(135deg, #6f8cff, #9b6dff); }
.is-switch input:checked::after { transform: translateX(14px); background: #fff; }
.is-hint { color: #6f7a8f; font-size: 10.5px; }
.is-code-inline { font-family: ui-monospace, Menlo, Consolas, monospace; background: rgba(255,255,255,.06); padding: 1px 5px; border-radius: 4px; font-size: 10.5px; }

/* chat */
.is-chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.is-chat-list { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px 4px; display: flex; flex-direction: column; gap: 10px; }
.is-msg { display: flex; flex-direction: column; gap: 6px; max-width: 100%; }
.is-msg.is-user { align-items: flex-end; }
.is-msg-bubble {
  max-width: 92%; padding: 8px 10px; border-radius: 12px; white-space: pre-wrap; word-break: break-word;
  font-size: 12px; line-height: 1.6;
}
.is-msg.is-user .is-msg-bubble { background: linear-gradient(135deg, rgba(111,140,255,.9), rgba(155,109,255,.9)); color: #fff; border-bottom-right-radius: 4px; }
.is-msg.is-assistant .is-msg-bubble { background: rgba(255,255,255,.05); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.is-msg.is-error .is-msg-bubble { background: rgba(248,113,113,.1); border-color: rgba(248,113,113,.35); color: #fecaca; }
.is-msg-meta { font-size: 9.5px; color: #6f7a8f; display: flex; gap: 6px; align-items: center; }
.is-typing { display: inline-flex; gap: 3px; align-items: center; }
.is-typing i { width: 4px; height: 4px; border-radius: 50%; background: #8e99ad; animation: is-blink 1.2s infinite; }
.is-typing i:nth-child(2) { animation-delay: .15s; }
.is-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes is-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }

.is-pack { width: 100%; border: 1px solid var(--line2); border-radius: 12px; background: rgba(255,255,255,.03); overflow: hidden; }
.is-pack-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--line); }
.is-pack-title { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.is-pack-rows { display: flex; flex-direction: column; }
.is-pack-row { padding: 7px 10px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 4px; }
.is-pack-row:last-child { border-bottom: 0; }
.is-pack-row-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.is-pack-label { font-size: 10px; color: #8e99ad; letter-spacing: .3px; }
.is-pack-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10.6px; line-height: 1.5;
  color: #c7d2e6; max-height: 96px; overflow-y: auto; white-space: pre-wrap; word-break: break-word;
  background: rgba(0,0,0,.22); border-radius: 7px; padding: 6px 7px;
}
.is-pack-notes { padding: 8px 10px; font-size: 11px; color: #9aa6ba; white-space: pre-wrap; border-top: 1px dashed var(--line); }
.is-pack-actions { display: flex; gap: 4px; flex-wrap: wrap; padding: 8px 10px; border-top: 1px solid var(--line); background: rgba(0,0,0,.12); }

.is-quick { display: flex; gap: 6px; flex-wrap: wrap; padding: 6px 12px 0; }
.is-quick .is-btn { font-size: 10.5px; padding: 4px 8px; }
.is-composer { border-top: 1px solid var(--line); padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.is-composer textarea {
  width: 100%; min-height: 56px; max-height: 140px; resize: none;
  background: rgba(255,255,255,.045); border: 1px solid var(--line2); border-radius: 10px;
  color: var(--text); padding: 8px 9px; font-size: 12px; line-height: 1.55; outline: none;
}
.is-composer textarea:focus { border-color: rgba(124,156,255,.65); }
.is-composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.is-composer-foot .is-hint { display: flex; align-items: center; gap: 6px; }
.is-chat-status { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-bottom: 1px solid var(--line); font-size: 10.5px; color: #8e99ad; }
.is-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--ok); flex: none; }
.is-dot.is-off { background: var(--warn); }
.is-dot.is-err { background: var(--danger); }
.is-config-warn { margin: 10px 12px; padding: 10px; border: 1px solid rgba(251,191,36,.35); background: rgba(251,191,36,.08); border-radius: 10px; font-size: 11.5px; color: #fde68a; display: flex; flex-direction: column; gap: 8px; }

.is-side-note { padding: 8px 12px; color: #6f7a8f; font-size: 10px; border-top: 1px solid var(--line); }
.is-kbd { border: 1px solid var(--line2); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; font-size: 9.5px; color: #9aa6ba; }

@media (max-width: 560px) {
  .is-panel { width: calc(100vw - 16px); right: 8px; top: 8px; height: calc(100vh - 16px); max-height: none; }
}
`;

  class StudioPanel {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.panelEl = null;
      this.launcherEl = null;
      this.toastWrap = null;
      this.state = {
        open: false,
        minimized: false,
        tab: 'artists',
        query: { artists: '', characters: '' },
        group: { artists: '', characters: '' },
        sort: { artists: 'uses', characters: 'uses' },
        settings: Store.defaultSettings(),
        artists: [],
        characters: [],
        chat: [],
        streaming: false,
        includeContext: true,
        lastError: ''
      };
      this.port = null;
      this.activeRequest = null;
      this.msgRefs = new Map();
      this._stylesInjected = false;
    }

    async init() {
      const s = await Store.load();
      this.applyState(s);
      this.state.tab = s.settings.lastTab || 'artists';
      this.state.open = false;
      this._autoOpen = s.settings.autoOpen !== false;
      this._autoOpened = false;
      this.mount();
      Store.subscribe((next) => this.onStoreChange(next));
      window.addEventListener('popstate', () => this.syncRoute());
      const timer = setInterval(() => this.syncRoute(), 1200);
      this._routeTimer = timer;
      setTimeout(() => this.syncRoute(), 800);
      return this;
    }

    applyState(s) {
      this.state.settings = s.settings;
      this.state.artists = s.artists || [];
      this.state.characters = s.characters || [];
      this.state.chat = (s.chat && Array.isArray(s.chat.messages) ? s.chat.messages : []).map((m) => ({
        ...m,
        streaming: false
      }));
    }

    onStoreChange(s) {
      const prevTab = this.state.tab;
      this.applyState(s);
      this.state.tab = prevTab;
      if (this.shadow) this.renderAll();
    }

    syncRoute() {
      const active = !!Adapter.promptSection();
      this.routeActive = active;
      if (active && this._autoOpen && !this._autoOpened && !this.state.open) {
        this._autoOpened = true;
        this.open();
        return;
      }
      if (this.launcherEl) this.launcherEl.classList.toggle('is-hidden', this.state.open);
    }

    mount() {
      const host = document.createElement('div');
      host.id = 'idlecloud-prompt-studio-host';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
      document.documentElement.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
      this.host = host;
      this.shadow = shadow;

      const root = h('div', { class: 'is-root' });
      shadow.appendChild(root);
      this.root = root;

      this.launcherEl = h(
        'button',
        {
          class: 'is-launcher',
          title: '提示词工坊 (Alt+Shift+N)',
          onClick: () => this.toggle()
        },
        [icon('sparkles', 24)]
      );
      root.appendChild(this.launcherEl);

      const panel = h('aside', { class: 'is-panel' });
      this.panelEl = panel;
      root.appendChild(panel);

      this.toastWrap = h('div', { class: 'is-toast-wrap' });
      panel.appendChild(this.toastWrap);

      panel.addEventListener('keydown', (e) => e.stopPropagation());
      this.renderAll();
      this.applyOpen();
      this.applyPanelPosition();
      window.addEventListener('resize', () => this.applyPanelPosition());
    }

    renderAll() {
      const panel = this.panelEl;
      if (!panel) return;
      const open = this.state.open;
      const min = this.state.minimized;
      panel.classList.toggle('is-open', open);
      panel.classList.toggle('is-min', min);
      this.launcherEl.classList.toggle('is-hidden', open);

      panel.innerHTML = '';
      panel.appendChild(this.buildHead());
      panel.appendChild(this.buildTabs());
      const body = h('div', { class: 'is-body' });
      panel.appendChild(body);
      panel.appendChild(this.toastWrap);

      if (this.state.tab === 'ai') body.appendChild(this.renderAI());
      else if (this.state.tab === 'settings') body.appendChild(this.renderSettings());
      else body.appendChild(this.state.tab === 'characters' ? this.renderCharacters() : this.renderArtists());
    }

    applyPanelPosition() {
      const panel = this.panelEl;
      if (!panel) return;
      const w = panel.offsetWidth || 414;
      const h = Math.min(panel.offsetHeight || 620, 620);
      const saved = this.state.settings.panelPos;
      // 默认贴在站点提示词栏左侧，避免挡住正向提示词输入框
      let x = saved && Number.isFinite(saved.x) ? saved.x : window.innerWidth - w - 448;
      let y = saved && Number.isFinite(saved.y) ? saved.y : 16;
      x = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - w - 8));
      y = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - h - 8));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
    }

    bindDrag(head) {
      head.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button')) return;
        const panel = this.panelEl;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const dx = e.clientX - rect.left;
        const dy = e.clientY - rect.top;
        head.classList.add('is-dragging');
        const move = (ev) => {
          const w = panel.offsetWidth;
          const h = panel.offsetHeight;
          const x = Math.min(Math.max(8, ev.clientX - dx), Math.max(8, window.innerWidth - w - 8));
          const y = Math.min(Math.max(8, ev.clientY - dy), Math.max(8, window.innerHeight - Math.min(h, 620) - 8));
          panel.style.left = x + 'px';
          panel.style.top = y + 'px';
        };
        const up = () => {
          head.classList.remove('is-dragging');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          const r = panel.getBoundingClientRect();
          Store.patchSettings({ panelPos: { x: Math.round(r.left), y: Math.round(r.top) } }).catch(() => {});
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        e.preventDefault();
      });
      head.addEventListener('dblclick', () => {
        Store.patchSettings({ panelPos: null }).catch(() => {});
        this.state.settings.panelPos = null;
        this.applyPanelPosition();
      });
    }

    applyOpen() {
      if (!this.panelEl) return;
      this.panelEl.classList.toggle('is-open', this.state.open);
      this.panelEl.classList.toggle('is-min', this.state.minimized);
      this.launcherEl?.classList.toggle('is-hidden', this.state.open);
    }

    toggle() {
      this.state.open = !this.state.open;
      this.applyOpen();
      if (this.state.open && !this.panelEl.dataset.built) {
        this.renderAll();
        this.panelEl.dataset.built = '1';
      }
      if (this.state.open) this.persistUi();
    }

    open(tab) {
      if (tab) this.state.tab = tab;
      this.state.open = true;
      this.state.minimized = false;
      this.renderAll();
      this.persistUi();
    }

    close() {
      this.state.open = false;
      this.applyOpen();
    }

    persistUi() {
      Store.patchSettings({
        lastTab: this.state.tab,
        autoOpen: this.state.settings.autoOpen
      }).catch(() => {});
    }

    buildHead() {
      const head = h('div', { class: 'is-head', title: '按住可拖动，双击复位' }, [
        h('div', { class: 'is-logo' }, [icon('sparkles', 17)]),
        h('div', { class: 'is-brand' }, [
          h('div', { class: 'is-title', text: 'IdleCloud 提示词工坊' }),
          h('div', {
            class: 'is-sub',
            text: this.routeActive ? '画师串 · 角色串 · AI 设计' : '等待绘图页 /main…'
          })
        ]),
        h('div', { class: 'is-head-actions' }, [
          iconButton('settings', {
            title: '管理工作台',
            onClick: () => {
              try {
                chrome.runtime.openOptionsPage();
              } catch (e) {
                this.showToast('无法打开管理页', 'error');
              }
            }
          }),
          iconButton('chevron', {
            title: '收起 / 展开',
            onClick: () => {
              this.state.minimized = !this.state.minimized;
              this.applyOpen();
            }
          }),
          iconButton('close', {
            title: '关闭',
            onClick: () => this.close()
          })
        ])
      ]);
      this.bindDrag(head);
      return head;
    }

    buildTabs() {
      const tabs = [
        { id: 'artists', label: '画师', iconName: 'brush', count: this.state.artists.length },
        { id: 'characters', label: '角色', iconName: 'user', count: this.state.characters.length },
        { id: 'ai', label: 'AI 设计', iconName: 'spark', count: null },
        { id: 'settings', label: '设置', iconName: 'settings', count: null }
      ];
      return h(
        'nav',
        { class: 'is-tabs' },
        tabs.map((t) =>
          h(
            'button',
            {
              class: 'is-tab' + (this.state.tab === t.id ? ' is-active' : ''),
              onClick: () => {
                this.state.tab = t.id;
                this.renderAll();
                this.persistUi();
              }
            },
            [
              icon(t.iconName, 14),
              h('span', { text: t.label }),
              t.count != null ? h('span', { class: 'is-count', text: String(t.count) }) : null
            ]
          )
        )
      );
    }

    // --------------------------------------------------------------- library
    groupsFor(kind) {
      const list = kind === 'artists' ? this.state.artists : this.state.characters;
      return Array.from(new Set(list.map((x) => x.group).filter(Boolean))).sort();
    }

    filtered(kind) {
      const q = (this.state.query[kind] || '').trim().toLowerCase();
      const group = this.state.group[kind] || '';
      const sort = this.state.sort[kind] || 'uses';
      let list = (kind === 'artists' ? this.state.artists : this.state.characters).slice();
      if (group) list = list.filter((x) => x.group === group);
      if (q) {
        list = list.filter((x) =>
          [x.name, x.tags, x.prompt, x.avoid, x.note, x.group]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
      }
      list.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        if (sort === 'name') return String(a.name).localeCompare(String(b.name), 'zh');
        if (sort === 'recent') return (b.updatedAt || 0) - (a.updatedAt || 0);
        return (Number(b.uses) || 0) - (Number(a.uses) || 0) || String(a.name).localeCompare(String(b.name), 'zh');
      });
      return list;
    }

    renderLibrary(kind) {
      const isArtist = kind === 'artists';
      const pane = h('div', { class: 'is-pane' });
      const toolbar = h('div', { class: 'is-toolbar' }, [
        h('div', { class: 'is-toolbar-row' }, [
          h('div', { class: 'is-search' }, [
            icon('search', 14),
            h('input', {
              class: 'is-input',
              placeholder: isArtist ? '搜索画师 / 标签 / 分组…' : '搜索角色 / 标签 / 分组…',
              value: this.state.query[kind],
              onInput: (e) => {
                this.state.query[kind] = e.target.value;
                this.refreshList(kind);
              }
            })
          ]),
          button(isArtist ? '新增' : '新增', {
            icon: 'plus',
            variant: 'primary',
            className: 'is-sm',
            onClick: () => this.openEditor(kind, null)
          })
        ]),
        h('div', { class: 'is-toolbar-row' }, [
          h(
            'select',
            {
              class: 'is-select',
              style: { flex: '1' },
              onChange: (e) => {
                this.state.group[kind] = e.target.value;
                this.refreshList(kind);
              }
            },
            [
              h('option', { value: '', text: '全部分组' }),
              ...this.groupsFor(kind).map((g) =>
                h('option', { value: g, text: g, selected: this.state.group[kind] === g })
              )
            ]
          ),
          h(
            'select',
            {
              class: 'is-select',
              style: { width: '96px', flex: 'none' },
              onChange: (e) => {
                this.state.sort[kind] = e.target.value;
                this.refreshList(kind);
              }
            },
            [
              h('option', { value: 'uses', text: '常用优先', selected: this.state.sort[kind] === 'uses' }),
              h('option', { value: 'recent', text: '最近使用', selected: this.state.sort[kind] === 'recent' }),
              h('option', { value: 'name', text: '按名称', selected: this.state.sort[kind] === 'name' })
            ]
          )
        ])
      ]);

      const listEl = h('div', { class: 'is-scroll', id: `is-list-${kind}` });
      this.fillList(listEl, kind);
      pane.appendChild(toolbar);
      pane.appendChild(listEl);
      pane.appendChild(
        h('div', { class: 'is-foot-tip' }, [
          icon('info', 12),
          h('span', {
            text: isArtist
              ? '点击卡片：追加到当前正向提示词；Alt+点击：覆盖。'
              : '点击卡片：填入角色框；Alt+点击：填入正向提示词。'
          })
        ])
      );
      return pane;
    }

    refreshList(kind) {
      const listEl = this.shadow?.getElementById(`is-list-${kind}`);
      if (listEl) this.fillList(listEl, kind);
    }

    fillList(listEl, kind) {
      listEl.innerHTML = '';
      const list = this.filtered(kind);
      if (!list.length) {
        const isArtist = kind === 'artists';
        listEl.appendChild(
          h('div', { class: 'is-empty' }, [
            h('strong', { text: isArtist ? '还没有画师串' : '还没有角色串' }),
            h('span', { text: isArtist ? '把常用的 artist:xxx 收藏到这里，一键填入正向提示词。' : '保存角色外观/服装/动作串，一键填入角色提示词框。' }),
            button(isArtist ? '新增画师串' : '新增角色串', {
              icon: 'plus',
              variant: 'soft',
              onClick: () => this.openEditor(kind, null)
            })
          ])
        );
        return;
      }
      list.forEach((item) => {
        listEl.appendChild(kind === 'artists' ? this.artistCard(item) : this.characterCard(item));
      });
    }

    artistCard(item) {
      const main = h(
        'div',
        {
          class: 'is-card-main',
          onClick: (e) => this.fillArtist(item, e.altKey ? 'replace' : this.state.settings.fillMode, 'positive'),
          title: '点击填入正向提示词'
        },
        [
          h('div', { class: 'is-card-name' }, [
            item.favorite ? h('span', { class: 'is-star' }, [icon('star', 11)]) : null,
            h('span', { text: item.name })
          ]),
          h('div', { class: 'is-card-tags', text: item.tags }),
          h('div', { class: 'is-card-meta' }, [
            item.group ? h('span', { class: 'is-badge', text: item.group }) : null,
            h('span', { text: `使用 ${Number(item.uses) || 0} 次` }),
            item.note ? h('span', { text: '· 有备注' }) : null
          ])
        ]
      );
      const actions = h('div', { class: 'is-card-actions' }, [
        iconButton('plus', {
          className: 'is-soft',
          title: '填入正向提示词',
          onClick: (e) => {
            e.stopPropagation();
            this.fillArtist(item, this.state.settings.fillMode, 'positive');
          }
        }),
        iconButton('copy', {
          title: '复制画师串',
          onClick: async (e) => {
            e.stopPropagation();
            const ok = await Adapter.copyText(item.tags);
            this.showToast(ok ? '已复制画师串' : '复制失败', ok ? 'success' : 'error');
          }
        }),
        iconButton('more', {
          className: 'is-icon',
          onClick: (e) => {
            e.stopPropagation();
            this.showMenu(e.currentTarget, item, 'artists');
          }
        })
      ]);
      return h('div', { class: 'is-card' + (item.favorite ? ' is-fav' : '') }, [main, actions]);
    }

    characterCard(item) {
      const preview = item.prompt || '';
      const meta = [
        item.group ? h('span', { class: 'is-badge', text: item.group }) : null,
        h('span', { text: `使用 ${Number(item.uses) || 0} 次` }),
        item.avoid ? h('span', { text: '· 含负面' }) : null,
        item.note ? h('span', { text: '· 有备注' }) : null
      ];
      const main = h(
        'div',
        {
          class: 'is-card-main',
          onClick: (e) =>
            e.altKey
              ? this.fillCharacter(item, this.state.settings.fillMode, 'positive')
              : this.fillCharacter(item, this.state.settings.fillMode, 'character'),
          title: '点击填入角色框，Alt+点击填入正向提示词'
        },
        [
          h('div', { class: 'is-card-name' }, [
            item.favorite ? h('span', { class: 'is-star' }, [icon('star', 11)]) : null,
            h('span', { text: item.name })
          ]),
          h('div', { class: 'is-card-tags', text: preview }),
          h('div', { class: 'is-card-meta' }, meta)
        ]
      );
      const actions = h('div', { class: 'is-card-actions' }, [
        iconButton('plus', {
          className: 'is-soft',
          title: '填入角色描述框',
          onClick: (e) => {
            e.stopPropagation();
            this.fillCharacter(item, this.state.settings.fillMode, 'character');
          }
        }),
        iconButton('copy', {
          title: '复制角色串',
          onClick: async (e) => {
            e.stopPropagation();
            const ok = await Adapter.copyText(item.prompt);
            this.showToast(ok ? '已复制角色串' : '复制失败', ok ? 'success' : 'error');
          }
        }),
        iconButton('more', {
          className: 'is-icon',
          onClick: (e) => {
            e.stopPropagation();
            this.showMenu(e.currentTarget, item, 'characters');
          }
        })
      ]);
      return h('div', { class: 'is-card' + (item.favorite ? ' is-fav' : '') }, [main, actions]);
    }

    renderArtists() {
      return this.renderLibrary('artists');
    }

    renderCharacters() {
      return this.renderLibrary('characters');
    }

    showMenu(anchor, item, kind) {
      this.shadow.querySelector('.is-menu')?.remove();
      const rect = anchor.getBoundingClientRect();
      const menu = h('div', { class: 'is-menu' });
      const add = (label, iconName, fn, danger) => {
        menu.appendChild(
          h(
            'button',
            {
              class: 'is-menu-item' + (danger ? ' is-danger' : ''),
              onClick: (e) => {
                e.stopPropagation();
                menu.remove();
                fn();
              }
            },
            [iconName ? icon(iconName, 13) : null, h('span', { text: label })]
          )
        );
      };
      if (kind === 'artists') {
        add('追加到正向', 'plus', () => this.fillArtist(item, 'append', 'positive'));
        add('覆盖正向', 'edit', () => this.fillArtist(item, 'replace', 'positive'));
        if (Adapter.promptTabs(Adapter.promptSection()).length > 1) {
          add('填入负面', 'spark', () => this.fillArtist(item, this.state.settings.fillMode, 'negative'));
        }
        add(item.favorite ? '取消收藏' : '收藏', 'star', () => this.toggleFavorite('artists', item));
      } else {
        add('填入角色框', 'user', () => this.fillCharacter(item, 'append', 'character'));
        add('填入正向', 'spark', () => this.fillCharacter(item, 'append', 'positive'));
        add('填入负面', 'copy', () => this.fillCharacter(item, this.state.settings.fillMode, 'negative'));
        add(item.favorite ? '取消收藏' : '收藏', 'star', () => this.toggleFavorite('characters', item));
      }
      add('编辑', 'edit', () => this.openEditor(kind, item));
      add('删除', 'trash', () => this.confirmDelete(kind, item), true);
      menu.style.left = Math.max(8, Math.min(rect.right - 140, window.innerWidth - 160)) + 'px';
      menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 180) + 'px';
      menu.style.position = 'fixed';
      this.shadow.querySelector('.is-root').appendChild(menu);
      setTimeout(() => {
        const off = (ev) => {
          const path = typeof ev.composedPath === 'function' ? ev.composedPath() : [];
          if (!path.includes(menu) && !menu.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('mousedown', off, true);
          }
        };
        document.addEventListener('mousedown', off, true);
      }, 0);
    }

    async toggleFavorite(kind, item) {
      const upd = { ...item, favorite: !item.favorite };
      if (kind === 'artists') await Store.upsertArtist(upd);
      else await Store.upsertCharacter(upd);
    }

    confirmDelete(kind, item) {
      const name = item.name;
      dialog(this.panelEl, {
        title: '删除确认',
        body: h('div', { class: 'is-hint', text: `确定删除「${name}」吗？此操作不可撤销。` }),
        confirmText: '删除',
        danger: true,
        onConfirm: async () => {
          if (kind === 'artists') await Store.removeArtist(item.id);
          else await Store.removeCharacter(item.id);
          this.showToast('已删除', 'success');
        }
      });
    }

    openEditor(kind, item) {
      const isArtist = kind === 'artists';
      const cur = item || {};
      const nameEl = input(cur.name || '', { placeholder: isArtist ? '例如：WLOP / 冷调厚涂' : '例如：银发红瞳少女' });
      const groupEl = input(cur.group || '', { placeholder: '分组（可选）' });
      const noteEl = textarea(cur.note || '', { rows: 2, placeholder: '备注（可选）' });
      let tagsEl;
      let avoidEl;
      if (isArtist) {
        tagsEl = textarea(cur.tags || '', { rows: 3, placeholder: 'artist:xxx, artist:yyy' });
      } else {
        tagsEl = textarea(cur.prompt || '', { rows: 6, placeholder: '角色提示词：1girl, silver hair, ...' });
        avoidEl = textarea(cur.avoid || '', { rows: 2, placeholder: '角色负面（可选）' });
      }
      const body = h('div', { class: 'is-modal-body' }, [
        field(isArtist ? '名称' : '角色名', nameEl),
        field(isArtist ? '画师串（英文标签）' : '角色提示词', tagsEl, isArtist ? '支持 artist:name、权重语法 1.2::tag::' : '会填入站点角色描述框'),
        !isArtist ? field('角色负面（可选）', avoidEl) : null,
        field('分组', groupEl),
        field('备注', noteEl)
      ]);
      dialog(this.panelEl, {
        title: item ? (isArtist ? '编辑画师串' : '编辑角色串') : isArtist ? '新增画师串' : '新增角色串',
        body,
        confirmText: '保存',
        onConfirm: async () => {
          const name = nameEl.value.trim();
          const tags = tagsEl.value.trim();
          if (!name && !tags) {
            this.showToast('名称和内容至少填一个', 'error');
            return false;
          }
          if (isArtist) {
            await Store.upsertArtist({
              ...item,
              name: name || tags.slice(0, 24),
              tags,
              group: groupEl.value.trim(),
              note: noteEl.value.trim()
            });
          } else {
            await Store.upsertCharacter({
              ...item,
              name: name || tags.slice(0, 24),
              prompt: tags,
              avoid: avoidEl.value.trim(),
              group: groupEl.value.trim(),
              note: noteEl.value.trim()
            });
          }
          this.showToast('已保存', 'success');
        }
      });
    }

    // ---------------------------------------------------------------- filling
    async fillArtist(item, mode, target) {
      const opts = { mode, separator: this.state.settings.separator };
      const res =
        target === 'negative'
          ? await Adapter.fillPrompt('negative', item.tags, opts)
          : await Adapter.fillPrompt('positive', item.tags, opts);
      this.afterFill(res, `画师串「${item.name}」`, target === 'negative' ? '负面提示词' : '正向提示词', item.id, 'artist');
    }

    async fillCharacter(item, mode, target) {
      const opts = { mode, separator: this.state.settings.separator };
      let res;
      if (target === 'character') res = await Adapter.fillCharacter(item.prompt, opts);
      else if (target === 'negative') res = await Adapter.fillPrompt('negative', item.prompt, opts);
      else res = await Adapter.fillPrompt('positive', item.prompt, opts);
      this.afterFill(res, `角色串「${item.name}」`, target === 'character' ? '角色框' : target === 'negative' ? '负面提示词' : '正向提示词', item.id, 'character');
      if (res && res.ok && target === 'character' && item.avoid) {
        const av = await Adapter.fillCharacter(item.avoid, {
          mode: 'append',
          separator: this.state.settings.separator,
          avoid: true
        });
        if (!av.ok) this.showToast('角色负面未填入：' + av.reason, 'warn');
      }
    }

    afterFill(res, label, where, id, kind) {
      if (res && res.ok) {
        if (res.duplicate) this.showToast('内容已在' + where + '中', 'warn');
        else this.showToast(`${label} 已填入${where}`, 'success');
        if (id) Store.markUsed(kind, id).catch(() => {});
      } else {
        this.showToast((res && res.reason) || '填入失败', 'error');
      }
    }

    showToast(message, type = 'info') {
      toast(this.toastWrap, message, type);
    }

    showTip(message) {
      this.showToast(message, 'info');
    }
  }

  globalThis.IdlePanel = StudioPanel;
})();
