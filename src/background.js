/*
 * IdleCloud 提示词工坊 — background service worker
 * 统一代理 LLM 请求（绕过 CORS），支持 OpenAI 兼容 / Anthropic，流式转发。
 */
'use strict';

const PORT_NAME = 'idle-studio-llm';
const controllers = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  let requestId = null;
  let controller = null;

  const cleanup = () => {
    if (requestId && controllers.get(requestId) === controller) controllers.delete(requestId);
    controller = null;
  };

  port.onMessage.addListener(async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'abort') {
      if (requestId === msg.requestId && controller) {
        try {
          controller.abort();
        } catch (e) {
          /* ignore */
        }
      }
      return;
    }
    if (msg.type !== 'start') return;

    requestId = msg.requestId;
    controller = new AbortController();
    controllers.set(requestId, controller);
    try {
      await runRequest(port, requestId, msg.payload || {}, controller.signal);
    } catch (e) {
      if (e && e.name === 'AbortError') {
        safePost(port, { type: 'error', requestId, message: '已停止生成' });
      } else {
        safePost(port, { type: 'error', requestId, message: errorMessage(e) });
      }
    } finally {
      cleanup();
    }
  });

  port.onDisconnect.addListener(() => {
    if (controller) {
      try {
        controller.abort();
      } catch (e) {
        /* ignore */
      }
    }
    cleanup();
  });
});

function safePost(port, msg) {
  try {
    port.postMessage(msg);
  } catch (e) {
    /* port closed */
  }
}

function errorMessage(e) {
  if (!e) return '未知错误';
  if (e.name === 'AbortError') return '已停止生成';
  if (e.name === 'TimeoutError') return '请求超时';
  return e.message || String(e);
}

// ------------------------------------------------------------------ 协议适配
function isAnthropic(provider, baseUrl) {
  if (provider === 'anthropic') return true;
  return /anthropic\.com/i.test(baseUrl || '') && !/\/chat\/completions/i.test(baseUrl || '');
}

function normalizeBase(baseUrl) {
  let base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('未配置 Base URL');
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  return base;
}

function endpointFor(payload) {
  const base = normalizeBase(payload.baseUrl);
  if (isAnthropic(payload.provider, base)) {
    if (/\/v1\/messages$/.test(base)) return { url: base, mode: 'anthropic' };
    return { url: base + '/messages', mode: 'anthropic' };
  }
  if (/\/chat\/completions$/.test(base)) return { url: base, mode: 'openai' };
  // 兼容用户把完整路径写在 Base URL 里
  if (/\/v1$/.test(base) || /\/api$/.test(base)) return { url: base + '/chat/completions', mode: 'openai' };
  return { url: base + '/chat/completions', mode: 'openai' };
}

function buildHeaders(payload, mode) {
  const headers = { 'Content-Type': 'application/json' };
  if (!payload.apiKey) return headers;
  if (mode === 'anthropic') {
    headers['x-api-key'] = payload.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else {
    headers['Authorization'] = 'Bearer ' + payload.apiKey;
    if (/openrouter\.ai/i.test(payload.baseUrl)) {
      headers['HTTP-Referer'] = 'https://nai.idlecloud.cc/';
      headers['X-Title'] = 'IdleCloud Prompt Studio';
    }
  }
  return headers;
}

function buildBody(payload, mode) {
  const messages = (payload.messages || []).filter((m) => m && m.content);
  if (mode === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }));
    const body = {
      model: payload.model,
      max_tokens: Number(payload.maxTokens) || 2200,
      temperature: Number(payload.temperature) || 0.7,
      stream: payload.stream !== false,
      messages: rest
    };
    if (system) body.system = system;
    return body;
  }
  return {
    model: payload.model,
    messages,
    temperature: Number(payload.temperature) || 0.7,
    max_tokens: Number(payload.maxTokens) || 2200,
    stream: payload.stream !== false
  };
}

