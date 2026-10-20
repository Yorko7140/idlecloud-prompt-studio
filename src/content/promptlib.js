/*
 * IdleCloud 提示词工坊 — 设计器提示词与模型输出解析
 */
(function () {
  'use strict';

  const NS = (globalThis.IdlePromptLib = {});

  const FIELD_LIMITS = { positive: 4000, negative: 3000, character: 2000, notes: 1200 };

  function clip(text, max) {
    const s = String(text || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function qualityBlock(settings) {
    const d = (settings && settings.designer) || {};
    if (d.autoQuality === false) return { positive: '', negative: '' };
    return {
      positive: String(d.qualityPositive || '').trim(),
      negative: String(d.qualityNegative || '').trim()
    };
  }

  function systemPrompt(settings, options) {
    const d = (settings && settings.designer) || {};
    const model = (d.model || 'v4.5').toLowerCase();
    const isV5 = model === 'v5';
    const maxChars = isV5 ? 12 : 6;
    const quality = qualityBlock(settings);
    const lines = [];

    lines.push(
      '你是「IdleCloud 提示词工坊」内置的 NovelAI 绘图提示词设计师，精通 Danbooru 标签、' +
        'NovelAI V4/V4.5/V5 的提示词语法与权重语法。你把用户的中文自然语言需求，转成可直接粘贴的英文提示词。'
    );
    lines.push('');
    lines.push('【工作方式】');
    lines.push('1. 先在脑中完成设计：主体与人数、每个角色的外观/服装/表情/动作、场景与环境、光线、镜头、画风。');
    lines.push('2. 默认直接给出成品，不要反问；信息不足时做合理的审美选择，并在 notes 里说明假设。');
    lines.push('3. 用户若要求修改现有提示词，保留未被要求改动的标签，只改需要变的部分。');
    lines.push('4. 回复正文用中文，不超过 3 句；随后必须给出一个 JSON 代码块。');
    lines.push('');
    lines.push('【输出格式】只输出这一种结构（放在 ```json 代码块里）：');
    lines.push('{');
    lines.push('  "title": "中文短标题",');
    lines.push('  "positive": "英文正向提示词，逗号分隔，单行",');
    lines.push('  "negative": "英文负面提示词，逗号分隔，单行，可为空字符串",');
    lines.push('  "characters": ["角色1的英文提示词", "角色2的英文提示词"],');
    lines.push('  "notes": "中文说明：设计思路、假设、可继续调整的方向"');
    lines.push('}');
    lines.push('');
    lines.push('【硬性规则】');
    lines.push('1. 提示词一律用英文小写 Danbooru 标签，用英文逗号 + 空格分隔；不要整句中文，不要 Markdown 列表。');
    lines.push('2. 不要在 positive/negative 里写质量词（best quality 等）、分辨率、采样器、Steps/CFG 参数——插件会另行追加。');
    lines.push('3. 画师风格用 `artist:画师名`；权重只在必要时用 `1.2::tag::`，不要用花括号堆权重。');
    lines.push('4. 顺序：人数与主体标签 → 角色外观/服装/表情/动作 → 场景/背景 → 光线/氛围 → 镜头/构图 → 画风/画师。');
    lines.push('5. 单人画面：positive 至少包含 `1girl`（或 `1boy`）与 `solo`；不要同时写 `solo` 和 `2girls` 这类冲突标签。');
    lines.push('6. 多角色：positive 写总人数（如 `2girls`），每个角色的完整描述分别放进 characters 数组，各自独立、不要互相指代。');
    lines.push('7. 角色串最多 ' + maxChars + ' 个；每个角色串自包含（人数 + 外观 + 服装 + 表情 + 动作），不要重复描写其他角色。');
    lines.push('8. 镜头/构图只选一个层级：`full body` / `cowboy shot` / `upper body` / `close-up` / `face focus`，不要并列互斥项。');
    lines.push('9. negative 只写确实需要规避的内容；不要复制系统默认负面词。用户没提 NSFW 时保持全年龄向。');
    lines.push('10. characters 为空数组时，所有角色描述合并进 positive 即可。');
    lines.push('');
    if (isV5) {
      lines.push('【当前目标模型：NovelAI V5】');
      lines.push('- 标签负责「是什么」，natural language 负责「怎么发生」：可用简短英文句子描述互动、空间关系、遮挡与因果。');
      lines.push('- 可用 `high complexity`、`depthness`、透明通道、多格漫画、任意语言图中文字等 V5 能力。');
      lines.push('- 多人互动时用自然语言讲清谁对谁做了什么，不要只堆动作标签。');
    } else {
      lines.push('【当前目标模型：NovelAI V4 / V4.5】');
      lines.push('- 以 Danbooru 标签堆叠为主，尽量不用长句；不要使用 complexity / depthness 标签。');
      lines.push('- 多角色最多 6 个；互动关系用动作标签表达（如 `holding hands`、`hug`、`kiss`）。');
    }
    const extra = String(d.extraSystem || '').trim();
    if (extra) {
      lines.push('');
      lines.push('【用户附加要求】');
      lines.push(extra);
    }
    const quality2 = quality.positive || quality.negative;
    if (quality2) {
      lines.push('');
      lines.push('【插件会自动追加的质量词（不要再写进 JSON）】');
      if (quality.positive) lines.push('正向质量词：' + quality.positive);
      if (quality.negative) lines.push('负面质量词：' + quality.negative);
    }
    return lines.join('\n');
  }

  function contextMessage(context, library) {
    const parts = [];
    const pos = String((context && context.positive) || '').trim();
    if (pos) parts.push('【当前正向提示词】\n' + clip(pos, 2000));
    const chars = (context && context.characters) || [];
    if (chars.length) {
      parts.push(
        '【当前角色框】\n' +
          chars
            .map((c, i) => `角色${i + 1}${c.label ? '（' + c.label + '）' : ''}：${clip(c.value, 600)}`)
            .join('\n')
      );
    }
    const artists = (library && library.artists) || [];
    if (artists.length) {
      parts.push(
        '【用户收藏的画师串（需要画风时可参考，也可不用）】\n' +
          artists
            .slice(0, 20)
            .map((a) => `${a.name}: ${clip(a.tags, 160)}`)
            .join('\n')
      );
    }
    return parts.length ? parts.join('\n\n') : '';
  }

  function buildMessages({ settings, history, userText, context, library }) {
    const messages = [{ role: 'system', content: systemPrompt(settings, {}) }];
    const ctx = contextMessage(context, library);
    if (ctx) messages.push({ role: 'system', content: ctx });
    const trimmed = (history || [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-12)
      .map((m) => ({ role: m.role, content: clip(m.content, 6000) }));
    messages.push(...trimmed);
    messages.push({ role: 'user', content: String(userText || '').trim() });
    return messages;
  }

  function extractJson(text) {
    const raw = String(text || '');
    const fences = [];
    const re = /```(?:json)?\s*([\s\S]*?)```/gi;
    let m;
    while ((m = re.exec(raw))) fences.push(m[1]);
    const candidates = fences.concat([raw]);
    for (const c of candidates) {
      const t = c.trim();
      const start = t.indexOf('{');
      const end = t.lastIndexOf('}');
      if (start < 0 || end <= start) continue;
      try {
        const obj = JSON.parse(t.slice(start, end + 1));
        if (obj && (obj.positive || obj.characters || obj.notes || obj.title)) return obj;
      } catch (e) {
        /* try next */
      }
    }
    return null;
  }

  function normalizePack(obj) {
    if (!obj) return null;
    const characters = Array.isArray(obj.characters)
      ? obj.characters
          .map((c) => (typeof c === 'string' ? c : c && (c.prompt || c.tags || c.value)))
          .filter(Boolean)
          .map((c) => clip(String(c).trim(), FIELD_LIMITS.character))
      : [];
    return {
      title: clip(String(obj.title || '未命名方案').trim(), 80),
      positive: clip(String(obj.positive || '').trim(), FIELD_LIMITS.positive),
      negative: clip(String(obj.negative || '').trim(), FIELD_LIMITS.negative),
      characters,
      notes: clip(String(obj.notes || '').trim(), FIELD_LIMITS.notes)
    };
  }

  function parseReply(text) {
    const obj = extractJson(text);
    const pack = normalizePack(obj);
    let prose = String(text || '');
    const idx = prose.indexOf('```');
    if (idx >= 0) prose = prose.slice(0, idx);
    prose = prose.trim();
    return { pack, prose };
  }

  function withQuality(pack, settings) {
    if (!pack) return pack;
    const q = qualityBlock(settings);
    const merge = (base, add, sep) => {
      const b = String(base || '').trim().replace(/[,\s]+$/, '');
      const a = String(add || '').trim();
      if (!a) return b;
      if (!b) return a;
      const tokens = new Set(
        b
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      );
      const keep = a
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && !tokens.has(s.toLowerCase()));
      return keep.length ? b + (sep || ', ') + keep.join(', ') : b;
    };
    return {
      ...pack,
      positive: merge(pack.positive, q.positive),
      negative: merge(pack.negative, q.negative)
    };
  }

  const QUICK_ACTIONS = [
    {
      id: 'fresh',
      label: '设计新图',
      prompt: '请帮我设计一套新的绘图提示词。我的想法是：'
    },
    {
      id: 'improve',
      label: '优化当前提示词',
      prompt:
        '请优化我当前的正向提示词：保留原意与已有角色设定，调整标签顺序、补充缺失的外观/场景/光线细节，去掉冲突或低效标签。如果当前提示词为空，就先指出这一点。'
    },
    {
      id: 'details',
      label: '补充细节',
      prompt:
        '请在我当前提示词的基础上补充画面细节：服装质感、表情、手部动作、环境细节、光线与镜头，让画面更完整。保留我原有的主体与画风。'
    },
    {
      id: 'variants',
      label: '给我三个变体',
      prompt:
        '请基于我当前的需求给出三个风格/构图明显不同的变体方案（用一份 JSON 输出，characters 里按方案顺序排列，positive 用第一个方案；其余两个方案在 notes 里用英文提示词列出）。'
    },
    {
      id: 'translate',
      label: '中文转标签',
      prompt:
        '请把下面的中文描述转成 NovelAI 英文提示词（Danbooru 标签），不要添加我没提到的元素：'
    }
  ];

  Object.assign(NS, {
    systemPrompt,
    buildMessages,
    parseReply,
    withQuality,
    qualityBlock,
    QUICK_ACTIONS,
    clip
  });
})();
