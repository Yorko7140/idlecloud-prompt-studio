/*
 * 动态域名授权：LLM Base URL 可能是任意第三方服务（OpenAI / DeepSeek / 中转…）。
 * 扩展只在用户主动保存或点击授权时，按需申请对应域名的 host 权限，避免申请 <all_urls>。
 * 注意：chrome.permissions.request 必须在扩展页面（options）的用户手势中调用，
 * 所以这里只负责 contains / request 的封装，由 options 页的点击事件触发。
 */
(function () {
  'use strict';

  const NS = {};

  function originPattern(url) {
    try {
      const u = new URL(String(url || '').trim());
      if (!/^https?:$/.test(u.protocol)) return null;
      return `${u.protocol}//${u.host}/*`;
    } catch (e) {
      return null;
    }
  }

  function available() {
    return typeof chrome !== 'undefined' && !!chrome.permissions;
  }

  async function contains(url) {
    if (!available()) return true;
    const pattern = originPattern(url);
    if (!pattern) return false;
    try {
      return await chrome.permissions.contains({ origins: [pattern] });
    } catch (e) {
      return false;
    }
  }

  // 必须在点击事件里同步链路调用（中间不要 await 其它异步动作太多）
  async function request(url) {
    if (!available()) return true;
    const pattern = originPattern(url);
    if (!pattern) return false;
    try {
      if (await chrome.permissions.contains({ origins: [pattern] })) return true;
      return await chrome.permissions.request({ origins: [pattern] });
    } catch (e) {
      return false;
    }
  }

  Object.assign(NS, { originPattern, contains, request, available });
  globalThis.IdlePerm = NS;
})();
