/* Video & shorts. One workspace, standard wan3.0-video, existing projects and OSS. */
(() => {
  if (typeof document === 'undefined' || document.body?.dataset?.workspace !== 'video') return;
  const workspace = document.querySelector('.workspace-main');
  if (workspace) { workspace.hidden = true; workspace.inert = true; }
  const get = id => document.getElementById(id);
  const form = get('workspaceForm');
  const input = get('taskInput');
  const nameInput = get('projectName');
  const player = get('videoPlayer');
  const draftKey = 'ai-supermall-video-draft';
  const query = new URLSearchParams(location.search);
  const state = { messages: [], images: [], projectId: '', title: '', generating: false, polling: false, saveAfterLogin: false, credits: null, creditsUnavailable: false, referenceBlocked: false };
  const tr = () => document.documentElement.lang === 'en' ? {
    title: 'Video & shorts',
    description: 'Turn a sentence, or a photo plus a sentence, into a short video',
    panel: 'Describe the video',
    panelCopy: 'Default length is 5 seconds at 720P. Add photos only if you want them in the video.',
    upload: 'Photos or videos (optional)',
    formats: 'JPG, PNG, WEBP up to 4 photos, 8 MB each. MP4, MOV, or WEBM up to 2 videos, 80 MB each.',
    drop: 'Drop photos or videos here, or choose files',
    choose: 'Choose file',
    projectName: 'Project name',
    task: 'Your request',
    placeholder: 'For example: make a 5-second autumn promo of Vancouver.',
    titlePlaceholder: 'Enter a project name',
    generate: 'Generate video',
    revise: 'Continue creating',
    regenerate: 'Regenerate',
    download: 'Download video',
    save: 'Save as project',
    saving: 'Saving your project…',
    saved: 'Saved to your project.',
    savedAs: 'Saved as “{name}”. A project with that name already existed, so this one was not overwritten.',
    submitting: 'Submitting…',
    generating: 'Generating the video…',
    savingVideo: 'Saving the video…',
    done: 'Video ready',
    required: 'Describe the video you want.',
    login: 'Please sign in before generating a video.',
    titleRequired: 'Enter a project name before saving.',
    result: 'Preview',
    resultCopy: 'Play it here, then download or save the project.',
    note: '',
    unnamed: 'Untitled video',
    home: 'Home',
    projects: 'My Projects',
    voice: 'Voice input',
    voiceLanguage: 'Recognition language',
    browserLanguage: 'Browser language',
    listening: 'Listening…',
    tooBig: 'Use a JPG, PNG, or WEBP under 8 MB, or an MP4, MOV, or WEBM under 80 MB.',
    timeout: 'Video generation timed out. Wait, then try once more. It was not submitted again automatically.',
    creditsLoading: 'Checking credits…',
    creditsUnavailable: 'Credits could not be confirmed. Video generation is paused.',
    creditBalance: 'Current balance: {n} credits',
    creditEstimate: 'This video: {n} credits',
    creditAfter: 'Balance after generation: {n} credits',
    creditShort: 'Not enough credits. Video generation is turned off.',
    referenceFormat: 'Use an MP4 or MOV reference video. Generation was not started.'
  } : {
    title: '视频与短片',
    description: '用一句话，或一张图片加一句话，生成短视频',
    panel: '描述你想制作的视频',
    panelCopy: '默认 5 秒、720P。只有希望画面用到照片时再上传。',
    upload: '上传图片或视频（可选）',
    formats: '图片支持 JPG、PNG、WEBP，最多 4 张，每张 8 MB。视频支持 MP4、MOV、WEBM，最多 2 个，每个 80 MB。',
    drop: '把图片或视频拖到这里，或选择文件',
    choose: '选择文件',
    projectName: '项目名称',
    task: '你的需求',
    placeholder: '例如：生成一个温哥华秋天的5秒宣传短片。',
    titlePlaceholder: '请输入项目名称',
    generate: '生成视频',
    revise: '继续制作',
    regenerate: '重新生成',
    download: '下载视频',
    save: '保存为项目',
    saving: '正在保存项目…',
    saved: '已保存到项目。',
    savedAs: '已保存为「{name}」。同名项目已存在，所以没有覆盖旧项目。',
    submitting: '正在提交…',
    generating: '正在生成视频…',
    savingVideo: '正在保存视频…',
    done: '生成完成',
    required: '请先描述你想制作的视频。',
    login: '请先登录后再生成视频。',
    titleRequired: '请先填写项目名称，再保存项目。',
    result: '预览',
    resultCopy: '可以在这里播放，然后下载或保存项目。',
    note: '',
    unnamed: '未命名视频',
    home: '首页',
    projects: '我的项目',
    voice: '语音输入',
    voiceLanguage: '识别语言',
    browserLanguage: '浏览器语言',
    listening: '正在聆听…',
    tooBig: '图片请使用 8MB 以内的 JPG、PNG 或 WEBP。视频请使用 80MB 以内的 MP4、MOV 或 WEBM。',
    timeout: '视频生成超时。请稍后再试一次，系统没有自动重新提交。',
    creditsLoading: '正在确认 Credits…',
    creditsUnavailable: '暂时无法确认 Credits，已暂停生成。',
    creditBalance: '当前余额：{n} Credits',
    creditEstimate: '本次预计消耗：{n} Credits',
    creditAfter: '生成后预计余额：{n} Credits',
    creditShort: 'Credits 不足，无法生成视频。',
    referenceFormat: '参考视频请使用 MP4 或 MOV。没有开始生成。'
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
  const setStatus = message => { const node = get('workspaceGenerationStatus'); node.textContent = message || ''; if (message && window.matchMedia('(max-width: 760px)').matches) node.scrollIntoView({ block: 'center', inline: 'nearest' }); };
  const typedTitle = () => nameInput.value.trim().slice(0, 120);
  const current = () => state.messages.at(-1) || null;
  const defaultTitle = () => String(state.messages[0]?.question || input.value || '').replace(/\s+/g, ' ').trim().slice(0, 40) || tr().unnamed;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function applyCopy() {
    const text = tr();
    const ready = Boolean(current()?.videoUrl);
    document.title = `AI SuperMall — ${text.title}`;
    get('workspaceTitle').textContent = text.title;
    get('workspaceDescription').textContent = text.description;
    get('videoPanelTitle').textContent = text.panel;
    get('videoPanelCopy').textContent = text.panelCopy;
    get('uploadLabel').textContent = text.upload;
    get('formatText').textContent = text.formats;
    get('dropText').textContent = text.drop;
    get('uploadButton').textContent = text.choose;
    get('projectNameLabel').textContent = text.projectName;
    get('taskInputLabel').textContent = text.task;
    nameInput.placeholder = text.titlePlaceholder;
    input.placeholder = text.placeholder;
    get('workspaceSubmit').textContent = ready ? text.revise : text.generate;
    get('videoRegenerate').textContent = text.regenerate;
    get('videoDownload').textContent = text.download;
    get('saveProject').textContent = text.save;
    get('videoResultTitle').textContent = text.result;
    get('videoResultCopy').textContent = text.resultCopy;
    get('homeLink').textContent = text.home;
    get('projectsLink').textContent = text.projects;
    get('languageToggle').textContent = language() === 'en' ? '中文' : 'EN';
    get('workspaceNote').textContent = text.note; get('workspaceNote').hidden = !text.note;
    renderCredits();
    const creditsBlocked = state.referenceBlocked || state.creditsUnavailable || !state.credits || state.credits.sufficient === false;
    get('videoVoice').setAttribute('aria-label', text.voice);
    get('videoVoice').title = text.voice;
    get('videoVoiceLanguage').setAttribute('aria-label', text.voiceLanguage);
    get('videoVoiceLanguage').querySelector('option[value="browser"]').textContent = text.browserLanguage;
    get('workspaceSubmit').disabled = state.generating || creditsBlocked;
    get('videoRegenerate').disabled = !state.messages.length || state.generating || creditsBlocked;
    get('videoDownload').disabled = !ready || state.generating;
    get('saveProject').disabled = state.generating;
  }
  function renderCredits() {
    const node = get('videoCredits');
    const text = tr();
    if (!node) return;
    const quote = state.credits;
    node.classList.toggle('is-short', Boolean(state.referenceBlocked || state.creditsUnavailable || (quote && quote.sufficient === false)));
    if (state.referenceBlocked) { node.textContent = text.referenceFormat; return; }
    if (!quote) {
      node.textContent = state.creditsUnavailable ? text.creditsUnavailable : text.creditsLoading;
      return;
    }
    const held = state.generating || state.polling;
    const after = held ? quote.balance : (quote.sufficient ? quote.projected : quote.balance);
    const lines = [
      text.creditBalance.replace('{n}', quote.balance),
      text.creditEstimate.replace('{n}', quote.estimated),
      text.creditAfter.replace('{n}', after)
    ];
    if (!held && quote.sufficient === false) lines.push(text.creditShort);
    node.replaceChildren(...lines.map(line => {
      const row = document.createElement('div');
      row.textContent = line;
      return row;
    }));
  }
  function newIdempotencyKey() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const creditKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function creditKey() {
    const saved = sessionStorage.getItem('ai-supermall-video-credit-key') || '';
    if (creditKeyPattern.test(saved)) return saved;
    const key = newIdempotencyKey();
    sessionStorage.setItem('ai-supermall-video-credit-key', key);
    return key;
  }
  function clearCreditKey() { sessionStorage.removeItem('ai-supermall-video-credit-key'); }
  function referenceVideos() {
    return state.images.filter(item => item.type === 'video/mp4' || item.type === 'video/quicktime');
  }
  async function ensureProject() {
    if (state.projectId) return;
    const title = typedTitle() || state.title || defaultTitle();
    const created = await api('/api/member/projects', json({ title, locale: language(), conversation: projectConversation() }));
    const project = Array.isArray(created) ? created[0] : created;
    if (!project?.id) throw new Error(language() === 'en' ? 'The file could not be saved.' : '文件没有保存成功。');
    state.projectId = project.id;
    state.title = project.title || title;
    history.replaceState(null, '', `create-video.html?project=${encodeURIComponent(state.projectId)}`);
  }
  async function loadCredits() {
    state.referenceBlocked = state.images.some(item => item.type === 'video/webm');
    if (state.referenceBlocked) {
      state.credits = null;
      state.creditsUnavailable = false;
      renderCredits();
      applyCopy();
      return;
    }
    const videos = referenceVideos();
    try {
      if (videos.some(item => !item.path)) {
        await ensureProject();
        await uploadDraftImages();
      }
      const params = new URLSearchParams({ language: language() });
      videos.forEach(video => { if (video.path) params.append('videoPath', video.path); });
      state.credits = await api(`/api/member/credits?${params}`);
      state.creditsUnavailable = false;
    } catch (error) {
      state.credits = null;
      state.creditsUnavailable = true;
      if (videos.length) setStatus(error.message);
    }
    renderCredits();
    applyCopy();
  }
  function renderUploads() {
    const list = get('videoUploads');
    list.replaceChildren();
    state.images.forEach(image => {
      const figure = document.createElement('figure');
      const video = /^video\//.test(image.type || '');
      const media = document.createElement(video ? 'video' : 'img');
      const remove = document.createElement('button');
      if (video) { media.controls = true; media.muted = true; media.playsInline = true; media.preload = 'metadata'; figure.className = 'is-video'; }
      media.src = image.preview || image.data || '';
      if (!video) {
        media.alt = language() === 'en' ? 'Uploaded photo' : '上传的图片';
        media.addEventListener('click', () => showUploadPreview(media.src, media.alt));
      }
      remove.type = 'button';
      remove.textContent = '×';
      remove.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); removeUpload(image).catch(error => setStatus(error.message)); });
      figure.append(media, remove);
      list.append(figure);
    });
  }
  function showUploadPreview(url, alt) {
    if (!url) return;
    let modal = get('generatedImageModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'generatedImageModal';
      modal.className = 'generated-image-modal';
      modal.innerHTML = '<div class="generated-image-modal-backdrop"></div><section class="generated-image-modal-panel" role="dialog" aria-modal="true"><button type="button" class="generated-image-modal-close" aria-label="Close">×</button><img></section>';
      const close = () => { modal.hidden = true; };
      modal.querySelector('.generated-image-modal-backdrop').onclick = close;
      modal.querySelector('button').onclick = close;
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
      document.body.append(modal);
    }
    const image = modal.querySelector('img');
    image.src = url;
    image.alt = alt || '';
    modal.hidden = false;
  }
  async function removeUpload(image) {
    if (String(image.preview || '').startsWith('blob:')) URL.revokeObjectURL(image.preview);
    state.images = state.images.filter(item => item !== image);
    renderUploads();
    const latest = current();
    if (latest && !latest.video?.taskId && !latest.video?.path) latest.images = storedImages();
    else if (latest) latest.images = storedImages();
    if (state.projectId) await api('/api/member/projects', patch({ id: state.projectId, locale: language(), conversation: projectConversation() }));
    await loadCredits();
  }
  function render() {
    const latest = current();
    const show = Boolean(latest?.videoUrl);
    get('workspaceResults').hidden = !show;
    if (show && player.src !== latest.videoUrl) player.src = latest.videoUrl;
    if (!show) player.removeAttribute('src');
    applyCopy();
  }
  function persistDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({
        language: language(), title: nameInput.value, savedTitle: state.title, task: input.value,
        messages: state.messages.map(item => ({ question: item.question, answer: item.answer, taskId: item.taskId || '', video: item.video || null })),
        projectId: state.projectId, saveAfterLogin: state.saveAfterLogin
      }));
    } catch {}
  }
  function restoreDraft() {
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(draftKey) || ''); } catch { return false; }
    if (!draft || typeof draft !== 'object') return false;
    state.messages = Array.isArray(draft.messages) ? draft.messages : [];
    state.projectId = String(draft.projectId || '');
    state.title = String(draft.savedTitle || '');
    state.saveAfterLogin = Boolean(draft.saveAfterLogin);
    nameInput.value = String(draft.title || '');
    input.value = String(draft.task || '');
    if (draft.language === 'en' || draft.language === 'zh') document.documentElement.lang = draft.language === 'en' ? 'en' : 'zh-CN';
    history.replaceState(null, '', state.projectId ? `create-video.html?project=${encodeURIComponent(state.projectId)}` : 'create-video.html');
    return true;
  }
  function imageStore(mode, value) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ai-supermall-video-drafts', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('drafts');
      request.onerror = () => reject(request.error || new Error('draft'));
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('drafts', mode === 'read' ? 'readonly' : 'readwrite');
        const action = mode === 'read' ? transaction.objectStore('drafts').get('current') : transaction.objectStore('drafts').put(value, 'current');
        action.onsuccess = () => resolve(action.result);
        action.onerror = () => reject(action.error || new Error('draft'));
        transaction.oncomplete = () => db.close();
      };
    });
  }
  async function saveImages() {
    try { await imageStore('write', { images: state.images.slice(0, 4).map(image => ({ type: image.type, data: image.data, name: image.name || '' })) }); } catch {}
  }
  async function restoreImages() {
    try {
      const saved = await imageStore('read');
      state.images = (Array.isArray(saved?.images) ? saved.images : []).filter(image => /^data:image\/(jpeg|png|webp);base64,/i.test(String(image?.data || ''))).slice(0, 4);
    } catch {}
  }
  async function signedIn() { return (await fetch('/api/account/me')).ok; }
  async function redirectToLogin() {
    state.saveAfterLogin = false;
    persistDraft();
    await saveImages();
    location.href = `account.html?mode=login&returnTo=${encodeURIComponent('create-video.html?restoreDraft=1')}`;
  }
  function storedImages() {
    return state.images.filter(image => image?.provider === 'oss' && image.path).map(image => ({
      provider: 'oss', path: image.path, name: image.name || 'image', type: image.type || 'image/jpeg', kind: 'reference'
    }));
  }
  function projectConversation() {
    const task = input.value.trim() || current()?.question || state.messages[0]?.question || '';
    return [{ type: 'project_meta', workspace: 'video', intent: 'video', task: task.slice(0, 2000) }, ...state.messages.map(item => {
      const message = { question: item.question || '', answer: item.answer || '', workspace: 'video', video: item.video || null };
      const images = Array.isArray(item.images) ? item.images.filter(image => image?.provider === 'oss' && image.path) : [];
      if (images.length) message.images = images;
      return message;
    })];
  }
  async function uniqueProjectTitle(requested) {
    const name = String(requested || '').trim().slice(0, 120);
    try {
      const list = await api('/api/member/projects');
      const used = new Set((Array.isArray(list) ? list : []).map(item => String(item?.title || '').trim()));
      if (!used.has(name)) return name;
      const base = name.replace(/（\d+）$/, '');
      let number = 2;
      while (used.has(`${base}（${number}）`)) number += 1;
      return `${base}（${number}）`.slice(0, 120);
    } catch { return name; }
  }
  function ensureDraftMessage() {
    const question = input.value.trim();
    const images = storedImages();
    const latest = current();
    if (!latest) {
      state.messages.push({ question, answer: '', taskId: '', video: null, videoUrl: '', images });
      return;
    }
    if (!latest.video?.taskId && !latest.video?.path) latest.question = question || latest.question;
    latest.images = images;
  }
  async function uploadDraftImages() {
    for (const image of state.images) {
      if (image.path) continue;
      let file = image.file instanceof File ? image.file : null;
      if (!file && image.data) {
        const response = await fetch(image.data);
        const blob = await response.blob();
        file = new File([blob], image.name || 'upload', { type: image.type || blob.type || 'application/octet-stream' });
      }
      if (!file) continue;
      const formData = new FormData();
      formData.append('projectId', state.projectId);
      formData.append('kind', 'reference');
      formData.append('file', file, file.name);
      const saved = await api('/api/member/oss-media', { method: 'POST', body: formData });
      if (!saved.media?.path) throw new Error(language() === 'en' ? 'The file could not be saved.' : '文件没有保存成功。');
      Object.assign(image, saved.media, { preview: image.preview || image.data, file: null });
    }
  }
  async function persistVideoFile() {
    const latest = current();
    if (!latest?.videoUrl || latest.video?.path || !state.projectId) return;
    const saved = await api('/api/member/video-media', json({ projectId: state.projectId, url: latest.videoUrl, taskId: latest.taskId || '' }));
    latest.video = saved.video;
    const signed = await api(`/api/member/video-media?path=${encodeURIComponent(saved.video.path)}`);
    latest.videoUrl = signed.url || latest.videoUrl;
  }
  async function saveProject(manual = false, quiet = false) {
    const typed = typedTitle();
    if (manual && !typed) { state.saveAfterLogin = false; setStatus(tr().titleRequired); nameInput.focus(); return; }
    if (!typed && !input.value.trim() && !state.messages.length && !state.images.length) { if (manual) setStatus(tr().required); return; }
    if (!(await signedIn())) {
      if (manual) state.saveAfterLogin = true;
      persistDraft();
      await saveImages();
      if (manual) location.href = `account.html?mode=login&returnTo=${encodeURIComponent('create-video.html?restoreDraft=1')}`;
      else setStatus(tr().login);
      return;
    }
    if (!quiet) setStatus(tr().saving);
    let renamed = false;
    if (!state.projectId) {
      const title = manual ? await uniqueProjectTitle(typed) : (typed || state.title || defaultTitle());
      renamed = Boolean(manual && title !== typed);
      if (renamed) nameInput.value = title;
      const created = await api('/api/member/projects', json({ title, locale: language(), conversation: projectConversation() }));
      const project = Array.isArray(created) ? created[0] : created;
      if (!project?.id) throw new Error('Project could not be created.');
      state.projectId = project.id;
      state.title = project.title || title;
    }
    if (manual) {
      await uploadDraftImages();
      ensureDraftMessage();
    } else await persistVideoFile();
    const body = { id: state.projectId, locale: language(), conversation: projectConversation() };
    const finalTitle = typedTitle();
    if (manual) body.title = finalTitle;
    else if (typed) body.title = typed;
    const updated = await api('/api/member/projects', patch(body));
    state.title = manual ? finalTitle : (typed || updated.title || state.title);
    state.saveAfterLogin = false;
    persistDraft();
    history.replaceState(null, '', `create-video.html?project=${encodeURIComponent(state.projectId)}`);
    render();
    if (!quiet) setStatus(renamed ? tr().savedAs.replace('{name}', finalTitle) : tr().saved);
  }
  async function signVideo(item) {
    if (!item?.video?.path) return;
    const signed = await api(`/api/member/video-media?path=${encodeURIComponent(item.video.path)}`);
    if (signed.url) item.videoUrl = signed.url;
  }
  async function applyProject(project) {
    const meta = (project.conversation || []).find(item => item?.type === 'project_meta');
    if (meta?.workspace && meta.workspace !== 'video') return false;
    state.projectId = project.id;
    state.title = project.title || '';
    nameInput.value = state.title;
    state.messages = (project.conversation || []).filter(item => item?.type !== 'project_meta' && item?.type !== 'workspace_state').map(item => ({
      question: item.question || '', answer: item.answer || '', taskId: item.video?.taskId || '', video: item.video || null, videoUrl: '',
      images: Array.isArray(item.images) ? item.images : []
    })).filter(item => item.video?.path || item.video?.taskId || item.question || item.images.length);
    await Promise.all(state.messages.map(signVideo));
    input.value = meta?.task || state.messages.at(-1)?.question || '';
    const imageSource = [...state.messages].reverse().find(item => item.images?.length);
    state.images = (imageSource?.images || []).map(image => ({ ...image }));
    await Promise.all(state.images.map(async image => {
      if (image.provider !== 'oss' || !image.path) return;
      try {
        const signed = await api(`/api/member/oss-media?provider=oss&path=${encodeURIComponent(image.path)}`);
        if (!signed.url) return;
        image.preview = signed.url;
        if (/^video\//.test(image.type || '')) return;
        const blob = await (await fetch(signed.url)).blob();
        image.data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(blob); });
        image.type = image.type || blob.type;
      } catch {}
    }));
    renderUploads();
    history.replaceState(null, '', `create-video.html?project=${encodeURIComponent(state.projectId)}`);
    return true;
  }
  async function loadProject() {
    const projectId = query.get('project');
    if (!projectId) return false;
    return applyProject(await api(`/api/member/projects?id=${encodeURIComponent(projectId)}`));
  }
  async function downloadVideo() {
    const latest = current();
    if (!latest?.videoUrl) return;
    const name = (typedTitle() || state.title || 'video').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'video';
    try {
      const response = await fetch(latest.videoUrl);
      if (!response.ok) throw new Error('download');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(await response.blob());
      link.download = `${name}.mp4`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch { window.open(latest.videoUrl, '_blank', 'noopener'); }
  }
  async function pollTask(taskId, message) {
    const started = Date.now();
    state.polling = true;
    try {
      while (state.generating && message.taskId === taskId) {
        if (Date.now() - started > 20 * 60 * 1000) throw new Error(tr().timeout);
        await sleep(state.messages.at(-1) === message && Date.now() - started < 6000 ? 5000 : 15000);
        if (!state.generating || message.taskId !== taskId) return;
        const result = await api(`/api/video/task?id=${encodeURIComponent(taskId)}&language=${language()}`);
        if (result.status === 'SUCCEEDED' && result.videoUrl) {
          message.videoUrl = result.videoUrl;
          message.video = { ...(message.video || {}), taskId };
          message.answer = language() === 'en' ? 'Video ready.' : '视频已生成。';
          render();
          persistDraft();
          setStatus(tr().savingVideo);
          if (!state.projectId) await saveProject(false, true);
          if (state.projectId) {
            await persistVideoFile();
            await saveProject(false, true);
          }
          setStatus(tr().done);
          return;
        }
        if (result.status === 'FAILED' || result.status === 'UNKNOWN') throw new Error(result.error || tr().timeout);
      }
    } finally { state.polling = false; }
  }
  async function generate(regenerate = false) {
    if (state.generating) return;
    const instruction = (regenerate ? current()?.question : input.value).trim();
    if (!instruction) { setStatus(tr().required); input.focus(); return; }
    if (state.images.some(item => item.type === 'video/webm')) { setStatus(tr().referenceFormat); return; }
    const selectedVideos = referenceVideos();
    if (selectedVideos.length && selectedVideos.some(item => !item.path)) {
      await ensureProject();
      await uploadDraftImages();
    }
    await loadCredits();
    if (state.referenceBlocked || state.creditsUnavailable || !state.credits || state.credits.sufficient === false) {
      setStatus(state.referenceBlocked ? tr().referenceFormat : (state.credits && state.credits.sufficient === false ? tr().creditShort : tr().creditsUnavailable));
      return;
    }
    state.generating = true;
    applyCopy();
    setStatus(tr().submitting);
    let message = current();
    let accepted = false;
    try {
      if (!(await signedIn())) { await redirectToLogin(); return; }
      const requestKey = creditKey();
      const created = await fetch('/api/video/generate', json({
        prompt: instruction,
        images: state.images.filter(image => /^image\/(jpeg|png|webp)$/.test(image.type || '') && /^data:image\/(jpeg|png|webp);base64,/i.test(image.data || '')).map(image => ({ type: image.type, data: image.data })),
        language: language(),
        projectId: state.projectId || '',
        title: typedTitle() || state.title || '',
        replace: Boolean(regenerate),
        idempotencyKey: requestKey,
        referenceVideos: referenceVideos().filter(video => video.path).map(video => ({ path: video.path }))
      }));
      const response = await created.json().catch(() => ({}));
      if (!created.ok) {
        if (response.code === 'retry') clearCreditKey();
        throw new Error(response.error || tr().timeout);
      }
      if (!response.taskId) throw new Error(tr().timeout);
      clearCreditKey();
      accepted = true;
      if (response.projectId) {
        state.projectId = response.projectId;
        history.replaceState(null, '', `create-video.html?project=${encodeURIComponent(state.projectId)}`);
      }
      const video = { taskId: response.taskId };
      const existing = state.messages.find(item => item.taskId === response.taskId);
      if (existing) message = existing;
      else if (regenerate && message) Object.assign(message, { question: instruction, taskId: response.taskId, videoUrl: '', video, answer: '' });
      else {
        message = { question: instruction, answer: '', taskId: response.taskId, videoUrl: '', video };
        state.messages.push(message);
      }
      if (!state.title && !typedTitle()) state.title = defaultTitle();
      persistDraft();
      try { await saveProject(false, true); } catch (error) { setStatus(error.message); }
      setStatus(tr().generating);
      await pollTask(response.taskId, message);
    } catch (error) {
      if (!accepted && /sign in|请先登录/i.test(String(error.message || ''))) { await redirectToLogin(); return; }
      setStatus(error.message);
    }
    finally { state.generating = false; await loadCredits(); }
  }
  function setupVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = get('videoVoice');
    const picker = get('videoVoiceLanguage');
    if (!Recognition) { mic.hidden = true; picker.hidden = true; return; }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    let keepListening = false;
    let silenceTimer = 0;
    const setListening = active => {
      mic.classList.toggle('listening', active);
      mic.setAttribute('aria-pressed', String(active));
      const status = get('videoVoiceStatus');
      status.hidden = !active;
      status.textContent = active ? tr().listening : '';
    };
    const clearSilence = () => clearTimeout(silenceTimer);
    const armSilence = () => {
      clearSilence();
      silenceTimer = setTimeout(() => { keepListening = false; try { recognition.stop(); } catch {} setListening(false); }, 90000);
    };
    const begin = () => {
      recognition.lang = picker.value === 'browser' ? (navigator.language || 'en-US') : picker.value;
      try { recognition.start(); } catch {}
    };
    recognition.onstart = () => setListening(true);
    recognition.onend = () => { if (!keepListening) { setListening(false); return; } setTimeout(() => { if (keepListening) begin(); }, 250); };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        keepListening = false; clearSilence(); setListening(false);
      }
    };
    recognition.onresult = event => {
      const parts = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) if (event.results[index].isFinal) parts.push(event.results[index][0].transcript);
      const spoken = parts.join(' ').trim();
      if (!spoken) return;
      const value = input.value || '';
      input.value = `${value}${value && !/\s$/.test(value) ? ' ' : ''}${spoken}`;
      const cursor = input.value.length;
      input.focus({ preventScroll: true });
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(cursor, cursor);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      armSilence();
    };
    mic.addEventListener('click', () => {
      if (keepListening) { keepListening = false; clearSilence(); try { recognition.stop(); } catch {} setListening(false); return; }
      keepListening = true;
      input.focus({ preventScroll: true });
      armSilence();
      begin();
    });
  }
  function uploadKind(file) {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    if (type === 'image/jpeg' || /\.jpe?g$/.test(name)) return { kind: 'image', type: 'image/jpeg' };
    if (type === 'image/png' || /\.png$/.test(name)) return { kind: 'image', type: 'image/png' };
    if (type === 'image/webp' || /\.webp$/.test(name)) return { kind: 'image', type: 'image/webp' };
    if (type === 'video/mp4' || /\.mp4$/.test(name)) return { kind: 'video', type: 'video/mp4' };
    if (type === 'video/quicktime' || /\.mov$/.test(name)) return { kind: 'video', type: 'video/quicktime' };
    if (type === 'video/webm' || /\.webm$/.test(name)) return { kind: 'video', type: 'video/webm' };
    return null;
  }
  async function addFiles(files) {
    for (const file of Array.from(files || [])) {
      const kind = uploadKind(file);
      const images = state.images.filter(item => !/^video\//.test(item.type || '')).length;
      const videos = state.images.filter(item => /^video\//.test(item.type || '')).length;
      if (!kind || (kind.kind === 'image' && (images >= 4 || file.size > 8 * 1024 * 1024)) || (kind.kind === 'video' && (videos >= 2 || file.size > 80 * 1024 * 1024))) { setStatus(tr().tooBig); continue; }
      if (kind.kind === 'video') {
        state.images.push({ type: kind.type, name: file.name, file, preview: URL.createObjectURL(file) });
        continue;
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error(tr().tooBig));
        reader.readAsDataURL(file);
      });
      if (!/^data:image\/(jpeg|png|webp);base64,/i.test(data) || data.length > 8_000_000) { setStatus(tr().tooBig); continue; }
      state.images.push({ type: kind.type, data, name: file.name, preview: data });
    }
    renderUploads();
    await saveImages();
    if (state.images.some(item => /^video\//.test(item.type || ''))) await loadCredits();
  }

  const storedLanguage = localStorage.getItem('ai-supermall-language');
  if (storedLanguage === 'en' || storedLanguage === 'zh') document.documentElement.lang = storedLanguage === 'en' ? 'en' : 'zh-CN';
  get('languageToggle').addEventListener('click', () => {
    const next = language() === 'en' ? 'zh' : 'en';
    localStorage.setItem('ai-supermall-language', next);
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    applyCopy();
  });
  form.addEventListener('submit', event => { event.preventDefault(); generate(false).catch(error => setStatus(error.message)); });
  get('videoRegenerate').addEventListener('click', () => generate(true).catch(error => setStatus(error.message)));
  get('videoDownload').addEventListener('click', () => downloadVideo().catch(error => setStatus(error.message)));
  get('saveProject').addEventListener('click', () => { state.saveAfterLogin = true; persistDraft(); saveProject(true).catch(error => setStatus(error.message)); });
  get('fileInput').addEventListener('change', event => { addFiles(event.target.files).catch(error => setStatus(error.message)); event.target.value = ''; });
  ['dragenter', 'dragover'].forEach(type => get('dropZone').addEventListener(type, event => { event.preventDefault(); get('dropZone').classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => get('dropZone').addEventListener(type, event => { event.preventDefault(); get('dropZone').classList.remove('dragging'); }));
  get('dropZone').addEventListener('drop', event => addFiles(event.dataTransfer?.files).catch(error => setStatus(error.message)));
  nameInput.addEventListener('input', persistDraft);
  input.addEventListener('input', persistDraft);
  window.addEventListener('pagehide', persistDraft);
  setupVoice();
  applyCopy();
  (async () => {
    try {
      let signed = false;
      try { signed = await signedIn(); } catch { signed = false; }
      if (!signed) {
        const projectId = query.get('project');
        const target = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId || '') ? `create-video.html?project=${projectId}` : 'create-video.html';
        location.replace(`account.html?mode=login&returnTo=${encodeURIComponent(target)}`);
        return;
      }
      document.documentElement.classList.remove('video-locked');
      if (workspace) { workspace.hidden = false; workspace.inert = false; }
      if (query.get('new') === '1' && !query.get('project')) {
        state.projectId = '';
        state.messages = [];
        state.images = [];
      } else if (query.get('restoreDraft') === '1') {
        restoreDraft();
        await restoreImages();
        await Promise.all(state.messages.map(signVideo));
        renderUploads();
      } else if (query.get('project')) await loadProject();
      render();
      const pending = current();
      if (pending?.taskId && !pending.video?.path) {
        state.generating = true;
        setStatus(tr().generating);
      }
      await loadCredits();
      if (pending?.taskId && !pending.video?.path) {
        await pollTask(pending.taskId, pending);
        state.generating = false;
        await loadCredits();
      }
      if (state.saveAfterLogin && await signedIn()) await saveProject(true);
    } catch (error) {
      state.generating = false;
      const projectId = state.projectId || query.get('project');
      if (/sign in|请先登录/i.test(String(error.message || '')) && projectId) {
        location.href = `account.html?mode=login&returnTo=${encodeURIComponent(`create-video.html?project=${projectId}`)}`;
        return;
      }
      setStatus(error.message);
      applyCopy();
    }
  })();
})();
