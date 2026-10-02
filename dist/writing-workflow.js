/* Writing & copy workspace. Text only; it reuses the existing project and history APIs. */
(() => {
  if (document.body.dataset.workspace !== 'writing') return;

  const get = id => document.getElementById(id);
  const form = get('workspaceForm');
  const input = get('taskInput');
  const nameInput = get('projectName');
  const draftKey = 'ai-supermall-writing-draft';
  const query = new URLSearchParams(location.search);
  const state = { messages: [], projectId: '', conversationId: '', title: '', generating: false, saveAfterLogin: false };
  const tr = () => document.documentElement.lang === 'en' ? {
    title: 'Writing & copy',
    description: 'Describe what you want written. Then keep revising in the same conversation.',
    panel: 'Tell AI what you want written',
    panelCopy: 'Use everyday language. The result follows your instruction, not the interface language.',
    projectName: 'Project name',
    task: 'Your request',
    placeholder: 'For example: write a short product introduction, or make the current draft more formal.',
    titlePlaceholder: 'Enter a project name',
    generate: 'Generate',
    revise: 'Continue editing',
    regenerate: 'Regenerate',
    copy: 'Copy text',
    copied: 'Text copied.',
    save: 'Save as project',
    saving: 'Saving your project…',
    saved: 'Saved to your project.',
    generating: 'AI is writing…',
    required: 'Describe what you want to write.',
    nothing: 'Generate some writing before copying it.',
    login: 'Sign in to save this writing.',
    result: 'Current writing',
    resultCopy: 'Ask for a change below. The next result revises this draft.',
    history: 'Revision',
    note: 'Sign in to save this writing to your projects. The conversation is also kept in History.',
    unnamed: 'Untitled writing',
    home: 'Home',
    projects: 'My Projects'
  } : {
    title: '写作与文案',
    description: '直接说明你想写什么。生成后可以在同一段内容上继续修改。',
    panel: '告诉 AI 你想写什么',
    panelCopy: '用自然语言描述即可。生成语言以你的要求为准，不会被界面语言改掉。',
    projectName: '项目名称',
    task: '你的需求',
    placeholder: '例如：写一段产品介绍，或把当前文字改得更正式。',
    titlePlaceholder: '请输入项目名称',
    generate: '生成',
    revise: '继续修改',
    regenerate: '重新生成',
    copy: '复制文本',
    copied: '文本已复制。',
    save: '保存为项目',
    saving: '正在保存项目…',
    saved: '已保存到项目。',
    generating: 'AI 正在写作…',
    required: '请先描述你想写的内容。',
    nothing: '还没有可以复制的文字。',
    login: '请先登录后再保存。',
    result: '当前文字',
    resultCopy: '在下方继续提出修改。下一次结果会基于这段文字。',
    history: '修改',
    note: '登录后可保存到项目，这段写作也会进入对话历史。',
    unnamed: '未命名写作',
    home: '首页',
    projects: '我的项目'
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
  const setStatus = message => { get('workspaceGenerationStatus').textContent = message || ''; };
  const currentText = () => String(state.messages.at(-1)?.answer || '');
  const defaultTitle = () => {
    const source = String(state.messages[0]?.question || input.value || '').replace(/\s+/g, ' ').trim();
    return source.slice(0, 40) || tr().unnamed;
  };
  const typedTitle = () => nameInput.value.trim().slice(0, 120);

  function applyCopy() {
    const text = tr();
    document.title = `AI SuperMall — ${text.title}`;
    get('workspaceTitle').textContent = text.title;
    get('workspaceDescription').textContent = text.description;
    get('writingPanelTitle').textContent = text.panel;
    get('writingPanelCopy').textContent = text.panelCopy;
    get('projectNameLabel').textContent = text.projectName;
    get('taskInputLabel').textContent = text.task;
    nameInput.placeholder = text.titlePlaceholder;
    input.placeholder = text.placeholder;
    get('workspaceSubmit').textContent = state.messages.length ? text.revise : text.generate;
    get('writingRegenerate').textContent = text.regenerate;
    get('writingCopy').textContent = text.copy;
    get('saveProject').textContent = text.save;
    get('writingResultTitle').textContent = text.result;
    get('writingResultCopy').textContent = text.resultCopy;
    get('homeLink').textContent = text.home;
    get('projectsLink').textContent = text.projects;
    get('languageToggle').textContent = language() === 'en' ? '中文' : 'EN';
    get('workspaceNote').textContent = text.note;
    get('writingRegenerate').disabled = !state.messages.length || state.generating;
    get('writingCopy').disabled = !currentText() || state.generating;
  }

  function render() {
    const latest = currentText();
    const result = get('writingResult');
    const history = get('workspaceHistory');
    result.textContent = latest;
    history.replaceChildren();
    state.messages.forEach((message, index) => {
      const card = document.createElement('article');
      const question = document.createElement('strong');
      const answer = document.createElement('p');
      question.textContent = `${tr().history} ${index + 1}: ${message.question || ''}`;
      answer.className = 'writing-output';
      answer.textContent = message.answer || '';
      card.append(question, answer);
      history.append(card);
    });
    get('workspaceResults').hidden = !state.messages.length;
    applyCopy();
  }

  function persistDraft() {
    const draft = {
      language: language(),
      title: nameInput.value,
      savedTitle: state.title,
      task: input.value,
      messages: state.messages,
      projectId: state.projectId,
      conversationId: state.conversationId,
      saveAfterLogin: state.saveAfterLogin
    };
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch {}
  }

  function restoreDraft() {
    let draft;
    try { draft = JSON.parse(sessionStorage.getItem(draftKey) || ''); } catch { return false; }
    if (!draft || typeof draft !== 'object') return false;
    state.messages = Array.isArray(draft.messages) ? draft.messages : [];
    state.projectId = String(draft.projectId || '');
    state.conversationId = String(draft.conversationId || '');
    state.title = String(draft.savedTitle || '');
    state.saveAfterLogin = Boolean(draft.saveAfterLogin);
    nameInput.value = String(draft.title || '');
    input.value = String(draft.task || '');
    if (draft.language === 'en' || draft.language === 'zh') document.documentElement.lang = draft.language === 'en' ? 'en' : 'zh-CN';
    if (state.projectId) history.replaceState(null, '', `create-writing.html?project=${encodeURIComponent(state.projectId)}`);
    else history.replaceState(null, '', 'create-writing.html');
    return true;
  }

  function restoreHandoff() {
    if (query.get('handoff') !== '1') return false;
    try {
      const handoff = JSON.parse(sessionStorage.getItem('ai-supermall-workspace-handoff') || '{}');
      if (handoff.workspace !== 'writing' || typeof handoff.task !== 'string' || !handoff.task.trim()) return false;
      input.value = handoff.task.trim().slice(0, 8000);
      if (handoff.language === 'en' || handoff.language === 'zh') {
        localStorage.setItem('ai-supermall-language', handoff.language);
        document.documentElement.lang = handoff.language === 'en' ? 'en' : 'zh-CN';
      }
      sessionStorage.removeItem('ai-supermall-workspace-handoff');
      history.replaceState(null, '', 'create-writing.html');
      persistDraft();
      return true;
    } catch { sessionStorage.removeItem('ai-supermall-workspace-handoff'); return false; }
  }

  async function signedIn() { return (await fetch('/api/account/me')).ok; }

  function projectConversation() {
    const task = input.value.trim() || state.messages.at(-1)?.question || state.messages[0]?.question || '';
    return [{ type: 'project_meta', workspace: 'writing', intent: 'writing', task: task.slice(0, 2000) }, ...state.messages.map(message => ({ question: message.question || '', answer: message.answer || '', workspace: 'writing' }))];
  }

  async function saveHistory() {
    if (!state.messages.length || !(await signedIn())) return;
    const existing = Boolean(state.conversationId);
    const payload = existing
      ? { id: state.conversationId, locale: language(), messages: state.messages.map(message => ({ ...message, workspace: 'writing' })) }
      : { title: typedTitle() || state.title || defaultTitle(), locale: language(), messages: state.messages.map(message => ({ ...message, workspace: 'writing' })) };
    const saved = await api('/api/member/conversations', existing ? patch(payload) : json(payload));
    const row = Array.isArray(saved) ? saved[0] : saved;
    if (!existing && row?.id) state.conversationId = row.id;
  }

  async function saveProject(manual = false) {
    const hasContent = Boolean(typedTitle() || input.value.trim() || state.messages.length);
    if (!hasContent) { if (manual) setStatus(tr().required); return; }
    if (!(await signedIn())) {
      state.saveAfterLogin = true;
      persistDraft();
      if (manual) location.href = `account.html?mode=login&returnTo=${encodeURIComponent('create-writing.html?restoreDraft=1')}`;
      else setStatus(tr().login);
      return;
    }
    setStatus(tr().saving);
    const typed = typedTitle();
    if (!state.projectId) {
      const title = typed || state.title || defaultTitle();
      const created = await api('/api/member/projects', json({ title, locale: language(), conversation: projectConversation() }));
      const project = Array.isArray(created) ? created[0] : created;
      if (!project?.id) throw new Error('Project could not be created.');
      state.projectId = project.id;
      state.title = project.title || title;
      if (!nameInput.value.trim()) nameInput.value = state.title;
    } else {
      const body = { id: state.projectId, locale: language(), conversation: projectConversation() };
      if (typed) body.title = typed;
      const updated = await api('/api/member/projects', patch(body));
      state.title = typed || updated.title || state.title;
    }
    state.saveAfterLogin = false;
    persistDraft();
    history.replaceState(null, '', `create-writing.html?project=${encodeURIComponent(state.projectId)}`);
    setStatus(tr().saved);
  }

  async function loadProject() {
    const projectId = query.get('project');
    if (!projectId) return false;
    const project = await api(`/api/member/projects?id=${encodeURIComponent(projectId)}`);
    const meta = (project.conversation || []).find(item => item?.type === 'project_meta');
    if (meta?.workspace && meta.workspace !== 'writing') return false;
    state.projectId = project.id;
    state.title = project.title || '';
    nameInput.value = state.title;
    state.messages = (project.conversation || []).filter(item => item?.type !== 'project_meta' && item?.type !== 'workspace_state').map(item => ({ question: item.question || '', answer: item.answer || '', workspace: 'writing' }));
    input.value = '';
    return true;
  }

  async function copyText() {
    const value = currentText();
    if (!value) { setStatus(tr().nothing); return; }
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement('textarea');
      area.value = value;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.focus();
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setStatus(tr().copied);
  }

  async function generate(regenerate = false) {
    if (state.generating) return;
    const prior = regenerate ? state.messages.slice(0, -1) : state.messages;
    const instruction = (regenerate ? state.messages.at(-1)?.question : input.value).trim();
    if (!instruction) { setStatus(tr().required); input.focus(); return; }
    state.generating = true;
    applyCopy();
    setStatus(tr().generating);
    try {
      const response = await api('/api/writing/generate', json({
        prompt: instruction,
        draft: prior.at(-1)?.answer || '',
        context: prior.slice(-8),
        language: language()
      }));
      if (regenerate) state.messages[state.messages.length - 1].answer = response.text || '';
      else {
        state.messages.push({ question: instruction, answer: response.text || '', workspace: 'writing' });
        input.value = '';
      }
      if (!state.title && !typedTitle()) state.title = defaultTitle();
      render();
      persistDraft();
      history.replaceState(null, '', state.projectId ? `create-writing.html?project=${encodeURIComponent(state.projectId)}` : 'create-writing.html');
      await saveHistory();
      if (state.projectId) await saveProject(false);
      else setStatus('');
    } catch (error) {
      setStatus(error.message);
    } finally {
      state.generating = false;
      applyCopy();
    }
  }

  const storedLanguage = localStorage.getItem('ai-supermall-language');
  if (storedLanguage === 'en' || storedLanguage === 'zh') document.documentElement.lang = storedLanguage === 'en' ? 'en' : 'zh-CN';
  get('languageToggle').addEventListener('click', () => {
    const next = language() === 'en' ? 'zh' : 'en';
    localStorage.setItem('ai-supermall-language', next);
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    applyCopy();
    render();
  });
  form.addEventListener('submit', event => { event.preventDefault(); generate(false); });
  get('writingRegenerate').addEventListener('click', () => generate(true));
  get('writingCopy').addEventListener('click', () => copyText());
  get('saveProject').addEventListener('click', () => { state.saveAfterLogin = true; persistDraft(); saveProject(true).catch(error => setStatus(error.message)); });
  nameInput.addEventListener('input', persistDraft);
  input.addEventListener('input', () => { history.replaceState(null, '', state.projectId ? `create-writing.html?project=${encodeURIComponent(state.projectId)}` : 'create-writing.html'); persistDraft(); });
  window.addEventListener('pagehide', persistDraft);

  (async () => {
    try {
      if (query.get('project')) await loadProject();
      else if (query.get('restoreDraft') === '1') restoreDraft();
      else if (!restoreHandoff() && query.get('new') !== '1') restoreDraft();
      render();
      if (state.saveAfterLogin && await signedIn()) await saveProject(true);
    } catch (error) {
      const signedOut = /sign in/i.test(String(error.message || ''));
      const projectId = query.get('project');
      if (signedOut && projectId) {
        location.href = `account.html?mode=login&returnTo=${encodeURIComponent(`create-writing.html?project=${projectId}`)}`;
        return;
      }
      setStatus(error.message);
      applyCopy();
    }
  })();
})();
