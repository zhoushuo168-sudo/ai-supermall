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
  const state = { assets: [], messages: [], projectId: '', title: '', status: 'editing', saving: null, generating: false, timer: 0 };
  const tr = () => document.documentElement.lang === 'en' ? {
    unnamed: 'Untitled project', projectName: 'Project name', task: 'Your task', save: 'Save to Project',
    saved: 'Saved to your project.', saving: 'Saving your project…', generating: 'AI is generating your image…',
    restored: 'Your unfinished work was restored. You can keep editing it.', upload: 'Upload image',
    selected: count => `Selected images (${count}/10)`, add: 'Add more images', clear: 'Clear all',
    refine: 'Continue editing', complete: 'Complete', completed: 'Completed', editing: 'Editing',
    completeConfirm: 'Save the latest artwork as the completed version of this project?', completedMessage: 'This project is marked completed. You can still reopen it and continue editing later.',
    download: 'Download image', login: 'Sign in to save this work', required: 'Describe what you would like to create.',
    imageError: 'The image could not load.', tooLarge: 'Please choose an image under 20 MB.', unsupported: 'Choose a JPG, PNG, or WEBP image.',
    titleSaved: 'Project name updated.', retry: 'Try again'
  } : {
    unnamed: '未命名项目', projectName: '项目名称', task: '你的任务', save: '保存到项目',
    saved: '已保存到项目。', saving: '正在保存项目…', generating: 'AI 正在生成图片…',
    restored: '已恢复登录前未完成的创作，你可以继续编辑。', upload: '上传图片',
    selected: count => `已选图片（${count}/10）`, add: '添加更多图片', clear: '全部清除',
    refine: '继续修改', complete: '完成', completed: '已完成', editing: '编辑中',
    completeConfirm: '将最新作品保存为此项目的完成版本吗？', completedMessage: '项目已标记为完成。以后仍可重新打开并继续编辑。',
    download: '下载图片', login: '登录后即可保存这份作品', required: '请描述你想创作或修改的内容。',
    imageError: '图片无法加载。', tooLarge: '请选择小于 20 MB 的图片。', unsupported: '请选择 JPG、PNG 或 WEBP 图片。',
    titleSaved: '项目名称已更新。', retry: '重新尝试'
  };
  const language = () => document.documentElement.lang === 'en' ? 'en' : 'zh';
  const api = async (path, options = {}) => {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  };
  const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const patch = body => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const setStatus = message => { get('workspaceStatus').textContent = message || ''; get('workspaceGenerationStatus').textContent = message || ''; };
  const isImage = file => /^(image\/jpeg|image\/png|image\/webp)$/.test(String(file?.type || '').toLowerCase());
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `asset-${Date.now()}-${Math.random()}`;
  const assetKey = file => [file.name, file.size, file.lastModified].join(':');
  const projectUrl = () => state.projectId ? `create-visual.html?project=${encodeURIComponent(state.projectId)}` : 'create-visual.html?restoreDraft=1';
  const safeMedia = item => item && item.path ? { provider: item.provider || 'supabase', path: item.path, name: item.name || 'image', type: item.type || 'image/png', kind: item.kind || 'reference' } : null;

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
    await storage.save({ version: 1, language: language(), title: nameInput.value, task: input.value, assets, messages: state.messages, projectId: state.projectId, status: state.status, savedAt: Date.now() });
    localStorage.setItem(draftFlag, '1');
  }
  async function clearDraft() {
    localStorage.removeItem(draftFlag);
    await window.AISuperMallVisualDraft?.clear().catch(() => {});
  }
  async function restoreDraft() {
    if (new URLSearchParams(location.search).get('project') || !localStorage.getItem(draftFlag)) return false;
    const draft = await window.AISuperMallVisualDraft?.load().catch(() => null);
    if (!draft) return false;
    state.assets.forEach(release);
    state.assets = (draft.assets || []).map(asset => ({ ...asset, file: asset.file || null, previewUrl: asset.file ? URL.createObjectURL(asset.file) : asset.url || '' }));
    state.messages = Array.isArray(draft.messages) ? draft.messages : [];
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
    const title = nameInput.value.trim() || tr().unnamed;
    nameInput.value = title;
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
    for (const asset of state.assets) {
      if (!asset.file || asset.path) continue;
      const authorization = await api('/api/member/oss-media', json({ projectId: state.projectId, name: asset.name, type: asset.type, size: asset.size, kind: 'reference' }));
      const upload = await fetch(authorization.uploadUrl, { method: 'PUT', headers: authorization.headers || {}, body: asset.file });
      if (!upload.ok) throw new Error('Private image upload failed.');
      Object.assign(asset, authorization.media, { previewUrl: asset.previewUrl });
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
      finalImage: safeMedia(latest)
    }, ...state.messages];
  }
  async function saveProject(manual = false) {
    if (state.saving) return state.saving;
    const hasContent = Boolean(input.value.trim() || nameInput.value.trim() || state.assets.length || state.messages.length);
    if (!hasContent) return;
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
      await api('/api/member/projects', patch({ id: state.projectId, title: nameInput.value.trim() || tr().unnamed, locale: language(), conversation: projectConversation() }));
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
        preview.addEventListener('click', () => showPreview(url, preview.alt));
        card.append(preview);
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
      }
      history.append(card);
    });
    results.hidden = !state.messages.length;
  }
  function showPreview(url, alt) {
    let modal = get('generatedImageModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generatedImageModal';
      modal.className = 'generated-image-modal';
      modal.innerHTML = '<div class="generated-image-modal-backdrop"></div><section class="generated-image-modal-panel" role="dialog" aria-modal="true"><button type="button" class="generated-image-modal-close">×</button><img></section>';
      modal.querySelector('.generated-image-modal-backdrop').onclick = () => { modal.hidden = true; };
      modal.querySelector('button').onclick = () => { modal.hidden = true; };
      document.body.append(modal);
    }
    modal.querySelector('img').src = url;
    modal.querySelector('img').alt = alt;
    modal.hidden = false;
  }
  async function downloadImage(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(tr().imageError);
    const blob = await response.blob();
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
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
  async function generate() {
    const prompt = input.value.trim();
    if (!prompt) { setStatus(tr().required); input.focus(); return; }
    if (state.generating) return;
    state.generating = true;
    get('workspaceSubmit').disabled = true;
    setStatus(tr().generating);
    try {
      const previous = latestImage();
      let images = [], projectMedia = [];
      if (previous) {
        if (typeof previous !== 'string' && previous.path) projectMedia = [safeMedia(previous)];
        else if (typeof previous === 'string') {
          const response = await fetch(previous);
          if (!response.ok) throw new Error(tr().imageError);
          images = [await localImageData(new File([await response.blob()], 'previous-artwork.png', { type: response.headers.get('content-type') || 'image/png' }))];
        }
      } else {
        const stored = stateMedia();
        projectMedia = stored;
        if (!projectMedia.length) images = await Promise.all(state.assets.filter(asset => asset.file).map(asset => localImageData(asset.file)));
      }
      const response = await api('/api/visual/generate', json({ prompt, language: language(), images, projectMedia, requireImage: Boolean(previous || state.assets.length) }));
      const resultImages = (response.images || []).filter(Boolean);
      if (!resultImages.length) throw new Error(language() === 'en' ? 'The image model returned no image.' : '图像模型没有返回图片。');
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
  async function loadProject() {
    const id = new URLSearchParams(location.search).get('project');
    if (!id) return false;
    const project = await api('/api/member/projects?id=' + encodeURIComponent(id));
    const workspace = (project.conversation || []).find(item => item?.type === 'workspace_state' && item.workspace === 'visual');
    if (!workspace) return false;
    state.projectId = project.id;
    document.body.classList.add('visual-editing');
    state.title = project.title || '';
    state.status = workspace.status || 'editing';
    nameInput.value = state.title;
    input.value = workspace.task || '';
    state.assets = await Promise.all((workspace.uploads || []).map(async media => ({ id: id + '-' + media.path, fingerprint: 'stored:' + media.path, file: null, name: media.name || 'image', type: media.type || 'image/png', size: 0, path: media.path, provider: media.provider || 'supabase', previewUrl: await signedUrl(media) })));
    state.messages = await Promise.all((project.conversation || []).filter(item => item?.type !== 'workspace_state').map(async message => ({ ...message, images: await Promise.all((message.images || []).map(async image => typeof image === 'string' ? image : { ...image, url: await signedUrl(image) })) })));
    renderAssets();
    renderResults();
    statusLabel();
    return true;
  }

  document.addEventListener('change', event => {
    if (event.target !== fileInput) return;
    event.stopImmediatePropagation();
    addFiles(event.target.files);
  }, true);
  form.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); generate().catch(error => setStatus(error.message)); }, true);
  get('saveProject').addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); saveProject(true).catch(error => setStatus(error.message)); }, true);
  input.addEventListener('input', event => { event.stopImmediatePropagation(); persistDraft(); scheduleSave(); }, true);
  nameInput.addEventListener('input', () => { persistDraft(); scheduleSave(); }, true);
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
      if (!loaded) await restoreDraft();
    } catch (error) { setStatus(error.message); }
    renderAssets();
    renderResults();
    statusLabel();
  })();
})();
