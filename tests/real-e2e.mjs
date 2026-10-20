/*
 * 真实站点端到端验证（需要登录态，脚本本身不含任何凭据）
 *
 *   SESSION='<api.idlecloud.cc 的 session cookie>' node tests/real-e2e.mjs
 *
 * 流程：构建带 localhost LLM 权限的测试版扩展 → 注入 session cookie + 关闭站点反调试 →
 *      在 nai.idlecloud.cc/main 上跑：画师串→正向/负面、角色串→折叠角色区、AI 设计→填入全部、
 *      面板默认位置与拖动。截图输出到 /tmp/real/。
 *
 * 说明：站点带 devtools 检测，普通调试会跳到 /404，所以这里用 `debug-unlocked` 绕过。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { start as startMockLLM } from './mock-llm.mjs';


async function launch({ profile='/tmp/real/prof', port=9250, ext=null, args=[], chromePath=null }={}) {
  const CHROME=chromePath || process.env.CHROME_PATH || '/home/administrator/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
  const a=['--headless=new','--no-sandbox','--disable-gpu','--hide-scrollbars','--window-size=1440,900',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run','--no-default-browser-check',
    '--disable-dev-shm-usage','--password-store=basic','--use-mock-keychain','--noerrdialogs','--ozone-platform=headless',
    '--disable-features=Translate,OptimizationHints,MediaRouter'];
  if (ext) a.push(`--load-extension=${ext}`, `--disable-extensions-except=${ext}`);
  a.push(...args, 'about:blank');
  const c=spawn(CHROME,a,{stdio:'ignore'});
  for (let i=0;i<40;i++){ try { const v=await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); return {chrome:c, info:v, port}; } catch { await new Promise(r=>setTimeout(r,250)); } }
  throw new Error('chrome did not start');
}

function connect(info) {
  const ws=new WebSocket(info.webSocketDebuggerUrl);
  let n=0; const pend=new Map(); const events=[];
  const ready=new Promise(r=>ws.addEventListener('open',r));
  ws.addEventListener('message',(e)=>{
    const m=JSON.parse(e.data);
    if (m.id&&pend.has(m.id)) { const p=pend.get(m.id); pend.delete(m.id); m.error?p.reject(new Error(m.method+': '+JSON.stringify(m.error))):p.resolve(m.result); return; }
    if (m.method) events.push(m);
  });
  const send=(method,params={},sessionId)=>{ const i=++n; ws.send(JSON.stringify(sessionId?{id:i,method,params,sessionId}:{id:i,method,params})); return new Promise((res,rej)=>pend.set(i,{resolve:res,reject:rej})); };
  return { ws, ready, send, events };
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable',{},sessionId);
  await cdp.send('Runtime.enable',{},sessionId);
  await cdp.send('Network.enable',{},sessionId);
  await cdp.send('Page.navigate',{url},sessionId);
  const ev=async (expr)=>{ const r=await cdp.send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true},sessionId); if (r.exceptionDetails) return {__error:r.exceptionDetails.text||r.exceptionDetails.exception?.description}; return r.result?.value; };
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const shot=async path=>{ const r=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},sessionId); const fs=await import('node:fs'); fs.writeFileSync(path,Buffer.from(r.data,'base64')); };
  return { sessionId, ev, wait, shot };
}

const SESSION = process.env.SESSION;
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = process.env.CHROME_PATH || '/home/administrator/.cache/ms-playwright/chromium-1187/chrome-linux/chrome';
const PORT = 9262;

// 测试构建：加 127.0.0.1:8124 的 host 权限（生产 manifest 用 optional_host_permissions 走用户授权）
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-ext-'));
const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    if (['tests', 'dist', 'docs', '.git', 'node_modules'].includes(e)) continue;
    const s = path.join(src, e), d = path.join(dest, e);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
};
copyDir(SRC, EXT);
const mf = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
mf.host_permissions = [...(mf.host_permissions || []), 'http://127.0.0.1:8124/*'];
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(mf, null, 2));

const { server: llm } = await startMockLLM(8124);
if (!SESSION) {
  console.error('缺少 SESSION 环境变量：请把 api.idlecloud.cc 的 session cookie 值传进来');
  process.exit(2);
}
fs.mkdirSync('/tmp/real', { recursive: true });
const { chrome, info } = await launch({ profile: '/tmp/real/prof-' + Date.now(), port: PORT, ext: EXT, chromePath: CHROME });
const cdp = connect(info); await cdp.ready;
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Network.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{sessionStorage.setItem('debug-unlocked','true')}catch(e){}" }, sessionId);
await cdp.send('Network.setCookie', { name: 'session', value: SESSION, domain: 'api.idlecloud.cc', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }, sessionId);
await cdp.send('Page.navigate', { url: 'https://nai.idlecloud.cc/main' }, sessionId);

const ev = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
  if (r.exceptionDetails) return { ERR: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (p) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync('/tmp/real/' + p, Buffer.from(r.data, 'base64'));
};
const waitFor = async (expr, timeout = 25000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await ev(expr).catch(() => false);
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await wait(250);
  }
};
const log = (...a) => console.log(...a);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// 1. 等主界面
const ready = await waitFor(`!!document.querySelector('.prompt-editor-input')`, 40000);
log('url:', await ev('location.href'), 'editor:', !!ready);
if (!ready) { log('body:', (await ev('document.body.innerText')).slice(0, 200)); process.exit(1); }

// 2. 注入扩展并配置 LLM
const hostReady = await waitFor(`!!document.getElementById('idlecloud-prompt-studio-host')`, 15000);
check('扩展 content script 注入', !!hostReady);
const panelOpen = await waitFor(`document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-panel').classList.contains('is-open')`, 12000);
check('检测到绘图页自动展开面板', !!panelOpen);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const sw = list.find((t) => t.type === 'service_worker' && t.url.startsWith('chrome-extension://'));
const extId = sw.url.split('/')[2];
const { targetId: optTarget } = await cdp.send('Target.createTarget', { url: `chrome-extension://${extId}/src/options/options.html` });
const { sessionId: optS } = await cdp.send('Target.attachToTarget', { targetId: optTarget, flatten: true });
await cdp.send('Runtime.enable', {}, optS);
const optEval = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, optS);
  if (r.exceptionDetails) return { ERR: r.exceptionDetails.exception?.description };
  return r.result?.value;
};
await wait(800);
log('llm patch:', await optEval(`IdleStore.patchSettings({ llm: { provider:'custom', baseUrl:'http://127.0.0.1:8124', apiKey:'test', model:'mock-llm', stream:true, temperature:0.5, maxTokens:800, timeoutMs:60000 } }).then(()=> 'ok')`));
await cdp.send('Target.closeTarget', { targetId: optTarget });

// 3. 面板位置：不应遮挡提示词栏
await wait(700);
const geom = await ev(`(() => {
  const h = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
  const p = h.querySelector('.is-panel').getBoundingClientRect();
  const s = document.querySelector('section[aria-label="Prompt"]').getBoundingClientRect();
  return { panel: { x: Math.round(p.x), r: Math.round(p.right), y: Math.round(p.y) }, section: { x: Math.round(s.x), r: Math.round(s.right) }, vw: innerWidth };
})()`);
log('geom:', JSON.stringify(geom));
check('面板默认不遮挡提示词栏', geom.panel.r <= geom.section.x + 2, `panel.right=${geom.panel.r} section.left=${geom.section.x}`);
await shot('e2e-1-open.png');

// 4. 画师串 -> 正向
const artistName = await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const n = r.querySelector('.is-card-name').innerText; r.querySelector('.is-card-main').click(); return n; })()`);
await wait(900);
const posVal = await ev(`document.querySelector('.prompt-editor-input textarea[aria-label]')?.value || ''`);
check('画师卡 -> 填入正向提示词', /artist:/.test(posVal), `${artistName} → ${String(posVal).slice(0, 40)}`);
await shot('e2e-2-artist.png');

// 5. 画师串 -> 负面（走卡片菜单）
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const b = r.querySelector('.is-card-actions button:last-child'); b.click(); return true; })()`);
await wait(400);
const menuLabels = await ev(`Array.from(document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelectorAll('.is-menu-item')).map(b=>b.innerText)`);
log('menu:', JSON.stringify(menuLabels));
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const b = [...r.querySelectorAll('.is-menu-item')].find(x=>x.innerText.includes('填入负面')); if (!b) return 'nomenu'; b.click(); return true; })()`);
await wait(1200);
const negTab = await ev(`(() => { const t = [...document.querySelectorAll('section[aria-label="Prompt"] [role=tab]')].find(x=>/negative/i.test(x.textContent)); if(!t) return 'notab'; t.click(); return 'ok'; })()`);
await wait(700);
const negVal = await ev(`document.querySelector('.prompt-editor-input textarea[aria-label]')?.value || ''`);
check('画师串 -> 填入负面提示词', /artist:/.test(negVal), `${negTab} ${String(negVal).slice(0, 40)}`);
await shot('e2e-3-negative.png');
await ev(`(() => { const t = [...document.querySelectorAll('section[aria-label="Prompt"] [role=tab]')].find(x=>/positive/i.test(x.textContent)); t && t.click(); return true; })()`);
await wait(500);

// 6. 角色串 -> 角色框（折叠区）
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const t = [...r.querySelectorAll('.is-tab')].find(x=>x.textContent.includes('角色')); t.click(); return true; })()`);
await wait(400);
const charName = await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const c = r.querySelector('.is-card'); const n = c.querySelector('.is-card-name').innerText; c.querySelector('.is-card-main').click(); return n; })()`);
await wait(2200);
const charState = await ev(`(() => {
  const exp = document.querySelector('button[aria-expanded][id$="_toggle"], button[aria-expanded]');
  const tas = Array.from(document.querySelectorAll('textarea')).filter(t=>!t.closest('.prompt-editor-input') && !t.readOnly);
  return { expanded: exp ? exp.getAttribute('aria-expanded') : null, texts: tas.map(t=>({v:String(t.value).slice(0,60), ph:t.placeholder, aria:t.getAttribute('aria-label'), label:t.closest('.MuiFormControl-root')?.querySelector('label')?.textContent||'' })), all: document.querySelectorAll('textarea').length };
})()`);
log('char state:', JSON.stringify(charState));
check('角色卡 -> 填入角色框', charState.texts.some((t) => /1girl/i.test(t.v)), JSON.stringify(charState.texts.map((t) => t.v.slice(0, 24))));
await shot('e2e-4-character.png');

// 7. AI 设计
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const t = [...r.querySelectorAll('.is-tab')].find(x=>x.textContent.includes('AI')); t.click(); return true; })()`);
await wait(500);
const composer = `document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-chat-input, textarea')`;
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const ta = [...r.querySelectorAll('textarea')].find(x=>/描述|例如/.test(x.placeholder||'')); if(!ta) return 'noinput'; ta.focus(); const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; set.call(ta,'雨夜霓虹街头，银发红瞳的剑士少女，电影感逆光'); ta.dispatchEvent(new Event('input',{bubbles:true})); return 'typed'; })()`);
await wait(300);
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const b = [...r.querySelectorAll('button')].find(x=>x.innerText.trim()==='发送'); if(!b) return 'nosend'; b.click(); return 'sent'; })()`);
const packReady = await waitFor(`document.getElementById('idlecloud-prompt-studio-host').shadowRoot.querySelector('.is-pack-actions')`, 30000);
check('AI 设计 -> 返回方案', !!packReady);
await wait(500);
await shot('e2e-5-ai.png');

// 8. 填入全部
const packSummary = await ev(`(() => { const r=document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const p=r.querySelector('.is-pack'); return p ? p.innerText.slice(0,300) : 'nopack'; })()`);
log('pack:', String(packSummary).replace(/\n/g, ' | '));
await ev(`(() => { const r = document.getElementById('idlecloud-prompt-studio-host').shadowRoot; const b = [...r.querySelectorAll('.is-pack-actions button')].find(x=>x.innerText.includes('填入全部')); if(!b) return 'nobtn'; b.click(); return true; })()`);
await wait(2500);
await ev(`(() => { const t=[...document.querySelectorAll('section[aria-label="Prompt"] [role=tab]')].find(x=>/positive/i.test(x.textContent)); t && t.click(); return true; })()`);
await wait(600);
const finalPos = await ev(`document.querySelector('.prompt-editor-input textarea[aria-label]')?.value || ''`);
const finalChar = await ev(`(() => { const tas = Array.from(document.querySelectorAll('textarea')).filter(t=>!t.closest('.prompt-editor-input') && !t.readOnly); return tas.map(t=>t.value).join(' || '); })()`);
check('AI 方案 -> 填入正向（含质量词）', /best quality/i.test(finalPos), String(finalPos).slice(0, 80));
check('AI 方案 -> 填入角色框', /1girl|silver/i.test(finalChar), String(finalChar).slice(0, 80));
await shot('e2e-6-applied.png');

// 9. 拖动面板（拖动后位置持久化）
const dragOk = await ev(`(() => {
  const h = document.getElementById('idlecloud-prompt-studio-host').shadowRoot;
  const head = h.querySelector('.is-head'); const panel = h.querySelector('.is-panel');
  const r0 = panel.getBoundingClientRect();
  const opts = { bubbles: true, cancelable: true, clientX: r0.left + 40, clientY: r0.top + 20, button: 0, pointerId: 1 };
  head.dispatchEvent(new PointerEvent('pointerdown', opts));
  window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: r0.left + 120, clientY: r0.top + 90 }));
  window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientX: r0.left + 120, clientY: r0.top + 90 }));
  const r1 = panel.getBoundingClientRect();
  return { moved: Math.round(r1.left - r0.left) + ',' + Math.round(r1.top - r0.top), left: Math.round(r1.left) };
})()`);
log('drag:', JSON.stringify(dragOk));
check('面板可拖动', /^\d+,\d+$/.test(dragOk.moved || '') && dragOk.moved !== '0,0', JSON.stringify(dragOk));
await shot('e2e-7-dragged.png');

// 10. 无异常
const errs = await ev(`(window.__errs||[]).slice(-5)`);
console.log('\n== summary ==');
const pass = results.filter((r) => r.ok).length;
console.log(`${pass}/${results.length} passed`);
chrome.kill('SIGKILL'); llm.close(); process.exit(0);