async function runRequest(port, requestId, payload, outerSignal) {
  if (!payload.model) throw new Error('未配置模型名称');
  const { url, mode } = endpointFor(payload);
  const stream = payload.stream !== false;
  const timeoutMs = Number(payload.timeoutMs) || 120000;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  outerSignal.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(payload, mode),
      body: JSON.stringify(buildBody(payload, mode)),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', onAbort);
    if (e.name === 'AbortError') {
      const err = new Error('请求超时或被取消');
      err.name = 'TimeoutError';
      throw err;
    }
    throw new Error('网络请求失败：' + (e.message || e));
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', onAbort);
    throw new Error(httpError(resp.status, text));
  }

  if (!stream) {
    const data = await resp.json();
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', onAbort);
    const text = mode === 'anthropic' ? anthropicText(data) : openaiText(data);
    safePost(port, { type: 'delta', requestId, text });
    safePost(port, { type: 'done', requestId, text });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let acc = '';
  let aborted = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line || line.startsWith(':') || line.startsWith('event:')) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(data);
        } catch (e) {
          continue;
        }
        const piece = mode === 'anthropic' ? anthropicDelta(json) : openaiDelta(json);
        if (piece) {
          acc += piece;
          safePost(port, { type: 'delta', requestId, text: piece });
        }
      }
    }
    safePost(port, { type: 'done', requestId, text: acc });
  } catch (e) {
    if (e.name === 'AbortError') {
      aborted = true;
      safePost(port, { type: 'done', requestId, text: acc });
    } else {
      throw e;
    }
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch (e) {
      /* ignore */
    }
    if (aborted) {
      /* already posted */
    }
  }
}

function openaiDelta(json) {
  const choice = json && json.choices && json.choices[0];
  if (!choice) return '';
  return (choice.delta && choice.delta.content) || (choice.message && choice.message.content) || choice.text || '';
}

function openaiText(json) {
  const choice = json && json.choices && json.choices[0];
  if (!choice) return '';
  return (choice.message && choice.message.content) || choice.text || '';
}

function anthropicDelta(json) {
  if (!json) return '';
  if (json.type === 'content_block_delta') {
    const d = json.delta || {};
    if (d.type === 'text_delta') return d.text || '';
    return '';
  }
  if (json.type === 'content_block_start') {
    const b = json.content_block || {};
    return b.type === 'text' ? b.text || '' : '';
  }
  return '';
}

function anthropicText(json) {
  if (!json) return '';
  return (json.content || [])
    .map((b) => (b && b.type === 'text' ? b.text : ''))
    .join('');
}

function httpError(status, body) {
  let detail = '';
  try {
    const json = JSON.parse(body);
    detail = (json.error && (json.error.message || json.error)) || json.message || '';
    if (typeof detail === 'object') detail = JSON.stringify(detail);
  } catch (e) {
    detail = String(body || '').slice(0, 300);
  }
  const suffix = detail ? '：' + detail : '';
  if (status === 401 || status === 403) return `鉴权失败 (${status})${suffix}`;
  if (status === 404) return `接口地址不存在 (404)${suffix}`;
  if (status === 429) return `请求被限流 (429)${suffix}`;
  return `接口返回 ${status}${suffix}`;
}

// 测试连接：非流式，取极小响应
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'llm:test') return;
  (async () => {
    try {
      const payload = Object.assign({}, msg.payload, { stream: false, maxTokens: 32, timeoutMs: 30000 });
      const { url, mode } = endpointFor(payload);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(payload, mode),
        body: JSON.stringify(buildBody(payload, mode)),
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await resp.text();
      if (!resp.ok) {
        sendResponse({ ok: false, error: httpError(resp.status, text) });
        return;
      }
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        /* ignore */
      }
      const out = json ? (mode === 'anthropic' ? anthropicText(json) : openaiText(json)) : '';
      sendResponse({ ok: true, detail: out ? `模型回复「${out.slice(0, 40)}」` : '接口可用' });
    } catch (e) {
      sendResponse({ ok: false, error: e.name === 'AbortError' ? '连接超时' : e.message || String(e) });
    }
  })();
  return true;
});

function sendToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id || !/^https:\/\/nai\.idlecloud\.cc\//.test(tab.url || '')) return;
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  });
}

chrome.action.onClicked.addListener(() => sendToActiveTab({ type: 'idle-studio:toggle' }));

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-panel') sendToActiveTab({ type: 'idle-studio:toggle' });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get('idle_studio_v1').then((res) => {
      if (!res || !res.idle_studio_v1) {
        // 首次安装：写入示例库
        chrome.runtime.sendMessage({ type: 'noop' }).catch(() => {});
      }
    });
  }
});
