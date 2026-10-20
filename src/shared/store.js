/*
 * IdleCloud 提示词工坊 — 共享存储层
 * 同时被 content script 与 options 页面以传统脚本方式加载，挂在 globalThis.IdleStore。
 */
(function () {
  'use strict';

  const NS = (globalThis.IdleStore = globalThis.IdleStore || {});
  const KEY = 'idle_studio_v1';
  const SCHEMA_VERSION = 1;

  const uid = () =>
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  const now = () => Date.now();

  const ARTIST_SEEDS = [
    { name: 'WLOP', tags: 'artist:wlop', group: '厚涂 / 光影', note: '半写实厚涂，冷暖对比强，适合史诗感场景。' },
    { name: 'ask (askzy)', tags: 'artist:ask (askzy)', group: '厚涂 / 光影', note: '笔触厚重的半写实，人物气质柔和。' },
    { name: 'Ciloranko', tags: 'artist:ciloranko', group: '二次元 / 精细', note: '高完成度二次元，发丝与服饰细节丰富。' },
    { name: 'Rella', tags: 'artist:rella', group: '二次元 / 透明感', note: '通透空气感、柔和逆光与飘浮元素。' },
    { name: 'Guweiz', tags: 'artist:guweiz', group: '厚涂 / 光影', note: '电影感打光，都市与雨天氛围。' },
    { name: 'Mika Pikazo', tags: 'artist:mika pikazo', group: '二次元 / 高饱和', note: '高饱和撞色、潮流感强。' },
    { name: 'lack', tags: 'artist:lack', group: '二次元 / 精细', note: '干净利落的二次元上色，适合角色立绘。' },
    { name: 'Fuzichoco', tags: 'artist:fuzichoco', group: '二次元 / 华丽', note: '华丽装饰、和风与繁复背景。' },
    { name: 'Redjuice', tags: 'artist:redjuice', group: '二次元 / 冷调', note: '冷色科幻感，线条锐利。' },
    { name: 'Atdan', tags: 'artist:atdan', group: '二次元 / 柔和', note: '柔光、粉彩、少女感。' }
  ];

  const CHARACTER_SEEDS = [
    {
      name: '示例 · 银发红瞳',
      prompt:
        '1girl, solo, silver hair, long hair, straight hair, red eyes, pale skin, slender, white blouse, black pleated skirt, ribbon, looking at viewer, soft smile, upper body',
      avoid: 'bad hands, extra fingers',
      group: '示例',
      note: '示例条目，可直接套用后修改发色/服装。'
    },
    {
      name: '示例 · 黑长直学姐',
      prompt:
        '1girl, solo, black hair, long straight hair, hime cut, dark eyes, school uniform, sailor collar, serafuku, red ribbon, serious expression, arms crossed, cowboy shot',
      avoid: '',
      group: '示例',
      note: ''
    },
    {
      name: '示例 · 赛博都市少女',
      prompt:
        '1girl, solo, short hair, undercut, cyan hair, heterochromia, cyberpunk, neon lights, techwear, cropped jacket, harness, glowing tattoos, night city, rain, full body',
      avoid: '',
      group: '示例',
      note: ''
    }
  ];

  function defaultSettings() {
    return {
      fillMode: 'append',
      separator: ', ',
      autoOpen: true,
      panelWidth: 412,
      uiLang: 'zh',
      lastTab: 'artists',
      llm: {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 2200,
        stream: true,
        timeoutMs: 120000
      },
      designer: {
        model: 'v4.5',
        autoQuality: true,
        qualityPositive: 'best quality, amazing quality, very aesthetic, absurdres',
        qualityNegative: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
        extraSystem: ''
      }
    };
  }

  function defaultState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      settings: defaultSettings(),
      artists: ARTIST_SEEDS.map((a) => ({
        id: uid(),
        name: a.name,
        tags: a.tags,
        group: a.group || '',
        note: a.note || '',
        favorite: false,
        uses: 0,
        createdAt: now(),
        updatedAt: now()
      })),
      characters: CHARACTER_SEEDS.map((c) => ({
        id: uid(),
        name: c.name,
        prompt: c.prompt,
        avoid: c.avoid || '',
        group: c.group || '',
        note: c.note || '',
        favorite: false,
        uses: 0,
        createdAt: now(),
        updatedAt: now()
      })),
      chat: null
    };
  }

  function mergeSettings(base, patch) {
    const out = { ...base, ...patch };
    out.llm = { ...base.llm, ...(patch && patch.llm) };
    out.designer = { ...base.designer, ...(patch && patch.designer) };
    return out;
  }

  function normalize(state) {
    const d = defaultState();
    if (!state || typeof state !== 'object') return d;
    const s = mergeSettings(d.settings, state.settings || {});
    const artists = Array.isArray(state.artists)
      ? state.artists.filter(Boolean).map((a) => ({
          id: a.id || uid(),
          name: String(a.name || a.tags || '未命名'),
          tags: Array.isArray(a.tags) ? a.tags.join(', ') : String(a.tags || ''),
          group: String(a.group || ''),
          note: String(a.note || ''),
          favorite: !!a.favorite,
          uses: Number(a.uses) || 0,
          createdAt: Number(a.createdAt) || now(),
          updatedAt: Number(a.updatedAt) || now()
        }))
      : d.artists;
    const characters = Array.isArray(state.characters)
      ? state.characters.filter(Boolean).map((c) => ({
          id: c.id || uid(),
          name: String(c.name || '未命名'),
          prompt: String(c.prompt || ''),
          avoid: String(c.avoid || ''),
          group: String(c.group || ''),
          note: String(c.note || ''),
          favorite: !!c.favorite,
          uses: Number(c.uses) || 0,
          createdAt: Number(c.createdAt) || now(),
          updatedAt: Number(c.updatedAt) || now()
        }))
      : d.characters;
    return { schemaVersion: SCHEMA_VERSION, settings: s, artists, characters, chat: state.chat || null };
  }

  // ---------------------------------------------------------------- storage
  const memory = { state: null };
  const listeners = new Set();
  let loadPromise = null;

  const hasChromeStorage =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function readRaw() {
    if (!hasChromeStorage) {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(KEY, (obj) => resolve(obj ? obj[KEY] : null));
    });
  }

  function writeRaw(state) {
    if (!hasChromeStorage) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* ignore quota */
      }
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [KEY]: state }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        err ? reject(new Error(err.message)) : resolve();
      });
    });
  }

  async function load(force) {
    if (memory.state && !force) return memory.state;
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      const raw = await readRaw();
      const state = normalize(raw);
      memory.state = state;
      if (!raw) await writeRaw(state);
      return state;
    })();
    return loadPromise;
  }

  async function save(state) {
    memory.state = normalize(state);
    await writeRaw(memory.state);
    listeners.forEach((fn) => {
      try {
        fn(memory.state);
      } catch (e) {
        /* ignore listener errors */
      }
    });
    return memory.state;
  }

  async function update(mutator) {
    const state = await load();
    const draft = JSON.parse(JSON.stringify(state));
    const result = (await mutator(draft)) || draft;
    return save(result);
  }

  if (hasChromeStorage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[KEY]) return;
      memory.state = normalize(changes[KEY].newValue);
      listeners.forEach((fn) => {
        try {
          fn(memory.state);
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  // ------------------------------------------------------------------ public
  const api = {
    KEY,
    uid,
    load,
    save,
    update,
    normalize,
    defaultState,
    defaultSettings,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async getState() {
      return load();
    },
    async patchSettings(patch) {
      return update((s) => {
        s.settings = mergeSettings(s.settings, patch);
      });
    },
    async listArtists() {
      return (await load()).artists.slice();
    },
    async listCharacters() {
      return (await load()).characters.slice();
    },
    async upsertArtist(entry) {
      let saved = null;
      await update((s) => {
        const i = s.artists.findIndex((a) => a.id === entry.id);
        const item = {
          id: entry.id || uid(),
          name: String(entry.name || '').trim() || '未命名画师串',
          tags: String(entry.tags || '').trim(),
          group: String(entry.group || '').trim(),
          note: String(entry.note || '').trim(),
          favorite: !!entry.favorite,
          uses: Number(entry.uses) || 0,
          createdAt: entry.createdAt || now(),
          updatedAt: now()
        };
        if (i >= 0) s.artists[i] = { ...s.artists[i], ...item };
        else s.artists.unshift(item);
        saved = item;
      });
      return saved;
    },
    async upsertCharacter(entry) {
      let saved = null;
      await update((s) => {
        const i = s.characters.findIndex((c) => c.id === entry.id);
        const item = {
          id: entry.id || uid(),
          name: String(entry.name || '').trim() || '未命名角色串',
          prompt: String(entry.prompt || '').trim(),
          avoid: String(entry.avoid || '').trim(),
          group: String(entry.group || '').trim(),
          note: String(entry.note || '').trim(),
          favorite: !!entry.favorite,
          uses: Number(entry.uses) || 0,
          createdAt: entry.createdAt || now(),
          updatedAt: now()
        };
        if (i >= 0) s.characters[i] = { ...s.characters[i], ...item };
        else s.characters.unshift(item);
        saved = item;
      });
      return saved;
    },
    async removeArtist(id) {
      return update((s) => {
        s.artists = s.artists.filter((a) => a.id !== id);
      });
    },
    async removeCharacter(id) {
      return update((s) => {
        s.characters = s.characters.filter((c) => c.id !== id);
      });
    },
    async markUsed(kind, id) {
      return update((s) => {
        const list = kind === 'artist' ? s.artists : s.characters;
        const item = list.find((x) => x.id === id);
        if (item) {
          item.uses = (Number(item.uses) || 0) + 1;
          item.updatedAt = now();
        }
      });
    },
    async exportData() {
      const s = await load();
      return {
        app: 'idlecloud-prompt-studio',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        artists: s.artists,
        characters: s.characters,
        settings: s.settings
      };
    },
    async importData(data, { merge = true } = {}) {
      if (!data || typeof data !== 'object') throw new Error('文件格式不正确');
      const incoming = normalize({
        settings: data.settings,
        artists: data.artists || data.artist,
        characters: data.characters || data.character
      });
      return update((s) => {
        if (merge) {
          const byId = new Map(s.artists.map((a) => [a.id, a]));
          incoming.artists.forEach((a) => {
            const old = byId.get(a.id);
            if (old) byId.set(a.id, { ...old, ...a, updatedAt: now() });
            else byId.set(a.id, a);
          });
          s.artists = Array.from(byId.values());
          const byCid = new Map(s.characters.map((c) => [c.id, c]));
          incoming.characters.forEach((c) => {
            const old = byCid.get(c.id);
            if (old) byCid.set(c.id, { ...old, ...c, updatedAt: now() });
            else byCid.set(c.id, c);
          });
          s.characters = Array.from(byCid.values());
          s.settings = mergeSettings(s.settings, data.settings || {});
        } else {
          if (incoming.artists.length) s.artists = incoming.artists;
          if (incoming.characters.length) s.characters = incoming.characters;
          if (data.settings) s.settings = mergeSettings(s.settings, data.settings);
        }
      });
    },
    async resetLibrary() {
      return update((s) => {
        s.artists = [];
        s.characters = [];
      });
    },
    async saveChat(chat) {
      return update((s) => {
        s.chat = chat;
      });
    }
  };

  NS[Object.keys(NS).length ? 'v1' : 'v1'] = api;
  // 主入口保持稳定：IdleStore 本身就是 API，同时暴露 IdleStore.v1 兼容未来版本。
  Object.assign(NS, api);
  NS.v1 = api;
})();
