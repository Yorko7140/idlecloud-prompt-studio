'use strict';

const Store = globalThis.IdleStore;
const $ = (id) => document.getElementById(id);

let state = null;
let filters = { artist: '', character: '' };

async function init() {
  state = await Store.load();
  bind();
  render();
  Store.subscribe((s) => {
    state = s;
    render();
  });
}

function bind() {
  $('artist-search').addEventListener('input', (e) => {
    filters.artist = e.target.value.trim().toLowerCase();
    renderArtists();
  });
  $('char-search').addEventListener('input', (e) => {
    filters.character = e.target.value.trim().toLowerCase();
    renderCharacters();
  });
  $('artist-add').addEventListener('click', () => openEditor('artist'));
  $('char-add').addEventListener('click', () => openEditor('character'));
  $('open-draw').addEventListener('click', () => chrome.tabs.create({ url: 'https://nai.idlecloud.cc/main' }));
  $('export').addEventListener('click', doExport);
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', doImport);
  $('import-toml').addEventListener('click', () => $('toml-file').click());
  $('toml-file').addEventListener('change', doImportToml);
  $('save').addEventListener('click', saveSettings);

  $('editor-save').addEventListener('click', (e) => {
    e.preventDefault();
    commitEditor();
  });
}

async function doImportToml() {
  const input = $('toml-file');
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  try {
    const report = await globalThis.IdleToml.importFiles(Store, files);
    alert(
      `导入完成\n画师串 +${report.artists}\n角色串 +${report.characters}` +
        (report.skipped ? `\n跳过重复/空项 ${report.skipped}` : '')
    );
  } catch (e) {
    alert('导入失败：' + e.message);
  }
}

function render() {
  renderArtists();
  renderCharacters();
  const s = state.settings;
  $('fill-mode').value = s.fillMode;
  $('separator').value = s.separator;
  $('designer-model').value = s.designer.model;
  $('auto-quality').checked = s.designer.autoQuality !== false;
  $('llm-base').value = s.llm.baseUrl || '';
  $('llm-model').value = s.llm.model || '';
  $('llm-key').value = s.llm.apiKey || '';
}

function matches(item, q) {
  if (!q) return true;
  return [item.name, item.group, item.note, item.prompt, item.avoid, ...(item.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function renderArtists() {
  const list = $('artist-list');
  const items = state.artists.filter((a) => matches(a, filters.artist));
  $('artist-count').textContent = state.artists.length;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="empty">还没有画师串。点右上角「新增画师串」。</div>';
    return;
  }
  items.forEach((a) => list.appendChild(card(a, 'artist')));
}

function renderCharacters() {
  const list = $('char-list');
  const items = state.characters.filter((c) => matches(c, filters.character));
  $('char-count').textContent = state.characters.length;
  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<div class="empty">还没有角色串。点右上角「新增角色串」。</div>';
    return;
  }
  items.forEach((c) => list.appendChild(card(c, 'character')));
}

function card(item, kind) {
  const el = document.createElement('div');
  el.className = 'item';
  const head = document.createElement('div');
  head.className = 'item-head';
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;
  head.appendChild(name);
  if (item.group) {
    const g = document.createElement('span');
    g.className = 'item-group';
    g.textContent = item.group;
    head.appendChild(g);
  }
  el.appendChild(head);

  const p = document.createElement('div');
  p.className = 'item-prompt';
  p.textContent = item.prompt || item.avoid || '（空）';
  el.appendChild(p);

  if (kind === 'character' && item.avoid) {
    const a = document.createElement('div');
    a.className = 'item-prompt';
    a.style.color = '#8f9ab0';
    a.textContent = 'Avoid: ' + item.avoid;
    el.appendChild(a);
  }

  const tags = (item.tags || []).map((t) => '#' + t).join(' ');
  if (tags || item.note) {
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent = [tags, item.note].filter(Boolean).join(' · ');
    el.appendChild(note);
  }

  const foot = document.createElement('div');
  foot.className = 'item-foot';
  const copy = document.createElement('button');
  copy.className = 'btn ghost';
  copy.textContent = '复制';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(item.prompt || '');
    copy.textContent = '已复制';
    setTimeout(() => (copy.textContent = '复制'), 1200);
  });
  const edit = document.createElement('button');
  edit.className = 'btn ghost';
  edit.textContent = '编辑';
  edit.addEventListener('click', () => openEditor(kind, item));
  const del = document.createElement('button');
  del.className = 'btn danger';
  del.textContent = '删除';
  del.addEventListener('click', async () => {
    if (!confirm(`删除「${item.name}」？`)) return;
    if (kind === 'artist') await Store.removeArtist(item.id);
    else await Store.removeCharacter(item.id);
  });
  foot.append(copy, edit, del);
  el.appendChild(foot);
  return el;
}

// ------------------------------------------------------------------ editor
let editorState = { kind: 'artist', item: null };

function openEditor(kind, item) {
  editorState = { kind, item: item || null };
  $('editor-title').textContent = (item ? '编辑' : '新增') + (kind === 'artist' ? '画师串' : '角色串');
  $('f-name').value = item ? item.name : '';
  $('f-group').value = item ? item.group || '' : '';
  $('f-tags').value = item ? (item.tags || []).join(', ') : '';
  $('f-prompt').value = item ? item.prompt || '' : '';
  $('f-avoid').value = item ? item.avoid || '' : '';
  $('f-note').value = item ? item.note || '' : '';
  $('f-avoid-wrap').style.display = kind === 'character' ? '' : 'none';
  $('editor').showModal();
  setTimeout(() => $('f-name').focus(), 30);
}

async function commitEditor() {
  const { kind } = editorState;
  const name = $('f-name').value.trim();
  if (!name) {
    alert('请填写名称');
    return;
  }
  const data = {
    name,
    group: $('f-group').value.trim(),
    tags: $('f-tags')
      .value.split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean),
    prompt: $('f-prompt').value.trim(),
    avoid: kind === 'character' ? $('f-avoid').value.trim() : '',
    note: $('f-note').value.trim()
  };
  if (kind === 'artist') await Store.upsertArtist(data);
  else await Store.upsertCharacter(data);
  $('editor').close();
}

// ------------------------------------------------------------------ settings
async function saveSettings() {
  await Store.patchSettings({
    fillMode: $('fill-mode').value,
    separator: $('separator').value || ', ',
    designer: Object.assign({}, state.settings.designer, {
      model: $('designer-model').value,
      autoQuality: $('auto-quality').checked
    }),
    llm: Object.assign({}, state.settings.llm, {
      baseUrl: $('llm-base').value.trim(),
      model: $('llm-model').value.trim(),
      apiKey: $('llm-key').value.trim()
    })
  });
  $('save-hint').textContent = '已保存 ' + new Date().toLocaleTimeString();
}

async function doExport() {
  const data = await Store.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `idlecloud-prompt-studio-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function doImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm('导入会合并到现有库（同 id 覆盖），继续？')) return;
    await Store.importData(data, { merge: true });
    alert('导入完成');
  } catch (err) {
    alert('导入失败：' + err.message);
  } finally {
    e.target.value = '';
  }
}

init();
