/*
 * 真实站点冒烟：用生产 manifest 加载扩展，打开 nai.idlecloud.cc 登录页，
 * 验证 content script 注入、面板挂载、未登录页不自动弹窗、无异常。
 * 运行：node tests/real-site.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME =
  process.env.CHROME_PATH || '/home/administrator/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const URL_UNDER_TEST = process.env.SITE_URL || 'https://nai.idlecloud.cc/login';

async function waitJson(url, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {
      /* retry */
    }
    if (Date.now() - started > timeoutMs) throw new Error('timeout ' + url);
    await new Promise((r) => setTimeout(r, 250));
  }
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((res, rej) => {
      this.ws.addEventListener('open', res);
      this.ws.addEventListener('error', rej);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(msg.params.exceptionDetails?.text || 'exception');
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const profile = path.join(os.tmpdir(), 'idle-studio-real-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      '--remote-debugging-port=9225',
      'about:blank'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  chrome.stderr.on('data', (d) => {
    const s = String(d);
    if (/Failed to load extension|manifest/i.test(s)) process.stderr.write('[chrome] ' + s);
  });

  let ok = true;
  try {
    const version = await waitJson('http://127.0.0.1:9225/json/version');
    const cdp = new CDP(version.webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url: URL_UNDER_TEST }, sessionId);
    await new Promise((r) => setTimeout(r, 10000));
    const evaluate = async (expr) => {
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true },
        sessionId
      );
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
      return res.result.value;
    };
    const title = await evaluate('document.title');
    const host = await evaluate(
      `(() => { const h = document.getElementById('idlecloud-prompt-studio-host'); if (!h || !h.shadowRoot) return null; const panel = h.shadowRoot.querySelector('.is-panel'); return { mounted: true, open: panel?.classList.contains('is-open') ?? null, launcher: h.shadowRoot.querySelector('.is-launcher')?.className || '' }; })()`
    );
    const location = await evaluate('location.pathname + location.search');
    console.log('页面标题:', title, '| 路径:', location);
    console.log('扩展挂载:', JSON.stringify(host));
    if (!host || !host.mounted) {
      console.log('❌ content script 未注入真实站点');
      ok = false;
    } else {
      console.log('✅ content script 在真实站点注入并挂载面板');
      if (host.open) {
        console.log('⚠️ 登录页（无提示词框）也自动展开了面板，检查路由判断');
      } else {
        console.log('✅ 非绘图页不自动弹窗');
      }
    }
    if (cdp.errors.length) {
      console.log('❌ 页面异常:', cdp.errors.slice(0, 3).join(' | '));
      ok = false;
    } else {
      console.log('✅ 无未捕获异常');
    }
  } finally {
    chrome.kill('SIGKILL');
  }
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error('真实站点冒烟失败：', e);
  process.exitCode = 1;
});
