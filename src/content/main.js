/*
 * IdleCloud 提示词工坊 — content 入口：挂载、路由监听、快捷键
 */
(function () {
  'use strict';
  if (globalThis.__idleStudioBooted) return;
  globalThis.__idleStudioBooted = true;
  if (window.top !== window) return;

  const StudioPanel = globalThis.IdlePanel;
  if (!StudioPanel) {
    console.warn('[IdleCloud Prompt Studio] panel module missing');
    return;
  }

  function isDrawPage() {
    const p = location.pathname.replace(/\/+$/, '') || '/';
    return p === '/main' || p === '/' || p.startsWith('/main/');
  }

  let panel = null;

  async function boot() {
    if (panel) return panel;
    document.documentElement.setAttribute('data-idle-prompt-studio', '1');
    panel = new StudioPanel();
    await panel.init();
    return panel;
  }

  // SPA 路由变化：/main 出现时才显示启动按钮，避免污染登录页
  let lastPath = location.pathname;
  function syncRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (panel && panel.setRouteVisible) panel.setRouteVisible(isDrawPage());
  }

  function watchHistory() {
    const wrap = (type) => {
      const orig = history[type];
      history[type] = function () {
        const out = orig.apply(this, arguments);
        setTimeout(syncRoute, 40);
        return out;
      };
    };
    wrap('pushState');
    wrap('replaceState');
    window.addEventListener('popstate', () => setTimeout(syncRoute, 40));
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'idle-studio:toggle') {
      boot().then((p) => p.toggle());
      sendResponse({ ok: true });
      return true;
    }
    if (msg && msg.type === 'idle-studio:open') {
      boot().then((p) => p.open());
      sendResponse({ ok: true });
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(), { once: true });
  } else {
    boot();
  }
  watchHistory();
  setInterval(syncRoute, 800);
})();
