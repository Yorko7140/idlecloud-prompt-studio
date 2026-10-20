/*
 * 端到端冒烟测试：真实 Chromium 加载扩展 + 模拟绘图页 DOM + mock LLM。
 * 运行：node tests/run.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start as startMockLLM } from './mock-llm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME =
  process.env.CHROME_PATH || '/home/administrator/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const FIXTURE_PORT = 8123;
const LLM_PORT = 8124;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function buildTestExtension() {
  const out = path.join(os.tmpdir(), 'idle-studio-test-ext');
  rmrf(out);
  fs.mkdirSync(out, { recursive: true });
  const copy = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (path.basename(src) === 'tests' || path.basename(src) === '.git') return;
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) copy(path.join(src, entry), path.join(dest, entry));
    } else {
      fs.copyFileSync(src, dest);
    }
  };
  for (const entry of fs.readdirSync(ROOT)) {
    if (entry === 'tests' || entry === '.git' || entry === 'node_modules') continue;
    copy(path.join(ROOT, entry), path.join(out, entry));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  manifest.host_permissions = manifest.host_permissions.concat([
    `http://127.0.0.1:${LLM_PORT}/*`,
    `http://localhost:${LLM_PORT}/*`
  ]);
  manifest.content_scripts[0].matches = [
    `http://127.0.0.1:${FIXTURE_PORT}/*`,
    `http://localhost:${FIXTURE_PORT}/*`
  ];
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return out;
}

function serveFixture() {
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? '/fixture.html' : req.url.split('?')[0];
    const full = path.join(__dirname, file);
    if (!full.startsWith(__dirname) || !fs.existsSync(full)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(full));
  });
  return new Promise((resolve) => server.listen(FIXTURE_PORT, '127.0.0.1', () => resolve(server)));
}

async function waitJson(url, timeoutMs = 15000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {
      /* retry */
    }
    if (Date.now() - started > timeoutMs) throw new Error('timeout waiting ' + url);
    await new Promise((r) => setTimeout(r, 200));
  }
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.listeners = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        this.listeners.forEach((fn) => fn(msg));
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
  const extDir = buildTestExtension();
  const fixtureServer = await serveFixture();
  const { server: llmServer } = await startMockLLM(LLM_PORT);
  const profile = path.join(os.tmpdir(), 'idle-studio-chrome-profile');
  rmrf(profile);

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
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--remote-debugging-port=9223',
      'about:blank'
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  chrome.stderr.on('data', (d) => {
    const s = String(d);
    if (/error/i.test(s) && !/DevTools listening/.test(s)) process.stderr.write('[chrome] ' + s);
  });

  const cleanup = async () => {
    try {
      chrome.kill('SIGKILL');
    } catch (e) {
      /* ignore */
    }
    fixtureServer.close();
    llmServer.close();
  };

  try {
    const version = await waitJson('http://127.0.0.1:9223/json/version');
    const cdp = new CDP(version.webSocketDebuggerUrl);
    await cdp.ready;

    const pageUrl = `http://127.0.0.1:${FIXTURE_PORT}/fixture.html`;
    const { targetId } = await cdp.send('Target.createTarget', { url: pageUrl });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    const consoleErrors = [];
    cdp.listeners.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(JSON.stringify(msg.params));
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
        consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
    });

    const evaluate = async (expr) => {
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true },
        sessionId
      );
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
      return res.result.value;
    };
    const waitFor = async (expr, timeoutMs = 15000, label = expr) => {
      const started = Date.now();
      for (;;) {
        const v = await evaluate(expr).catch(() => false);
        if (v) return v;
        if (Date.now() - started > timeoutMs) throw new Error('timeout: ' + label);
        await new Promise((r) => setTimeout(r, 150));
      }
    };

    // 1. 面板挂载
    await waitFor(
      `!!document.getElementById('idlecloud-prompt-studio-host')?.shadowRoot?.querySelector('.is-panel')`,
      20000,
      'panel mounted'
    );
    check('content script 注入 & 面板挂载', true);

    // 2. 自动展开
    await waitFor(
      `document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-panel').classList.contains('is-open')`,
      8000,
      'panel auto open'
    );
    check('检测到绘图页后自动展开面板', true);

    // 3. 画师库种子
    const artistCount = await evaluate(
      `document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelectorAll('.is-card').length`
    );
    check('画师串种子库渲染', artistCount >= 10, `cards=${artistCount}`);

    // 4. 一键填充画师串
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const card = [...root.querySelectorAll('.is-card')].find((c) => c.querySelector('.is-card-name')?.textContent.includes('WLOP'));
      card.querySelector('.is-card-actions button').click();
      return true;
    })()`);
    const posVal = await waitFor(
      `(document.getElementById('prompt-positive').value.includes('artist:wlop') && document.getElementById('prompt-positive').value) || ''`,
      6000,
      'artist filled'
    );
    check('点击画师卡 -> 填入正向提示词', !!posVal, JSON.stringify(String(posVal).slice(0, 40)));

    // 5. 追加去重
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const card = [...root.querySelectorAll('.is-card')].find((c) => c.querySelector('.is-card-name')?.textContent.includes('WLOP'));
      card.querySelector('.is-card-actions button').click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 600));
    const dupCount = await evaluate(
      `(document.getElementById('prompt-positive').value.match(/artist:wlop/g) || []).length`
    );
    check('重复填充自动去重', dupCount === 1, `occurrences=${dupCount}`);

    // 6. 角色卡 -> 角色框
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      [...root.querySelectorAll('.is-tab')].find((t) => t.textContent.includes('角色')).click();
      return true;
    })()`);
    await waitFor(
      `(() => { const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; return [...root.querySelectorAll('.is-tab')].some((t) => t.classList.contains('is-active') && t.textContent.includes('角色')); })()`,
      5000,
      'character tab'
    );
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const cards = [...root.querySelectorAll('.is-card')];
      const btn = [...cards[0].querySelectorAll('button')].find(
        (b) => (b.getAttribute('title') || b.textContent).includes('角色')
      );
      btn.click();
      return true;
    })()`);
    const charVal = await waitFor(
      `(() => { const ta = document.querySelector('#characters textarea'); return ta && ta.value ? ta.value : ''; })()`,
      6000,
      'character filled'
    );
    check('角色卡 -> 填入角色描述框', String(charVal).includes('1girl'), JSON.stringify(String(charVal).slice(0, 40)));

    // 7. 通过设置页配置 mock LLM
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      [...root.querySelectorAll('.is-tab')].find((t) => t.textContent.includes('设置')).click();
      return true;
    })()`);
    await waitFor(
      `!!document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('input[placeholder="https://api.openai.com/v1"]')`,
      6000,
      'settings pane'
    );
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const setVal = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      setVal(root.querySelector('input[placeholder="https://api.openai.com/v1"]'), 'http://127.0.0.1:${LLM_PORT}/v1');
      setVal(root.querySelector('input[type="password"]'), 'test-key');
      setVal(root.querySelector('input[placeholder="gpt-4o-mini"]'), 'mock-model');
      [...root.querySelectorAll('button')].find((b) => b.textContent.includes('保存设置')).click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 800));
    const savedBase = await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const el = root.querySelector('input[placeholder="https://api.openai.com/v1"]');
      return el ? el.value : '';
    })()`);
    const qualityFilled = await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      return [...root.querySelectorAll('textarea')].map((t) => t.value).find((v) => v.includes('best quality')) || '';
    })()`);
    check('设置页回填默认质量词', !!qualityFilled, qualityFilled.slice(0, 30));
    check('设置页保存 LLM 配置', String(savedBase).includes('127.0.0.1'), savedBase);

    // 8. AI 设计对话（真实走 background -> mock SSE -> 结构化方案）
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      [...root.querySelectorAll('.is-tab')].find((t) => t.textContent.includes('AI 设计')).click();
      return true;
    })()`);
    await waitFor(
      `!!document.getElementById('idlecloud-prompt-studio-host').shadowRoot.getElementById('is-composer-input')`,
      6000,
      'composer'
    );
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const ta = root.getElementById('is-composer-input');
      ta.value = '银发红瞳的剑士少女，雨夜霓虹街头，电影感';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const btn = [...root.querySelectorAll('.is-composer button')].find((b) => b.textContent.includes('发送'));
      btn.click();
      return true;
    })()`);
    const packText = await waitFor(
      `(() => { const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const p = root.querySelector('.is-pack'); return p ? p.textContent : ''; })()`,
      25000,
      'ai pack rendered'
    );
    check('自然语言设计 -> 返回结构化方案卡片', String(packText).includes('雨夜霓虹剑士'), String(packText).slice(0, 60));

    // 9. 一键填入全部（质量词 + 角色）
    await evaluate(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const btn = [...root.querySelectorAll('.is-pack-actions button')].find((b) => b.textContent.includes('填入全部'));
      btn.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 1800));
    const finalPos = await evaluate(`document.getElementById('prompt-positive').value`);
    const finalChar = await evaluate(`document.querySelector('#characters textarea').value`);
    check('方案「填入全部」写入正向提示词并追加质量词', finalPos.includes('best quality') && finalPos.includes('neon'), String(finalPos).slice(0, 60));
    check(
      '方案「填入全部」写入角色框',
      finalChar.includes('black coat'),
      String(finalChar).slice(-60)
    );

    // 9.5 异形结构兜底：没有 .prompt-editor-input 时，填入最后聚焦的 textarea
    const { targetId: altTarget } = await cdp.send('Target.createTarget', {
      url: `http://127.0.0.1:${FIXTURE_PORT}/fixture-atypical.html`
    });
    const { sessionId: altSession } = await cdp.send('Target.attachToTarget', { targetId: altTarget, flatten: true });
    await cdp.send('Runtime.enable', {}, altSession);
    const altEval = async (expr) => {
      const res = await cdp.send(
        'Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true },
        altSession
      );
      if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
      return res.result.value;
    };
    const altWait = async (expr, timeoutMs = 15000) => {
      const started = Date.now();
      for (;;) {
        const v = await altEval(expr).catch(() => false);
        if (v) return v;
        if (Date.now() - started > timeoutMs) return null;
        await new Promise((r) => setTimeout(r, 200));
      }
    };
    const altMounted = await altWait(
      `!!document.getElementById('idlecloud-prompt-studio-host')?.shadowRoot?.querySelector('.is-launcher')`
    );
    check('异形页 content script 注入', !!altMounted);
    const altClosed = await altEval(
      `!document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-panel').classList.contains('is-open')`
    );
    check('无提示词结构时不自动弹窗', altClosed === true);
    await altEval(`document.getElementById('plain-prompt').focus(); true`);
    await altEval(
      `document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-launcher').click(); true`
    );
    await altWait(
      `document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-panel').classList.contains('is-open')`
    );
    await altEval(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const tab = [...root.querySelectorAll('.is-tab')].find((t) => t.textContent.includes('画师'));
      if (tab) tab.click();
      return true;
    })()`);
    await altEval(`(() => {
      const root = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
      const card = [...root.querySelectorAll('.is-card')].find((c) => c.querySelector('.is-card-name')?.textContent.includes('WLOP'));
      card.querySelector('.is-card-actions button').click();
      return true;
    })()`);
    const altFilled = await altWait(
      `(() => { const el = document.getElementById('plain-prompt'); return el.value.includes('artist:wlop') ? el.value : ''; })()`,
      6000
    );
    check('结构不匹配时回退到最后聚焦的输入框', !!altFilled, String(altFilled).slice(0, 40));
    await cdp.send('Target.closeTarget', { targetId: altTarget });

    // 10. MaiBot TOML 导入（在工作台页面的主世界直接跑导入管线）
    const targets = await waitJson('http://127.0.0.1:9223/json/list');
    const sw = targets.find((t) => t.type === 'service_worker' && t.url.includes('chrome-extension://'));
    if (!sw) {
      check('找到扩展 service worker', false);
    } else {
      const extId = sw.url.split('/')[2];
      const optUrl = `chrome-extension://${extId}/src/options/options.html`;
      const { targetId: optTarget } = await cdp.send('Target.createTarget', { url: optUrl });
      const { sessionId: optSession } = await cdp.send('Target.attachToTarget', { targetId: optTarget, flatten: true });
      await cdp.send('Runtime.enable', {}, optSession);
      const optEval = async (expr) => {
        const res = await cdp.send(
          'Runtime.evaluate',
          { expression: expr, awaitPromise: true, returnByValue: true },
          optSession
        );
        if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
        return res.result.value;
      };
      const ready = await (async () => {
        for (let i = 0; i < 40; i += 1) {
          const ok = await optEval(`typeof IdleToml !== 'undefined' && typeof IdleStore !== 'undefined'`).catch(() => false);
          if (ok) return true;
          await new Promise((r) => setTimeout(r, 200));
        }
        return false;
      })();
      check('工作台页面加载 store/toml', ready);
      const renderedCards = await (async () => {
        for (let i = 0; i < 20; i += 1) {
          const n = await optEval(`document.querySelectorAll('#artist-list .item').length`).catch(() => 0);
          if (n > 0) return n;
          await new Promise((r) => setTimeout(r, 150));
        }
        return 0;
      })();
      check(
        '工作台渲染画师串卡片',
        renderedCards > 0,
        `cards=${renderedCards} count=${await optEval(`document.getElementById('artist-count').textContent`)}`
      );
      const sampleToml = [
        'schema_version = 1',
        '',
        '[primary]',
        'model = "nai-diffusion-5-full"',
        '',
        '[primary.styles]',
        'default = "artist:kazutake_hazano, artist:fujiyama, Klaius"',
        '',
        '[[characters]]',
        'id = "toml_test"',
        'name = "测试角色"',
        'prompt = "1girl, silver hair, red eyes"',
        'negative = "bad hands"',
        'default_outfit = "black coat"',
        ''
      ].join('\n');
      const report = await optEval(`(async () => {
        const file = new File([${JSON.stringify(sampleToml)}], 'character_cards.toml', { type: 'text/plain' });
        return await IdleToml.importFiles(IdleStore, [file]);
      })()`);
      check('TOML 导入解析出画师串', report.artists >= 1, JSON.stringify(report));
      check('TOML 导入解析出角色卡', report.characters >= 1, JSON.stringify(report));
      const importedChar = await optEval(`(async () => {
        const list = await IdleStore.listCharacters();
        const c = list.find((x) => x.name === '测试角色');
        return c ? { prompt: c.prompt, avoid: c.avoid } : { names: list.map((x) => x.name).slice(0, 12) };
      })()`);
      check(
        '角色卡字段正确（prompt+outfit / avoid）',
        !!importedChar && String(importedChar.prompt || '').includes('black coat') && String(importedChar.avoid || '').includes('bad hands'),
        JSON.stringify(importedChar)
      );
      await cdp.send('Target.closeTarget', { targetId: optTarget });
    }

    check('无未捕获异常 / console.error', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  } finally {
    await cleanup();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error('E2E 运行失败：', e);
  process.exitCode = 1;
});
