/*
 * 迷你 TOML 解析器（够用于 MaiBot 插件的 generation_profiles.toml / character_cards.toml）
 * 支持：注释、[table]、[[array of tables]]、基本字符串（含转义）、字面量字符串、
 *       数组（可跨行）、数字、布尔。挂在 globalThis.IdleToml。
 */
(function () {
  'use strict';

  function parse(text) {
    const root = {};
    let current = root;
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      i += 1;
      const trimmed = stripComment(line).trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('[[')) {
        const name = trimmed.slice(2, trimmed.indexOf(']]')).trim();
        const arr = (root[name] = root[name] || []);
        const obj = {};
        arr.push(obj);
        current = obj;
        continue;
      }
      if (trimmed.startsWith('[')) {
        const name = trimmed.slice(1, trimmed.indexOf(']')).trim();
        const path = name.split('.').filter(Boolean);
        let node = root;
        path.forEach((seg) => {
          if (!node[seg] || typeof node[seg] !== 'object') node[seg] = {};
          node = node[seg];
        });
        current = node;
        continue;
      }
      // key = value（value 可能跨行：数组）
      const eq = findAssign(trimmed);
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim().replace(/^["']|["']$/g, '');
      let rest = trimmed.slice(eq + 1).trim();
      while (needsMore(rest) && i < lines.length) {
        rest += '\n' + stripComment(lines[i]).trim();
        i += 1;
      }
      current[key] = parseValue(rest.trim());
    }
    return root;
  }

  function findAssign(s) {
    let quote = null;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (quote) {
        if (ch === '\\' && quote === '"') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '=') return i;
    }
    return -1;
  }

  function stripComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quote) {
        if (ch === '\\' && quote === '"') i += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '#') return line.slice(0, i);
    }
    return line;
  }

  function needsMore(v) {
    if (!v.startsWith('[')) return false;
    let depth = 0;
    for (let i = 0; i < v.length; i += 1) {
      const ch = v[i];
      if (ch === '"' || ch === "'") {
        const q = ch;
        i += 1;
        while (i < v.length && v[i] !== q) {
          if (v[i] === '\\' && q === '"') i += 1;
          i += 1;
        }
      } else if (ch === '[') depth += 1;
      else if (ch === ']') depth -= 1;
    }
    return depth > 0;
  }

  function parseValue(v) {
    if (v.startsWith('"') && v.endsWith('"')) return unescape(v.slice(1, -1));
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
    if (v.startsWith('[')) {
      const inner = v.slice(1, -1);
      const out = [];
      splitTop(inner).forEach((part) => {
        const p = part.trim();
        if (p) out.push(parseValue(p));
      });
      return out;
    }
    if (v === 'true') return true;
    if (v === 'false') return false;
    const num = Number(v.replace(/_/g, ''));
    if (!Number.isNaN(num) && v !== '') return num;
    return v;
  }

  function splitTop(s) {
    const parts = [];
    let buf = '';
    let depth = 0;
    let quote = null;
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];
      if (quote) {
        buf += ch;
        if (ch === '\\' && quote === '"') {
          buf += s[i + 1] || '';
          i += 1;
        } else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        buf += ch;
      } else if (ch === '[' || ch === '{') {
        depth += 1;
        buf += ch;
      } else if (ch === ']' || ch === '}') {
        depth -= 1;
        buf += ch;
      } else if (ch === ',' && depth === 0) {
        parts.push(buf);
        buf = '';
      } else buf += ch;
    }
    if (buf.trim()) parts.push(buf);
    return parts;
  }

  function unescape(s) {
    return s.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (m, seq) => {
      if (seq[0] === 'u' || seq[0] === 'U') return String.fromCodePoint(parseInt(seq.slice(1), 16));
      const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\' };
      return map[seq] != null ? map[seq] : seq;
    });
  }

  // ------------------------------------------------------- MaiBot 数据转换
  function convert(data) {
    const artists = [];
    const characters = [];
    const stylesOf = (profile, label) => {
      const styles = data[profile] && data[profile].styles;
      if (!styles || typeof styles !== 'object') return;
      Object.keys(styles).forEach((key) => {
        const value = String(styles[key] || '').trim();
        if (!value) return;
        artists.push({
          name: `${profile === 'primary' ? '主模型' : '备用模型'} · 画风 ${key}`,
          tags: value,
          group: `MaiBot 画风串（${label}）`,
          note: `由 generation_profiles.toml 的 ${profile}.styles.${key} 导入`
        });
      });
    };
    stylesOf('primary', '主');
    stylesOf('fallback', '备');

    (Array.isArray(data.characters) ? data.characters : []).forEach((c) => {
      const promptParts = [c.prompt, c.default_outfit].filter((x) => x && String(x).trim());
      const prompt = promptParts.join(', ');
      if (!prompt && !c.negative) return;
      characters.push({
        name: String(c.name || c.id || '未命名角色'),
        prompt,
        avoid: String(c.negative || ''),
        group: 'MaiBot 角色卡',
        note: String(c.description || '').slice(0, 200)
      });
    });

    return { artists, characters };
  }

  async function importFiles(store, files) {
    const [artists, characters] = await Promise.all([store.listArtists(), store.listCharacters()]);
    const seenA = new Set(artists.map((a) => String(a.name || '').trim().toLowerCase()));
    const seenC = new Set(characters.map((c) => String(c.name || '').trim().toLowerCase()));
    const report = { artists: 0, characters: 0, skipped: 0, files: [] };
    for (const file of files) {
      const text = await file.text();
      const converted = convert(parse(text));
      report.files.push(file.name);
      for (const item of converted.artists) {
        const key = item.name.trim().toLowerCase();
        if (!item.tags || seenA.has(key)) {
          report.skipped += 1;
          continue;
        }
        await store.upsertArtist(item);
        seenA.add(key);
        report.artists += 1;
      }
      for (const item of converted.characters) {
        const key = item.name.trim().toLowerCase();
        if (seenC.has(key)) {
          report.skipped += 1;
          continue;
        }
        await store.upsertCharacter(item);
        seenC.add(key);
        report.characters += 1;
      }
    }
    return report;
  }

  globalThis.IdleToml = { parse, convert, importFiles };
})();
