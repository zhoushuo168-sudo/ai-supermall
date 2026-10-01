/* Visuals & posters lifecycle. This is deliberately browser-side: private
   media and generated artwork still travel only through the existing API. */
(() => {
  if (document.body.dataset.workspace !== 'visual') return;

  const $ = selector => document.querySelector(selector);
  const get = id => document.getElementById(id);
  const form = get('workspaceForm');
  const input = get('taskInput');
  const nameInput = get('projectName');
  const fileInput = get('fileInput');
  const maxBytes = 20 * 1024 * 1024;
  const draftFlag = 'ai-supermall-visual-draft-pending';
  const state = { assets: [], messages: [], textLayers: [], projectId: '', title: '', status: 'editing', saving: null, generating: false, timer: 0, loadToken: 0, restoredFromChat: false };
  const diag = { restored: false, lines: [] };
  const fileMeta = (file, label) => ({
    [label + 'Ctor']: file == null ? 'null' : (file.constructor && file.constructor.name) || typeof file,
    [label + 'Blob']: file instanceof Blob,
    [label + 'File']: file instanceof File,
    [label + 'Size']: file && typeof file.size === 'number' ? file.size : null,
    [label + 'Type']: String(file && file.type || '').slice(0, 40),
    [label + 'NameLen']: String(file && file.name || '').length
  });
  const paintDiag = () => {
    const node = get('workspaceStatus');
    if (!node) return;
    const dump = diag.lines.slice(-8).map(line => JSON.stringify(line)).join(' / ');
    node.dataset.diag = dump;
  };
  const diagNote = (phase, extra) => {
    const line = { t: Date.now() % 1e9, phase, restored: diag.restored, ...extra };
    diag.lines = diag.lines.slice(-30).concat(line);
    try { sessionStorage.setItem('ai-supermall-oss-diag', JSON.stringify(diag.lines)); } catch {}
    paintDiag();
  };
  const tr = () => document.documentElement.lang === 'en' ? {
    unnamed: 'Untitled project', projectName: 'Project name', task: 'Your task', save: 'Save to Project',
    saved: 'Saved to your project.', saving: 'Saving your project…', generating: 'AI is generating your image…',
    restored: 'Your unfinished work was restored. You can keep editing it.', upload: 'Upload image',
    selected: count => `Selected images (${count}/10)`, add: 'Add more images', clear: 'Clear all',
    refine: 'Continue editing', complete: 'Complete', completed: 'Completed', editing: 'Editing',
    completeConfirm: 'Save the latest artwork as the completed version of this project?', completedMessage: 'This project is marked completed. You can still reopen it and continue editing later.',
    download: 'Download image', login: 'Sign in to save this work', required: 'Describe what you would like to create.',
    imageError: 'The image could not load.', tooLarge: 'Please choose an image under 20 MB.', unsupported: 'Choose a JPG, PNG, or WEBP image.', titlePlaceholder: 'Enter a project name', titleRequired: 'Enter a project name before saving this image-only task.',
    titleSaved: 'Project name updated.', retry: 'Try again', addText: 'Add text', text: 'Text', textPlaceholder: 'Type exact text', fontSize: 'Size', weight: 'Bold', normal: 'Regular', bold: 'Bold', color: 'Color', align: 'Align', left: 'Left', center: 'Center', right: 'Right', position: 'Position', top: 'Top', middle: 'Middle', bottom: 'Bottom', removeText: 'Remove text', textLayers: 'Exact text', textHint: 'Text is placed by AI SuperMall and stays exactly as you enter it.', textAdded: 'Text layer added.', continueChat: 'Continue discussing', continueMaking: 'Continue making', projectRestored: 'Your project is ready. Choose how you would like to continue.'
  } : {
    unnamed: '未命名项目', projectName: '项目名称', task: '你的任务', save: '保存到项目',
    saved: '已保存到项目。', saving: '正在保存项目…', generating: 'AI 正在生成图片…',
    restored: '已恢复登录前未完成的创作，你可以继续编辑。', upload: '上传图片',
    selected: count => `已选图片（${count}/10）`, add: '添加更多图片', clear: '全部清除',
    refine: '继续修改', complete: '完成', completed: '已完成', editing: '编辑中',
    completeConfirm: '将最新作品保存为此项目的完成版本吗？', completedMessage: '项目已标记为完成。以后仍可重新打开并继续编辑。',
    download: '下载图片', login: '登录后即可保存这份作品', required: '请描述你想创作或修改的内容。',
    imageError: '图片无法加载。', tooLarge: '请选择小于 20 MB 的图片。', unsupported: '请选择 JPG、PNG 或 WEBP 图片。', titlePlaceholder: '请输入项目名称', titleRequired: '仅上传图片时，请先输入项目名称再保存。',
    titleSaved: '项目名称已更新。', retry: '重新尝试', addText: '添加文字', text: '文字', textPlaceholder: '输入准确文字', fontSize: '字号', weight: '字重', normal: '普通', bold: '粗体', color: '颜色', align: '对齐', left: '左对齐', center: '居中', right: '右对齐', position: '位置', top: '顶部', middle: '中间', bottom: '底部', removeText: '删除文字', textLayers: '精确文字', textHint: '文字由 AI SuperMall 程序排版，会按你的输入原样保留。', textAdded: '已添加文字层。', continueChat: '继续聊这个项目', continueMaking: '继续制作', projectRestored: '项目已恢复。请选择下一步。'
  };
  const language = () => document.documentElement.lang === 'en' ? 'en' : 'zh';
  const api = async (path, options = {}) => {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((body.error || 'Request failed') + (body.diag ? ` diag:${body.diag}` : ''));
    return body;
  };
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const patch = body => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const setStatus = message => { get('workspaceStatus').textContent = message || ''; get('workspaceGenerationStatus').textContent = message || ''; paintDiag(); };
  const isImage = file => /^(image\/jpeg|image\/png|image\/webp)$/.test(String(file?.type || '').toLowerCase());
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `asset-${Date.now()}-${Math.random()}`;
  const assetKey = file => [file.name, file.size, file.lastModified].join(':');
  const queryParams = new URLSearchParams(location.search);
  const projectUrl = () => state.projectId ? `create-visual.html?project=${encodeURIComponent(state.projectId)}` : 'create-visual.html?restoreDraft=1';
  const safeMedia = item => item && item.path ? { provider: item.provider || 'supabase', path: item.path, name: item.name || 'image', type: item.type || 'image/png', kind: item.kind || 'reference' } : null;
  const cleanLayers = layers => Array.isArray(layers) ? layers.slice(0, 12).map(layer => ({
    id: String(layer?.id || id()).slice(0, 80), text: String(layer?.text || '').slice(0, 240),
    size: Math.max(14, Math.min(120, Number(layer?.size) || 34)), bold: Boolean(layer?.bold),
    color: /^#[0-9a-f]{6}$/i.test(String(layer?.color || '')) ? String(layer.color) : '#ffffff',
    align: ['left', 'center', 'right'].includes(layer?.align) ? layer.align : 'center',
    position: ['top', 'middle', 'bottom'].includes(layer?.position) ? layer.position : 'bottom'
  })).filter(layer => layer.text) : [];
  const newTextLayer = () => ({ id: id(), text: '', size: 34, bold: true, color: '#ffffff', align: 'center', position: 'bottom' });

  function applyVisualCopy() {
    const english = language() === 'en';
    document.title = english ? 'AI SuperMall — Visuals & posters' : 'AI SuperMall — 视觉与海报';
    get('workspaceTitle').textContent = english ? 'Visuals & posters' : '视觉与海报';
    get('workspaceDescription').textContent = english ? 'Upload an image or begin with an idea. Create and refine visual work in one place.' : '上传图片，或从一个想法开始。在同一个工作台中创作并继续修改。';
    get('uploadLabel').textContent = english ? 'Upload image' : '上传图片';
    get('dropText').textContent = english ? 'Drop JPG, PNG, or WEBP images here' : '拖放 JPG、PNG 或 WEBP 图片到这里';
    get('formatText').textContent = english ? 'Up to 20 MB. Signed-in projects store images privately.' : '最大 20 MB。登录后保存到项目的图片会私密保存。';
    get('visualTaskPanel').querySelector('h2').textContent = english ? 'Tell AI what you want to accomplish' : '告诉 AI 你想完成什么';
    get('visualTaskPanel').querySelector('p').textContent = english ? 'Your task stays in this visual workspace.' : '你的任务会保留在这个视觉工作台中。';
    get('workspaceSubmit').textContent = english ? 'Prepare visual plan' : '准备视觉方案';
    nameInput.placeholder = tr().titlePlaceholder;
    get('taskInput').placeholder = english ? 'What image or poster would you like to create?' : '你想创作什么图片或海报？';
    get('workspaceResults').querySelector('h2').textContent = 'AI SuperMall';
    get('workspaceResults').querySelector('p').textContent = english ? 'Continue refining your work below.' : '在下方继续修改你的作品。';
    get('homeLink').textContent = english ? 'Home' : '首页';
    get('projectsLink').textContent = english ? 'My Projects' : '我的项目';
    get('languageToggle').textContent = english ? '中文' : 'EN';
    get('workspaceNote').textContent = state.projectId
      ? (english ? 'Images are securely saved in your private project.' : '图片已安全保存到你的私有项目中。')
      : (english ? 'Images are not saved yet; they will save securely after sign-in.' : '图片尚未保存；登录后会安全保存到你的项目中。');
  }

  function restoreHandoff() {
    if (queryParams.get('handoff') !== '1') return false;
    try {
      const handoff = JSON.parse(sessionStorage.getItem('ai-supermall-workspace-handoff') || '{}');
      if (handoff.workspace !== 'visual' || typeof handoff.task !== 'string' || !handoff.task.trim()) return false;
      input.value = handoff.task.trim().slice(0, 2000);
      if (handoff.language === 'en' || handoff.language === 'zh') {
        localStorage.setItem('ai-supermall-language', handoff.language);
        document.documentElement.lang = handoff.language === 'en' ? 'en' : 'zh-CN';
      }
      sessionStorage.removeItem('ai-supermall-workspace-handoff');
      history.replaceState(null, '', 'create-visual.html?new=1');
      return true;
    } catch { sessionStorage.removeItem('ai-supermall-workspace-handoff'); return false; }
  }

  function release(asset) { if (asset?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(asset.previewUrl); }
  function statusLabel() {
    let badge = get('visualProjectStatus');
    if (!badge) {
      badge = document.createElement('small');
      badge.id = 'visualProjectStatus';
      badge.className = 'visual-project-status';
      get('visualTaskPanel').querySelector('p').after(badge);
    }
    badge.textContent = state.projectId ? (state.status === 'completed' ? tr().completed : tr().editing) : '';
  }
  function projectChoices() {
    if (!state.projectId) return;
    let panel = get('visualProjectChoices');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'visualProjectChoices';
      panel.className = 'visual-project-choices';
      get('visualTaskPanel').querySelector('p').after(panel);
    }
    panel.replaceChildren();
    const note = document.createElement('small');
    const chat = document.createElement('button');
    const make = document.createElement('button');
    note.textContent = tr().projectRestored;
    chat.type = make.type = 'button';
    chat.textContent = tr().continueChat;
    make.textContent = tr().continueMaking;
    chat.addEventListener('click', () => { input.placeholder = language() === 'en' ? 'Add a detail or ask a question about this project…' : '补充需求或继续讨论这个项目…'; input.focus(); });
    make.addEventListener('click', () => { input.placeholder = language() === 'en' ? 'Describe what you would like to create or change…' : '描述接下来想制作或修改什么…'; get('visualUploadPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); input.focus({ preventScroll: true }); });
    panel.append(note, chat, make);
  }
  function assetsPanel() {
    let panel = get('visualWorkflowAssets');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'visualWorkflowAssets';
    panel.className = 'image-assets';
    panel.innerHTML = '<div class="image-assets-heading"><strong></strong><button type="button"></button></div><div class="image-assets-grid"></div>';
    get('workspaceStatus').after(panel);
    panel.querySelector('button').addEventListener('click', () => {
      state.assets.forEach(release);
      state.assets = [];
      renderAssets();
      persistDraft();
      scheduleSave();
    });
    return panel;
  }
  function renderAssets() {
    const panel = assetsPanel();
    const title = panel.querySelector('strong');
    const clear = panel.querySelector('button');
    const grid = panel.querySelector('.image-assets-grid');
    title.textContent = tr().selected(state.assets.length);
    clear.textContent = tr().clear;
    clear.hidden = !state.assets.length;
    get('uploadButton').textContent = state.assets.length ? tr().add : tr().upload;
    grid.replaceChildren();
    state.assets.forEach(asset => {
      const card = document.createElement('article');
      const image = document.createElement('img');
      const filename = document.createElement('span');
      const remove = document.createElement('button');
      image.src = asset.previewUrl || asset.url || '';
      image.alt = asset.name;
      filename.textContent = asset.name;
      remove.type = 'button';
      remove.className = 'image-asset-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `${language() === 'en' ? 'Remove' : '删除'} ${asset.name}`);
      remove.addEventListener('click', () => {
        const index = state.assets.findIndex(item => item.id === asset.id);
        if (index >= 0) release(state.assets.splice(index, 1)[0]);
        renderAssets();
        persistDraft();
        scheduleSave();
      });
      card.append(image, filename, remove);
      grid.append(card);
    });
    panel.hidden = !state.assets.length;
  }
  function addFiles(files) {
    const known = new Set(state.assets.map(asset => asset.fingerprint));
    let invalid = 0, tooLarge = 0;
    Array.from(files || []).forEach(file => {
      if (!isImage(file)) { invalid += 1; return; }
      if (file.size > maxBytes) { tooLarge += 1; return; }
      if (state.assets.length >= 10 || known.has(assetKey(file))) return;
      known.add(assetKey(file));
      state.assets.push({ id: id(), fingerprint: assetKey(file), file, name: file.name, type: file.type, size: file.size, previewUrl: URL.createObjectURL(file), path: '', provider: '' });
    });
    fileInput.value = '';
    renderAssets();
    if (invalid) setStatus(tr().unsupported);
    else if (tooLarge) setStatus(tr().tooLarge);
    else setStatus('');
    persistDraft();
    scheduleSave();
  }

  async function persistDraft() {
    const storage = window.AISuperMallVisualDraft;
    if (!storage) return;
    const hasContent = Boolean(input.value.trim() || nameInput.value.trim() || state.assets.length || state.messages.length);
    if (!hasContent) return;
    const assets = state.assets.map(asset => ({ id: asset.id, fingerprint: asset.fingerprint, file: asset.file || null, name: asset.name, type: asset.type, size: asset.size, path: asset.path || '', provider: asset.provider || '', url: asset.url || '' }));
    assets.forEach((asset, index) => diagNote('persistDraft', { id: String(asset.id || '').slice(0, 36), index, ...fileMeta(asset.file, 'w') }));
    await storage.save({ version: 2, language: language(), title: nameInput.value, task: input.value, assets, messages: state.messages, textLayers: state.textLayers, projectId: state.projectId, status: state.status, savedAt: Date.now() });
    localStorage.setItem(draftFlag, '1');
  }
  async function clearDraft() {
    localStorage.removeItem(draftFlag);
    await window.AISuperMallVisualDraft?.clear().catch(() => {});
  }
  async function restoreDraft() {
    if (queryParams.get('restoreDraft') !== '1' || !localStorage.getItem(draftFlag)) return false;
    const draft = await window.AISuperMallVisualDraft?.load().catch(() => null);
    if (!draft) return false;
    diag.restored = true;
    (draft.assets || []).forEach((asset, index) => diagNote('idbLoad', { id: String(asset.id || '').slice(0, 36), index, ...fileMeta(asset.file, 'r') }));
    state.assets.forEach(release);
    state.assets = (draft.assets || []).map(asset => ({ ...asset, file: asset.file || null, previewUrl: asset.file ? URL.createObjectURL(asset.file) : asset.url || '' }));
    state.messages = Array.isArray(draft.messages) ? draft.messages : [];
    state.textLayers = cleanLayers(draft.textLayers);
    state.title = draft.title || '';
    state.status = draft.status || 'editing';
    nameInput.value = draft.title || '';
    input.value = draft.task || '';
    if (draft.language === 'en' || draft.language === 'zh') {
      localStorage.setItem('ai-supermall-language', draft.language);
      document.documentElement.lang = draft.language === 'en' ? 'en' : 'zh-CN';
    }
    renderAssets();
    renderResults();
    statusLabel();
    projectChoices();
    setStatus(tr().restored);
    history.replaceState(null, '', 'create-visual.html');
    if (await signedIn()) scheduleSave();
    return true;
  }
  async function signedIn() { const response = await fetch('/api/account/me'); return response.ok; }
  async function redirectToLogin() {
    await persistDraft();
    location.href = `account.html?mode=login&returnTo=${encodeURIComponent('create-visual.html?restoreDraft=1')}`;
  }

  function latestImage() {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const images = state.messages[i].images || [];
      if (images.length) return images[images.length - 1];
    }
    return null;
  }
  async function signedUrl(media) {
    if (!media?.path) return media?.url || '';
    const endpoint = media.provider === 'oss' ? '/api/member/oss-media?provider=oss&path=' : '/api/member/project-media?path=';
    return (await api(endpoint + encodeURIComponent(media.path))).url;
  }
  function stateMedia() {
    return state.assets.filter(asset => asset.path).map(asset => safeMedia(asset)).filter(Boolean);
  }
  async function localImageData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: file.type, data: String(reader.result || '') });
      reader.onerror = () => reject(new Error('Image could not be read.'));
      reader.readAsDataURL(file);
    });
  }
  async function ensureProject() {
    if (state.projectId) return state.projectId;
    const title = nameInput.value.trim() || input.value.trim().slice(0, 120) || String(state.messages.at(-1)?.question || '').trim().slice(0, 120);
    if (!title) { nameInput.focus(); throw new Error(tr().titleRequired); }
    const created = await api('/api/member/projects', json({ title, locale: language(), conversation: [] }));
    const project = Array.isArray(created) ? created[0] : created;
    if (!project?.id) throw new Error('Project could not be created.');
    state.projectId = project.id;
    state.title = project.title || title;
    history.replaceState(null, '', `create-visual.html?project=${encodeURIComponent(state.projectId)}`);
    statusLabel();
    return state.projectId;
  }
  async function uploadOriginals() {
    let index = 0;
    for (const asset of state.assets) {
      if (!asset.file || asset.path) { index += 1; continue; }
      diagNote('preForm', { id: String(asset.id || '').slice(0, 36), index, ...fileMeta(asset.file, 'u') });
      const formData = new FormData();
      formData.append('projectId', state.projectId);
      formData.append('kind', 'reference');
      const bytes = await asset.file.arrayBuffer();
      const uploadFile = new File([bytes], asset.name, { type: asset.file.type || asset.type || 'image/jpeg' });
      formData.append('file', uploadFile, asset.name);
      const part = formData.get('file');
      diagNote('postForm', { id: String(asset.id || '').slice(0, 36), index, ...fileMeta(part, 'f') });
      try {
        const saved = await api('/api/member/oss-media', { method: 'POST', body: formData });
        Object.assign(asset, saved.media, { previewUrl: asset.previewUrl });
      } catch (error) {
        diagNote('ossFail', { id: String(asset.id || '').slice(0, 36), index, err: String(error && error.message || '').slice(0, 160) });
        throw error;
      } finally {
        const probe = asset.file;
        if (probe instanceof Blob) {
          Promise.resolve()
            .then(() => probe.slice(0, probe.size).arrayBuffer())
            .then(buf => diagNote('postFetchBytes', { id: String(asset.id || '').slice(0, 36), index, byteLength: buf.byteLength }))
            .catch(err => diagNote('postFetchBytes', { id: String(asset.id || '').slice(0, 36), index, readErr: String(err && err.name || 'read') }));
        }
      }
      index += 1;
    }
  }
  async function persistGenerated() {
    const pending = [];
    state.messages.forEach((message, row) => (message.images || []).forEach((image, column) => {
      if (typeof image === 'string') pending.push({ clientId: `generated-${row}-${column}`, name: 'generated-artwork.png', url: image, kind: 'generated' });
    }));
    if (!pending.length) return;
    const result = await api('/api/member/project-media', json({ projectId: state.projectId, media: pending }));
    const saved = new Map((result.media || []).map(item => [item.clientId, item]));
    state.messages.forEach((message, row) => {
      message.images = (message.images || []).map((image, column) => typeof image === 'string' ? (saved.get(`generated-${row}-${column}`) || image) : image);
    });
  }
  function projectConversation() {
    const latest = latestImage();
    return [{
      type: 'workspace_state',
      workspace: 'visual',
      task: input.value.trim() || state.messages.at(-1)?.question || '',
      status: state.status,
      uploads: stateMedia(),
      finalImage: safeMedia(latest),
      textLayers: cleanLayers(state.textLayers)
    }, { type: 'project_meta', workspace: 'visual', intent: 'visual', task: input.value.trim() || state.messages.at(-1)?.question || '' }, ...state.messages];
  }
  async function saveProject(manual = false) {
    if (state.saving) return state.saving;
    const hasContent = Boolean(input.value.trim() || nameInput.value.trim() || state.assets.length || state.messages.length);
    if (!hasContent) return;
    const canNameProject = Boolean(nameInput.value.trim() || input.value.trim() || state.messages.length);
    if (!state.projectId && !canNameProject) {
      if (manual) { setStatus(tr().titleRequired); nameInput.focus(); }
      return;
    }
    if (!(await signedIn())) {
      await persistDraft();
      if (manual) await redirectToLogin();
      else setStatus(tr().login);
      return;
    }
    const work = (async () => {
      setStatus(tr().saving);
      await ensureProject();
      await uploadOriginals();
      await persistGenerated();
      await api('/api/member/projects', patch({ id: state.projectId, title: nameInput.value.trim() || state.title || String(state.messages.at(-1)?.question || '').trim().slice(0, 120), locale: language(), conversation: projectConversation() }));
      await clearDraft();
      setStatus(tr().saved);
    })();
    state.saving = work;
    try { await work; } finally { state.saving = null; }
  }
  function scheduleSave() {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => saveProject(false).catch(error => setStatus(error.message)), 900);
  }

  function layerPoint(layer) {
    return {
      x: layer.align === 'left' ? '9%' : layer.align === 'right' ? '91%' : '50%',
      y: layer.position === 'top' ? '10%' : layer.position === 'middle' ? '50%' : '90%'
    };
  }
  function fillTextOverlay(overlay) {
    overlay.replaceChildren();
    state.textLayers.forEach(layer => {
      const item = document.createElement('span');
      const point = layerPoint(layer);
      item.className = 'generated-text-layer';
      item.textContent = layer.text;
      item.style.left = point.x;
      item.style.top = point.y;
      item.style.textAlign = layer.align;
      item.style.fontSize = `${Math.max(13, Math.round(layer.size * 0.55))}px`;
      item.style.fontWeight = layer.bold ? '700' : '400';
      item.style.color = layer.color;
      item.style.transform = `translate(${layer.align === 'left' ? '0' : layer.align === 'right' ? '-100%' : '-50%'}, -50%)`;
      overlay.append(item);
    });
  }
  function refreshTextPreviews() {
    document.querySelectorAll('.generated-artwork-overlay').forEach(fillTextOverlay);
  }
  function onLayerChange(layer, change) {
    Object.assign(layer, change);
    refreshTextPreviews();
    persistDraft();
    scheduleSave();
  }
  function option(value, label, selected) {
    const item = document.createElement('option');
    item.value = value;
    item.textContent = label;
    item.selected = value === selected;
    return item;
  }
  function textEditor() {
    const editor = document.createElement('section');
    editor.className = 'visual-text-editor';
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    const hint = document.createElement('p');
    const add = document.createElement('button');
    title.textContent = tr().textLayers;
    hint.textContent = tr().textHint;
    add.type = 'button';
    add.textContent = tr().addText;
    add.addEventListener('click', () => {
      state.textLayers.push(newTextLayer());
      renderResults();
      persistDraft();
      scheduleSave();
      get('workspaceHistory').querySelector('.visual-text-value:last-of-type')?.focus();
    });
    heading.append(title, add);
    editor.append(heading, hint);
    const rows = document.createElement('div');
    rows.className = 'visual-text-rows';
    state.textLayers.forEach(layer => {
      const row = document.createElement('article');
      row.className = 'visual-text-row';
      const value = document.createElement('input');
      value.className = 'visual-text-value';
      value.maxLength = 240;
      value.value = layer.text;
      value.placeholder = tr().textPlaceholder;
      value.setAttribute('aria-label', tr().text);
      value.addEventListener('input', () => onLayerChange(layer, { text: value.value }));
      const controls = document.createElement('div');
      controls.className = 'visual-text-controls';
      const size = document.createElement('input');
      size.type = 'range'; size.min = '14'; size.max = '120'; size.value = String(layer.size); size.setAttribute('aria-label', tr().fontSize);
      size.addEventListener('input', () => onLayerChange(layer, { size: Number(size.value) }));
      const weight = document.createElement('button');
      weight.type = 'button'; weight.className = layer.bold ? 'is-active' : ''; weight.textContent = layer.bold ? tr().bold : tr().normal;
      weight.setAttribute('aria-label', tr().weight);
      weight.addEventListener('click', () => { onLayerChange(layer, { bold: !layer.bold }); weight.classList.toggle('is-active', layer.bold); weight.textContent = layer.bold ? tr().bold : tr().normal; });
      const color = document.createElement('input');
      color.type = 'color'; color.value = layer.color; color.setAttribute('aria-label', tr().color);
      color.addEventListener('input', () => onLayerChange(layer, { color: color.value }));
      const align = document.createElement('select');
      align.setAttribute('aria-label', tr().align);
      [['left', tr().left], ['center', tr().center], ['right', tr().right]].forEach(([key, label]) => align.append(option(key, label, layer.align)));
      align.addEventListener('change', () => onLayerChange(layer, { align: align.value }));
      const position = document.createElement('select');
      position.setAttribute('aria-label', tr().position);
      [['top', tr().top], ['middle', tr().middle], ['bottom', tr().bottom]].forEach(([key, label]) => position.append(option(key, label, layer.position)));
      position.addEventListener('change', () => onLayerChange(layer, { position: position.value }));
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'visual-text-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', tr().removeText);
      remove.addEventListener('click', () => { state.textLayers = state.textLayers.filter(item => item.id !== layer.id); renderResults(); persistDraft(); scheduleSave(); });
      controls.append(size, weight, color, align, position, remove);
      row.append(value, controls);
      rows.append(row);
    });
    editor.append(rows);
    return editor;
  }
  function artworkFrame(url, alt, preview) {
    const frame = document.createElement('div');
    frame.className = 'generated-artwork-frame';
    frame.append(preview);
    const overlay = document.createElement('div');
    overlay.className = 'generated-artwork-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    fillTextOverlay(overlay);
    frame.append(overlay);
    return frame;
  }
  function wrapCanvasText(ctx, text, maxWidth) {
    const output = [];
    String(text).split('\n').forEach(paragraph => {
      let line = '';
      Array.from(paragraph || ' ').forEach(character => {
        const candidate = line + character;
        if (line && ctx.measureText(candidate).width > maxWidth) { output.push(line); line = character; }
        else line = candidate;
      });
      output.push(line || ' ');
    });
    return output;
  }
  async function compositeImage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(tr().imageError);
    const sourceUrl = URL.createObjectURL(await response.blob());
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error(tr().imageError));
        element.src = sourceUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      state.textLayers.forEach(layer => {
        const scale = canvas.width / 1024;
        const size = Math.max(14, Math.round(layer.size * scale));
        const padding = canvas.width * 0.09;
        const point = layerPoint(layer);
        const x = layer.align === 'left' ? padding : layer.align === 'right' ? canvas.width - padding : canvas.width / 2;
        context.font = `${layer.bold ? '700' : '400'} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;
        context.fillStyle = layer.color;
        context.textAlign = layer.align;
        context.textBaseline = 'middle';
        context.shadowColor = 'rgba(0,0,0,.48)'; context.shadowBlur = Math.max(2, size * .12); context.shadowOffsetY = Math.max(1, size * .04);
        const lines = wrapCanvasText(context, layer.text, canvas.width - padding * 2);
        const lineHeight = Math.round(size * 1.22);
        const centerY = layer.position === 'top' ? canvas.height * .10 : layer.position === 'middle' ? canvas.height * .50 : canvas.height * .90;
        const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
        lines.forEach((line, index) => context.fillText(line, x, startY + index * lineHeight));
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error(tr().imageError);
      return blob;
    } finally { URL.revokeObjectURL(sourceUrl); }
  }

  function renderResults() {
    const results = get('workspaceResults');
    const history = get('workspaceHistory');
    history.replaceChildren();
    state.messages.forEach((message, index) => {
      const card = document.createElement('article');
      const request = document.createElement('strong');
      const answer = document.createElement('p');
      request.textContent = `${language() === 'en' ? 'Your request' : '本次需求'}: ${message.question || ''}`;
      answer.textContent = message.answer || '';
      card.append(request, answer);
      (message.images || []).forEach(image => {
        const url = typeof image === 'string' ? image : image.url;
        if (!url) return;
        const preview = document.createElement('img');
        preview.className = 'generated-image';
        preview.src = url;
        preview.alt = language() === 'en' ? 'Generated artwork' : '生成作品';
        preview.addEventListener('click', () => showPreview(url, preview.alt).catch(error => setStatus(error.message)));
        card.append(artworkFrame(url, preview.alt, preview));
      });
      if (index === state.messages.length - 1 && message.images?.length) {
        const actions = document.createElement('div');
        actions.className = 'visual-result-actions';
        const refine = document.createElement('button');
        const download = document.createElement('button');
        const complete = document.createElement('button');
        refine.type = download.type = complete.type = 'button';
        refine.textContent = tr().refine;
        download.textContent = tr().download;
        complete.textContent = tr().complete;
        refine.addEventListener('click', () => { input.value = ''; input.placeholder = language() === 'en' ? 'Describe your next change…' : '描述下一步想怎样修改…'; input.focus(); get('visualTaskPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        download.addEventListener('click', () => downloadImage(typeof message.images.at(-1) === 'string' ? message.images.at(-1) : message.images.at(-1).url));
        complete.addEventListener('click', () => completeProject().catch(error => setStatus(error.message)));
        actions.append(refine, download, complete);
        card.append(actions);
        card.append(textEditor());
      }
      history.append(card);
    });
    results.hidden = !state.messages.length;
  }
  async function showPreview(url, alt) {
    let modal = get('generatedImageModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generatedImageModal';
      modal.className = 'generated-image-modal';
      modal.innerHTML = '<div class="generated-image-modal-backdrop"></div><section class="generated-image-modal-panel" role="dialog" aria-modal="true"><button type="button" class="generated-image-modal-close">×</button><img></section>';
      const close = () => { if (modal.dataset.objectUrl) URL.revokeObjectURL(modal.dataset.objectUrl); delete modal.dataset.objectUrl; modal.hidden = true; };
      modal.querySelector('.generated-image-modal-backdrop').onclick = close;
      modal.querySelector('button').onclick = close;
      document.body.append(modal);
    }
    const image = modal.querySelector('img');
    if (modal.dataset.objectUrl) URL.revokeObjectURL(modal.dataset.objectUrl);
    if (state.textLayers.length) {
      const composite = await compositeImage(url);
      modal.dataset.objectUrl = URL.createObjectURL(composite);
      image.src = modal.dataset.objectUrl;
    } else image.src = url;
    image.alt = alt;
    modal.hidden = false;
  }
  async function downloadImage(url) {
    let blob;
    if (state.textLayers.length) blob = await compositeImage(url);
    else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(tr().imageError);
      blob = await response.blob();
    }
    const extension = state.textLayers.length ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
    const file = new File([blob], `ai-supermall-${Date.now()}.${extension}`, { type: blob.type || 'image/png' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: 'AI SuperMall' }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  const sentAssetIds = new Set();
  async function generate() {
    const prompt = input.value.trim();
    if (!prompt) { setStatus(tr().required); input.focus(); return; }
    if (state.generating) return;
    state.generating = true;
    get('workspaceSubmit').disabled = true;
    setStatus(tr().generating);
    try {
      const previous = latestImage();
      let images = [], projectMedia = [], includedAssets = [], replaceReferenceIds = false;
      if (previous) {
        if (typeof previous !== 'string' && previous.path) projectMedia = [safeMedia(previous)];
        else if (typeof previous === 'string') {
          const response = await fetch(previous);
          if (!response.ok) throw new Error(tr().imageError);
          images = [await localImageData(new File([await response.blob()], 'previous-artwork.png', { type: response.headers.get('content-type') || 'image/png' }))];
        }
        const baseReady = projectMedia.length || images.length;
        const fresh = state.assets.filter(asset => asset.file && !sentAssetIds.has(asset.id));
        if (baseReady && fresh.length) {
          images = images.concat(await Promise.all(fresh.map(asset => localImageData(asset.file))));
          includedAssets = fresh;
          replaceReferenceIds = true;
        } else if (baseReady) {
          const active = state.assets.filter(asset => asset.file && sentAssetIds.has(asset.id));
          if (active.length) images = images.concat(await Promise.all(active.map(asset => localImageData(asset.file))));
        }
      } else {
        const stored = stateMedia();
        projectMedia = stored;
        if (!projectMedia.length) {
          includedAssets = state.assets.filter(asset => asset.file);
          images = await Promise.all(includedAssets.map(asset => localImageData(asset.file)));
        } else includedAssets = state.assets.filter(asset => asset.path);
        replaceReferenceIds = true;
      }
      const response = await api('/api/visual/generate', json({ prompt, language: language(), images, projectMedia, requireImage: Boolean(previous || state.assets.length) }));
      const resultImages = (response.images || []).filter(Boolean);
      if (!resultImages.length) throw new Error(language() === 'en' ? 'The image model returned no image.' : '图像模型没有返回图片。');
      if (replaceReferenceIds) {
        sentAssetIds.clear();
        includedAssets.forEach(asset => sentAssetIds.add(asset.id));
      }
      state.status = 'editing';
      state.messages.push({ question: prompt, answer: response.answer || '', images: resultImages, generation: response.generation || null });
      input.value = '';
      renderResults();
      persistDraft();
      scheduleSave();
    } finally {
      state.generating = false;
      get('workspaceSubmit').disabled = false;
    }
  }
  async function completeProject() {
    if (!confirm(tr().completeConfirm)) return;
    await saveProject(true);
    if (!state.projectId) return;
    state.status = 'completed';
    await saveProject(true);
    statusLabel();
    setStatus(tr().completedMessage);
  }
  async function hydrateMedia(media, token) {
    const url = await signedUrl(media);
    if (token !== state.loadToken || !url) return '';
    return url;
  }
  async function loadProject() {
    const id = new URLSearchParams(location.search).get('project');
    if (!id) return false;
    const token = ++state.loadToken;
    const project = await api('/api/member/projects?id=' + encodeURIComponent(id));
    const workspace = (project.conversation || []).find(item => item?.type === 'workspace_state' && item.workspace === 'visual');
    const meta = (project.conversation || []).find(item => item?.type === 'project_meta');
    if (!workspace && meta?.workspace !== 'visual') return false;
    state.projectId = project.id;
    document.body.classList.add('visual-editing');
    state.title = project.title || '';
    if (project.locale === 'en' || project.locale === 'zh') {
      localStorage.setItem('ai-supermall-language', project.locale);
      document.documentElement.lang = project.locale === 'en' ? 'en' : 'zh-CN';
    }
    state.status = workspace?.status || 'editing';
    state.textLayers = cleanLayers(workspace?.textLayers);
    nameInput.value = state.title;
    input.value = workspace?.task || meta?.task || '';
    state.restoredFromChat = !workspace;
    state.assets = (workspace?.uploads || []).map(media => ({ id: id + '-' + media.path, fingerprint: 'stored:' + media.path, file: null, name: media.name || 'image', type: media.type || 'image/png', size: 0, path: media.path, provider: media.provider || 'supabase', previewUrl: '' }));
    state.messages = (project.conversation || []).filter(item => item?.type !== 'workspace_state' && item?.type !== 'project_meta').map(message => ({ ...message, images: (message.images || []).map(image => typeof image === 'string' ? image : { ...image, url: image.url || '' }) }));
    if (!state.messages.some(message => (message.images || []).length) && workspace?.finalImage?.path) {
      state.messages.push({ question: workspace.task || '', answer: '', images: [{ ...workspace.finalImage, url: '' }] });
    }
    renderAssets();
    renderResults();
    statusLabel();
    projectChoices();
    // Render the saved project immediately, then replace each private-media placeholder
    // only after its own signed URL is ready. This avoids an all-or-nothing media race.
    await Promise.all(state.assets.map(async asset => {
      asset.previewUrl = await hydrateMedia(asset, token);
      if (token === state.loadToken) renderAssets();
    }));
    await Promise.all(state.messages.flatMap(message => (message.images || []).map(async image => {
      if (typeof image === 'string' || !image?.path) return;
      image.url = await hydrateMedia(image, token);
      if (token === state.loadToken) renderResults();
    })));
    if (workspace?.finalImage?.path && !state.messages.some(message => (message.images || []).some(image => image?.path === workspace.finalImage.path))) {
      const latest = state.messages.at(-1)?.images?.at(-1);
      if (latest) latest.url = await hydrateMedia(workspace.finalImage, token);
    }
    return true;
  }

  document.addEventListener('change', event => {
    if (event.target !== fileInput) return;
    event.stopImmediatePropagation();
    addFiles(event.target.files);
  }, true);
  ['dragenter', 'dragover'].forEach(type => get('dropZone').addEventListener(type, event => { event.preventDefault(); get('dropZone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => get('dropZone').addEventListener(type, event => { event.preventDefault(); get('dropZone').classList.remove('dragging'); }));
  get('dropZone').addEventListener('drop', event => addFiles(event.dataTransfer?.files));
  form.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); generate().catch(error => setStatus(error.message)); }, true);
  get('saveProject').addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); saveProject(true).catch(error => setStatus(error.message)); }, true);
  input.addEventListener('input', event => { event.stopImmediatePropagation(); persistDraft(); scheduleSave(); }, true);
  nameInput.addEventListener('input', () => { persistDraft(); scheduleSave(); }, true);
  get('languageToggle').addEventListener('click', () => {
    const next = language() === 'en' ? 'zh' : 'en';
    localStorage.setItem('ai-supermall-language', next);
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    applyVisualCopy(); renderAssets(); renderResults(); statusLabel();
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href*="account.html"]');
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    (async () => {
      await persistDraft();
      if (await signedIn()) { await saveProject(false).catch(() => {}); location.href = link.href; }
      else await redirectToLogin();
    })().catch(error => setStatus(error.message));
  }, true);
  window.addEventListener('pagehide', () => { persistDraft(); });
  new MutationObserver(() => {
    const labels = [get('projectNameLabel'), get('taskInputLabel')];
    if (labels[0]) labels[0].textContent = tr().projectName;
    if (labels[1]) labels[1].textContent = tr().task;
    get('saveProject').textContent = tr().save;
    statusLabel();
  }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['lang'] });

  (async () => {
    get('projectNameLabel').textContent = tr().projectName;
    get('taskInputLabel').textContent = tr().task;
    get('saveProject').textContent = tr().save;
    try {
      const loaded = await loadProject();
      if (!loaded && !restoreHandoff()) await restoreDraft();
    } catch (error) { setStatus(error.message); }
    applyVisualCopy();
    renderAssets();
    renderResults();
    statusLabel();
  })();
})();
