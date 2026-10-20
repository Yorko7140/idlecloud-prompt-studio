/*
 * IdleCloud 提示词工坊 — AI 设计 & 设置页
 */
(function () {
  'use strict';

  const { h, icon, button, iconButton, field, input, textarea } = globalThis.IdleUI;
  const Store = globalThis.IdleStore;
  const Adapter = globalThis.IdleAdapter;
  const PromptLib = globalThis.IdlePromptLib;
  const StudioPanel = globalThis.IdlePanel;
  if (!StudioPanel) return;

  const PROVIDERS = [
    { id: 'openai', label: 'OpenAI 兼容', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
    { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['google/gemini-2.0-flash-001', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'] },
    { id: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'] },
    { id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'] },
    { id: 'custom', label: '自定义', baseUrl: '', models: [] }
  ];

  const EXAMPLES = [
    '银发红瞳的剑士少女，站在雨夜霓虹街头，电影感逆光，半身，冷色调',
    '海边黄昏，白裙少女回头微笑，风吹起长发，胶片质感，全身',
    '赛博朋克机械师，短发，护目镜，工作台前修理义肢，暖色灯光，特写'
  ];

  StudioPanel.prototype.renderAI = function renderAI() {
    const pane = h('div', { class: 'is-pane is-chat' });
    const llm = this.state.settings.llm || {};
    const configured = !!llm.apiKey || /localhost|127\.0\.0\.1/.test(llm.baseUrl || '');
    const status = h('div', { class: 'is-chat-status' }, [
      h('span', { class: 'is-dot' + (this.state.streaming ? '' : configured ? '' : ' is-off') }),
      h('span', { text: `${llm.model || '未选择模型'} · ${providerLabel(llm.provider)}` }),
      h('span', { style: { flex: '1' } }),
      this.state.chat.length
        ? button('清空', {
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => this.clearChat()
          })
        : null
    ]);
    pane.appendChild(status);

    const list = h('div', { class: 'is-chat-list', id: 'is-chat-list' });
    this.chatListEl = list;
    if (!this.state.chat.length) list.appendChild(this.buildWelcome());
    else this.state.chat.forEach((m) => list.appendChild(this.buildMessage(m)));
    pane.appendChild(list);

    if (!configured) {
      pane.appendChild(
        h('div', { class: 'is-config-warn' }, [
          h('span', { text: '还没有配置设计 LLM。填入任意 OpenAI 兼容接口的 Base URL / API Key / 模型后即可对话。' }),
          button('去设置', {
            variant: 'primary',
            className: 'is-sm',
            onClick: () => {
              this.state.tab = 'settings';
              this.renderAll();
            }
          })
        ])
      );
    }

    const quick = h(
      'div',
      { class: 'is-quick' },
      PromptLib.QUICK_ACTIONS.map((a) =>
        button(a.label, {
          variant: 'ghost',
          className: 'is-sm',
          onClick: () => {
            const ta = this.shadow.getElementById('is-composer-input');
            if (ta) {
              ta.value = a.prompt;
              ta.focus();
              ta.setSelectionRange(ta.value.length, ta.value.length);
            }
          }
        })
      )
    );
    pane.appendChild(quick);

    const ta = h('textarea', {
      id: 'is-composer-input',
      placeholder: '描述你想要的画面，例如：' + EXAMPLES[0],
      rows: 2
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.sendChat(ta.value);
      }
    });
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
    });
    this.composerEl = ta;

    const contextToggle = h('label', { class: 'is-switch', style: { fontSize: '10.5px', gap: '6px' } }, [
      h('input', {
        type: 'checkbox',
        checked: this.state.includeContext,
        onChange: (e) => {
          this.state.includeContext = e.target.checked;
        }
      }),
      h('span', { text: '附带当前提示词' })
    ]);

    const sendBtn = button(this.state.streaming ? '停止' : '发送', {
      icon: this.state.streaming ? 'stop' : 'send',
      variant: 'primary',
      onClick: () => {
        if (this.state.streaming) this.stopChat();
        else this.sendChat(ta.value);
      }
    });

    pane.appendChild(
      h('div', { class: 'is-composer' }, [
        ta,
        h('div', { class: 'is-composer-foot' }, [
          h('div', { class: 'is-hint' }, [contextToggle, h('span', { class: 'is-kbd', text: 'Enter' }), h('span', { text: '发送' })]),
          sendBtn
        ])
      ])
    );
    return pane;
  };

  function providerLabel(id) {
    return (PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]).label;
  }

  StudioPanel.prototype.buildWelcome = function buildWelcome() {
    const wrap = h('div', { class: 'is-empty', style: { padding: '22px 10px', textAlign: 'left' } }, [
      h('strong', { text: '用一句话描述，AI 帮你写出整套提示词' }),
      h('span', {
        text: '它会同时给出正向、负面与角色串，并可直接填入当前绘图页。试试：'
      })
    ]);
    EXAMPLES.forEach((ex) => {
      wrap.appendChild(
        h(
          'button',
          {
            class: 'is-btn is-ghost is-sm',
            style: { marginTop: '7px', width: '100%', justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', lineHeight: '1.5' },
            onClick: () => {
              const ta = this.shadow.getElementById('is-composer-input');
              if (ta) {
                ta.value = ex;
                ta.focus();
              }
            }
          },
          [h('span', { text: ex })]
        )
      );
    });
    return wrap;
  };

  StudioPanel.prototype.buildMessage = function buildMessage(m) {
    const wrap = h('div', { class: 'is-msg is-' + (m.role === 'user' ? 'user' : m.error ? 'error' : 'assistant') });
    if (m.role === 'user') {
      wrap.appendChild(h('div', { class: 'is-msg-bubble', text: m.content }));
      return wrap;
    }
    const bubble = h('div', { class: 'is-msg-bubble' });
    if (m.content && !m.pack) bubble.textContent = m.prose || m.content;
    if (m.error) bubble.textContent = m.error;
    if (!m.content && m.streaming) {
      bubble.appendChild(h('span', { class: 'is-typing' }, [h('i'), h('i'), h('i')]));
    }
    if (m.pack) {
      if (m.prose) bubble.textContent = m.prose;
      if (bubble.textContent.trim()) wrap.appendChild(bubble);
      wrap.appendChild(this.buildPack(m.pack));
    } else if (bubble.textContent !== '' || m.streaming) {
      wrap.appendChild(bubble);
    }
    if (m.streaming && m.content) {
      bubble.appendChild(h('span', { class: 'is-typing', style: { marginLeft: '4px' } }, [h('i'), h('i'), h('i')]));
    }
    this.msgRefs.set(m.id, { wrap, bubble });
    return wrap;
  };

  StudioPanel.prototype.buildPack = function buildPack(pack) {
    const composed = PromptLib.withQuality(pack, this.state.settings);
    const card = h('div', { class: 'is-pack' });
    card.appendChild(
      h('div', { class: 'is-pack-head' }, [
        icon('sparkles', 14),
        h('div', { class: 'is-pack-title', text: pack.title || '提示词方案' }),
        h('span', { class: 'is-badge', text: this.state.settings.designer.autoQuality === false ? '原始' : '含质量词' })
      ])
    );
    const rows = h('div', { class: 'is-pack-rows' });
    const addRow = (label, text, target, index) => {
      if (!text) return;
      const row = h('div', { class: 'is-pack-row' }, [
        h('div', { class: 'is-pack-row-head' }, [
          h('span', { class: 'is-pack-label', text: label }),
          h('div', { class: 'is-row' }, [
            button('填入', {
              variant: 'soft',
              className: 'is-sm',
              onClick: () => this.fillPackPart(text, target, index)
            }),
            button('复制', {
              variant: 'ghost',
              className: 'is-sm',
              onClick: async () => {
                const ok = await Adapter.copyText(text);
                this.showToast(ok ? '已复制' : '复制失败', ok ? 'success' : 'error');
              }
            })
          ])
        ]),
        h('div', { class: 'is-pack-text', text })
      ]);
      rows.appendChild(row);
    };
    addRow('正向提示词', composed.positive, 'positive');
    addRow('负面提示词', composed.negative, 'negative');
    (composed.characters || []).forEach((c, i) => {
      addRow(`角色 ${i + 1}`, c, 'character', i);
    });
    card.appendChild(rows);

    if (pack.notes) card.appendChild(h('div', { class: 'is-pack-notes', text: pack.notes }));

    const actions = h('div', { class: 'is-pack-actions' }, [
      button('填入全部', {
        icon: 'check',
        variant: 'primary',
        className: 'is-sm',
        onClick: () => this.applyPack(composed)
      }),
      button('只填正向', {
        icon: 'send',
        variant: 'ghost',
        className: 'is-sm',
        onClick: () => this.fillPackPart(composed.positive, 'positive')
      }),
      button('复制全部', {
        icon: 'copy',
        variant: 'ghost',
        className: 'is-sm',
        onClick: async () => {
          const text = packToText(composed);
          const ok = await Adapter.copyText(text);
          this.showToast(ok ? '整套提示词已复制' : '复制失败', ok ? 'success' : 'error');
        }
      })
    ]);
    card.appendChild(actions);
    return card;
  };

  function packToText(pack) {
    const parts = ['[正向]', pack.positive, ''];
    if (pack.negative) parts.push('[负面]', pack.negative, '');
    (pack.characters || []).forEach((c, i) => parts.push(`[角色${i + 1}]`, c, ''));
    return parts.join('\n').trim();
  }

  StudioPanel.prototype.fillPackPart = async function fillPackPart(text, target, index) {
    if (!Adapter.promptSection()) {
      this.showToast('未找到绘图页提示词框，请先打开 /main 绘图页', 'error');
      return;
    }
    const opts = { mode: this.state.settings.fillMode, separator: this.state.settings.separator };
    let res;
    if (target === 'character') {
      const out = await Adapter.fillCharacters([text], opts);
      res = out[0];
    } else {
      res = await Adapter.fillPrompt(target, text, opts);
    }
    this.afterFill(res, target === 'character' ? '角色串' : '提示词', target === 'character' ? '角色框' : target === 'negative' ? '负面提示词' : '正向提示词');
  };

  StudioPanel.prototype.applyPack = async function applyPack(pack) {
    if (!Adapter.promptSection()) {
      this.showToast('未找到绘图页提示词框，请先打开 /main 绘图页', 'error');
      return;
    }
    const opts = { mode: this.state.settings.fillMode, separator: this.state.settings.separator };
    const applied = [];
    if (pack.positive) {
      const r = await Adapter.fillPrompt('positive', pack.positive, opts);
      if (r.ok) applied.push('正向');
      else this.showToast(r.reason || '正向填入失败', 'error');
    }
    if (pack.negative) {
      const r = await Adapter.fillPrompt('negative', pack.negative, opts);
      if (r.ok) applied.push('负面');
      else this.showToast('负面未填入：' + (r.reason || '失败'), 'warn');
    }
    if (pack.characters && pack.characters.length) {
      const results = await Adapter.fillCharacters(pack.characters, opts);
      const okCount = results.filter((r) => r && r.ok).length;
      if (okCount) applied.push(`${okCount} 个角色`);
      if (okCount < pack.characters.length) {
        this.showToast('部分角色未填入：' + (results.find((r) => r && !r.ok)?.reason || '角色框不足'), 'warn');
      }
    }
    if (applied.length) this.showToast('已填入：' + applied.join('、'), 'success');
  };

  // ------------------------------------------------------------------- chat
  StudioPanel.prototype.ensurePort = function ensurePort() {
    if (!chrome?.runtime?.connect) return null;
    if (this.port) return this.port;
    const port = chrome.runtime.connect({ name: 'idle-studio-llm' });
    port.onMessage.addListener((msg) => this.onLLMMessage(msg));
    port.onDisconnect.addListener(() => {
      this.port = null;
      if (this.activeRequest) {
        const err = chrome.runtime.lastError;
        this.finishAssistant(this.activeRequest.assistantId, null, err ? err.message : '连接已断开');
      }
    });
    this.port = port;
    return port;
  };

  StudioPanel.prototype.onLLMMessage = function onLLMMessage(msg) {
    if (!msg || !this.activeRequest || msg.requestId !== this.activeRequest.id) return;
    if (msg.type === 'delta') {
      this.appendDelta(msg.text || '');
    } else if (msg.type === 'done') {
      this.finishAssistant(this.activeRequest.assistantId, msg.text || null);
    } else if (msg.type === 'error') {
      this.finishAssistant(this.activeRequest.assistantId, null, msg.message || '请求失败');
    }
  };

  StudioPanel.prototype.appendDelta = function appendDelta(text) {
    const assistantId = this.activeRequest?.assistantId;
    const msg = this.state.chat.find((m) => m.id === assistantId);
    if (!msg) return;
    msg.content = (msg.content || '') + text;
    const refs = this.msgRefs.get(assistantId);
    if (refs && refs.bubble) {
      refs.bubble.textContent = msg.content;
      refs.bubble.appendChild(h('span', { class: 'is-typing', style: { marginLeft: '4px' } }, [h('i'), h('i'), h('i')]));
    }
    this.scrollChat();
  };

  StudioPanel.prototype.scrollChat = function scrollChat() {
    const list = this.shadow?.getElementById('is-chat-list');
    if (list) list.scrollTop = list.scrollHeight;
  };

  StudioPanel.prototype.sendChat = async function sendChat(raw) {
    const text = String(raw || '').trim();
    if (!text || this.state.streaming) return;
    const llm = this.state.settings.llm || {};
    if (!llm.apiKey && !/localhost|127\.0\.0\.1/.test(llm.baseUrl || '')) {
      this.showToast('请先在设置里填写 API Key', 'error');
      this.state.tab = 'settings';
      this.renderAll();
      return;
    }
    const composer = this.shadow.getElementById('is-composer-input');
    if (composer) composer.value = '';

    const history = this.state.chat
      .filter((m) => !m.error && m.content && (m.role === 'user' || m.pack || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content }));
    const userMsg = { id: Store.uid(), role: 'user', content: text, at: Date.now() };
    this.state.chat.push(userMsg);
    const assistantId = Store.uid();
    const assistant = { id: assistantId, role: 'assistant', content: '', streaming: true, at: Date.now() };
    this.state.chat.push(assistant);
    this.state.streaming = true;
    this.state.lastUserText = text;
    this.renderAll();
    this.scrollChat();

    const context = this.state.includeContext ? Adapter.currentContext() : null;
    const messages = PromptLib.buildMessages({
      settings: this.state.settings,
      history,
      userText: text,
      context,
      library: { artists: this.state.artists.slice(0, 20) }
    });
    const payload = {
      provider: llm.provider,
      baseUrl: llm.baseUrl,
      apiKey: llm.apiKey,
      model: llm.model,
      temperature: Number(llm.temperature) || 0.7,
      maxTokens: Number(llm.maxTokens) || 2200,
      stream: llm.stream !== false,
      timeoutMs: Number(llm.timeoutMs) || 120000,
      messages
    };
    const requestId = Store.uid();
    this.activeRequest = { id: requestId, assistantId };
    const port = this.ensurePort();
    if (port) {
      try {
        port.postMessage({ type: 'start', requestId, payload });
      } catch (e) {
        this.mockReply(assistantId, e.message);
      }
    } else {
      this.mockReply(assistantId);
    }
  };

  StudioPanel.prototype.mockReply = function mockReply(assistantId, err) {
    // 非扩展环境（例如本地 UI 预览）下的离线演示响应
    const demo =
      '（离线演示）我先把示例方案放进 JSON，配置 API Key 后会调用真实模型。\n```json\n' +
      JSON.stringify(
        {
          title: '雨夜霓虹剑士',
          positive:
            '1girl, solo, silver hair, long hair, red eyes, sword, black coat, standing, rain, neon lights, night city, cinematic lighting, backlighting, cowboy shot, depth of field, artist:wlop',
          negative: 'lowres, bad hands, extra fingers',
          characters: [],
          notes: '离线演示：冷色调雨夜、电影感逆光；可加入赛博元素或改为全身。'
        },
        null,
        2
      ) +
      '\n```';
    setTimeout(() => {
      if (err) this.finishAssistant(assistantId, null, err);
      else this.finishAssistant(assistantId, demo);
    }, 700);
  };

  StudioPanel.prototype.finishAssistant = function finishAssistant(assistantId, fullText, error) {
    const msg = this.state.chat.find((m) => m.id === assistantId);
    if (!msg) return;
    msg.streaming = false;
    if (error) {
      msg.error = String(error);
    } else {
      const text = fullText != null ? fullText : msg.content;
      msg.content = text;
      const parsed = PromptLib.parseReply(text);
      msg.prose = parsed.prose;
      if (parsed.pack) msg.pack = parsed.pack;
    }
    this.activeRequest = null;
    this.state.streaming = false;
    if (this.port) {
      try {
        this.port.disconnect();
      } catch (e) {
        /* ignore */
      }
      this.port = null;
    }
    this.saveChat();
    this.renderAll();
    this.scrollChat();
    if (error) this.showToast('设计请求失败：' + error, 'error');
  };

  StudioPanel.prototype.stopChat = function stopChat() {
    if (!this.activeRequest) return;
    const rid = this.activeRequest.id;
    try {
      this.port?.postMessage({ type: 'abort', requestId: rid });
    } catch (e) {
      /* ignore */
    }
    this.finishAssistant(this.activeRequest.assistantId, null, '已停止生成');
  };

  StudioPanel.prototype.retryLast = function retryLast() {
    const text = this.state.lastUserText;
    if (!text) return;
    this.state.chat = this.state.chat.filter((m) => !m.error);
    this.state.streaming = false;
    this.renderAll();
    setTimeout(() => this.sendChat(text), 30);
  };

  StudioPanel.prototype.clearChat = function clearChat() {
    if (this.state.streaming) this.stopChat();
    this.state.chat = [];
    this.state.lastUserText = '';
    this.saveChat();
    this.renderAll();
    this.showToast('对话已清空', 'success');
  };

  StudioPanel.prototype.saveChat = function saveChat() {
    const messages = this.state.chat
      .filter((m) => !m.streaming)
      .slice(-40)
      .map(({ id, role, content, prose, pack, error, at }) => ({ id, role, content, prose, pack, error, at }));
    Store.saveChat({ messages, updatedAt: Date.now() }).catch(() => {});
  };

  // --------------------------------------------------------------- settings
  StudioPanel.prototype.renderSettings = function renderSettings() {
    if (!this.settingsDraft) this.settingsDraft = JSON.parse(JSON.stringify(this.state.settings));
    const d = this.settingsDraft;
    const pane = h('div', { class: 'is-pane' });
    const scroll = h('div', { class: 'is-scroll' });
    pane.appendChild(scroll);

    const seg = (name, options, value, onChange) =>
      h(
        'div',
        { class: 'is-seg' },
        options.map((o) =>
          h('button', {
            class: value === o.value ? 'is-on' : '',
            text: o.label,
            onClick: (e) => {
              Array.from(e.currentTarget.parentElement.children).forEach((c) => c.classList.remove('is-on'));
              e.currentTarget.classList.add('is-on');
              onChange(o.value);
            }
          })
        )
      );

    // 填入行为
    scroll.appendChild(
      h('div', { class: 'is-section' }, [
        h('div', { class: 'is-section-title', text: '填入行为' }),
        field('默认模式', seg('fillMode', [{ value: 'append', label: '追加' }, { value: 'replace', label: '覆盖' }], d.fillMode, (v) => (d.fillMode = v)), '追加时自动去重，覆盖会替换整个提示词框。'),
        field('分隔符', input(d.separator, { placeholder: ', ' }), '建议保持 ", " 或换行。'),
        h('label', { class: 'is-switch' }, [
          h('span', { text: '打开页面时自动展开面板' }),
          h('input', { type: 'checkbox', checked: d.autoOpen !== false, onChange: (e) => (d.autoOpen = e.target.checked) })
        ])
      ])
    );

    // 设计器
    scroll.appendChild(
      h('div', { class: 'is-section' }, [
        h('div', { class: 'is-section-title', text: '设计器' }),
        field('目标模型', seg('model', [{ value: 'v4.5', label: 'V4 / V4.5' }, { value: 'v5', label: 'V5' }], d.designer.model, (v) => (d.designer.model = v)), '影响角色数量上限与写作范式。'),
        h('label', { class: 'is-switch' }, [
          h('span', { text: '自动追加质量词' }),
          h('input', { type: 'checkbox', checked: d.designer.autoQuality !== false, onChange: (e) => (d.designer.autoQuality = e.target.checked) })
        ]),
        field('正向质量词', textarea(d.designer.qualityPositive, { rows: 2 })),
        field('负面质量词', textarea(d.designer.qualityNegative, { rows: 3 })),
        field('附加系统要求（可选）', textarea(d.designer.extraSystem, { rows: 2, placeholder: '例如：偏好冷色调、不要出现文字、角色统一东亚面孔…' }))
      ])
    );

    // LLM
    const llm = d.llm;
    const providerSelect = h(
      'select',
      {
        class: 'is-select',
        onChange: (e) => {
          const p = PROVIDERS.find((x) => x.id === e.target.value);
          llm.provider = e.target.value;
          if (p && p.baseUrl) llm.baseUrl = p.baseUrl;
          if (p && p.models.length && !p.models.includes(llm.model)) llm.model = p.models[0];
          this.renderAll();
        }
      },
      PROVIDERS.map((p) => h('option', { value: p.id, text: p.label, selected: llm.provider === p.id }))
    );
    const baseUrlInput = input(llm.baseUrl, { placeholder: 'https://api.openai.com/v1' });
    const apiKeyInput = input(llm.apiKey, { type: 'password', placeholder: 'sk-...' });
    const modelInput = input(llm.model, { placeholder: 'gpt-4o-mini' });
    baseUrlInput.addEventListener('input', () => (llm.baseUrl = baseUrlInput.value.trim()));
    apiKeyInput.addEventListener('input', () => (llm.apiKey = apiKeyInput.value.trim()));
    modelInput.addEventListener('input', () => (llm.model = modelInput.value.trim()));
    const tempInput = input(String(llm.temperature ?? 0.7), { type: 'number' });
    tempInput.min = '0';
    tempInput.max = '2';
    tempInput.step = '0.1';
    const maxTokensInput = input(String(llm.maxTokens ?? 2200), { type: 'number' });
    const testWrap = h('div', { class: 'is-hint', text: '' });
    const testBtn = button('测试连接', {
      icon: 'spark',
      variant: 'ghost',
      className: 'is-sm',
      onClick: async () => {
        testWrap.textContent = '测试中…';
        try {
          const res = await chrome.runtime.sendMessage({
            type: 'llm:test',
            payload: {
              provider: llm.provider,
              baseUrl: baseUrlInput.value.trim(),
              apiKey: apiKeyInput.value.trim(),
              model: modelInput.value.trim(),
              maxTokens: 32,
              timeoutMs: 30000
            }
          });
          testWrap.textContent = res && res.ok ? '连接成功：' + (res.detail || '模型已响应') : '连接失败：' + ((res && res.error) || '未知错误');
          testWrap.style.color = res && res.ok ? 'var(--ok)' : 'var(--danger)';
        } catch (e) {
          testWrap.textContent = '连接失败：' + e.message;
          testWrap.style.color = 'var(--danger)';
        }
      }
    });

    const llmSection = h('div', { class: 'is-section' }, [
      h('div', { class: 'is-section-title', text: '设计 LLM' }),
      field('服务商', providerSelect),
      field('Base URL', baseUrlInput, 'OpenAI 兼容接口通常以 /v1 结尾；Anthropic 用 /v1。'),
      field('API Key', apiKeyInput, '只保存在本机 chrome.storage，不会上传到除你配置的接口之外的地方。'),
      field('模型', modelInput, (PROVIDERS.find((p) => p.id === llm.provider)?.models || []).join(' / ')),
      h('div', { class: 'is-row' }, [
        field('Temperature', tempInput),
        field('Max Tokens', maxTokensInput)
      ]),
      h('label', { class: 'is-switch' }, [
        h('span', { text: '流式输出' }),
        h('input', { type: 'checkbox', checked: llm.stream !== false, onChange: (e) => (llm.stream = e.target.checked) })
      ]),
      h('div', { class: 'is-row' }, [testBtn, testWrap])
    ]);
    scroll.appendChild(llmSection);

    // 数据
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await Store.importData(data, { merge: true });
        this.showToast('导入成功', 'success');
        this.state.settings = (await Store.load()).settings;
        this.settingsDraft = null;
        this.renderAll();
      } catch (e) {
        this.showToast('导入失败：' + e.message, 'error');
      }
      fileInput.value = '';
    });
    const tomlInput = h('input', { type: 'file', accept: '.toml,text/plain', multiple: true, style: { display: 'none' } });
    tomlInput.addEventListener('change', async () => {
      const files = Array.from(tomlInput.files || []);
      tomlInput.value = '';
      if (!files.length) return;
      try {
        const report = await globalThis.IdleToml.importFiles(Store, files);
        this.state.settings = (await Store.load()).settings;
        this.showToast(
          `导入完成：画师串 +${report.artists}，角色串 +${report.characters}` + (report.skipped ? `，跳过 ${report.skipped}` : ''),
          'success'
        );
        this.renderAll();
      } catch (e) {
        this.showToast('导入失败：' + e.message, 'error');
      }
    });

    scroll.appendChild(
      h('div', { class: 'is-section' }, [
        h('div', { class: 'is-section-title', text: '数据' }),
        h('div', { class: 'is-hint', text: `当前 ${this.state.artists.length} 个画师串、${this.state.characters.length} 个角色串。` }),
        h('div', { class: 'is-row' }, [
          button('导出备份', {
            icon: 'download',
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => this.exportData()
          }),
          button('导入备份', {
            icon: 'upload',
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => fileInput.click()
          }),
          fileInput
        ]),
        h('div', { class: 'is-row' }, [
          button('从 MaiBot 导入 TOML', {
            icon: 'upload',
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => tomlInput.click()
          }),
          tomlInput
        ]),
        h('div', { class: 'is-row' }, [
          button('管理全部数据', {
            icon: 'external',
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => chrome.runtime.openOptionsPage()
          }),
          button('清空库', {
            icon: 'trash',
            variant: 'danger',
            className: 'is-sm',
            onClick: () => {
              globalThis.IdleUI.dialog(this.panelEl, {
                title: '清空画师库与角色库',
                body: h('div', { class: 'is-hint', text: '会删除所有画师串和角色串（设置与对话保留）。建议先导出备份。' }),
                confirmText: '确认清空',
                danger: true,
                onConfirm: async () => {
                  await Store.resetLibrary();
                  this.showToast('已清空', 'success');
                }
              });
            }
          })
        ])
      ])
    );

    const diagBox = h('pre', {
      class: 'is-hint',
      style: {
        display: 'none',
        margin: '0',
        maxHeight: '180px',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        background: 'rgba(0,0,0,.25)',
        borderRadius: '8px',
        padding: '8px'
      }
    });
    scroll.appendChild(
      h('div', { class: 'is-section' }, [
        h('div', { class: 'is-section-title', text: '关于' }),
        h('div', { class: 'is-row' }, [
          button('检测绘图页结构', {
            icon: 'info',
            variant: 'ghost',
            className: 'is-sm',
            onClick: () => {
              diagBox.style.display = 'block';
              diagBox.textContent = JSON.stringify(Adapter.diagnose ? Adapter.diagnose() : { error: 'adapter 未加载 diagnose' }, null, 2);
            }
          })
        ]),
        diagBox,
        h('div', { class: 'is-hint' }, [
          h('span', { text: 'IdleCloud 提示词工坊 v0.1.0 · 适用于 ' }),
          h('span', { class: 'is-code-inline', text: 'nai.idlecloud.cc' }),
          h('span', { text: ' · 快捷键 ' }),
          h('span', { class: 'is-kbd', text: 'Alt+Shift+N' })
        ])
      ])
    );

    const foot = h('div', { class: 'is-section', style: { flexDirection: 'row', justifyContent: 'space-between', borderTop: '1px solid var(--line)' } }, [
      h('div', { class: 'is-hint', text: '修改后需保存才会生效' }),
      button('保存设置', {
        icon: 'check',
        variant: 'primary',
        onClick: async () => {
          d.llm.baseUrl = baseUrlInput.value.trim();
          d.llm.apiKey = apiKeyInput.value.trim();
          d.llm.model = modelInput.value.trim();
          d.llm.temperature = Number(tempInput.value) || 0.7;
          d.llm.maxTokens = Number(maxTokensInput.value) || 2200;
          d.separator = d.separator || ', ';
          await Store.patchSettings(d);
          this.state.settings = (await Store.load()).settings;
          this.settingsDraft = null;
          this.renderAll();
          this.showToast('设置已保存', 'success');
        }
      })
    ]);
    pane.appendChild(foot);
    return pane;
  };

  StudioPanel.prototype.exportData = async function exportData() {
    const data = await Store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `idlecloud-prompt-studio-${new Date().toISOString().slice(0, 10)}.json`;
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.showToast('已导出备份', 'success');
  };
})();
