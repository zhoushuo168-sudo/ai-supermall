/* Golf swing MVP. Saves the video only. It does not call a model. */
(() => {
  if (!document.body.classList.contains('golf-app')) return;
  const PHASES = ['setup', 'takeaway', 'backswing', 'top', 'downswing', 'impact', 'follow-through'];
  const CLUBS = ['driver', 'iron'];
  const ANGLES = ['face-on', 'down-the-line'];
  const REFERENCE_KEYS = ['driver:face-on', 'driver:down-the-line', 'iron:face-on', 'iron:down-the-line'];
  const labels = {
    zh: { driver: '1号木', iron: '铁杆', 'face-on': '正面', 'down-the-line': '侧后方', saving: '正在保存视频…', saved: '视频已保存。', needVideo: '请先选择一个挥杆视频。', needClub: '请选择球杆：1号木或铁杆。', needAngle: '请选择拍摄角度：正面或侧后方。', badType: '请选择 MP4、MOV 或 WEBM 视频。', tooBig: '请选择小于 80 MB 的视频。', failed: '暂时无法保存，请稍后再试。' },
    en: { driver: 'Driver', iron: 'Iron', 'face-on': 'Face On', 'down-the-line': 'Down the Line', saving: 'Saving the video…', saved: 'Video saved.', needVideo: 'Choose a swing video first.', needClub: 'Choose Driver or Iron.', needAngle: 'Choose Face On or Down the Line.', badType: 'Use an MP4, MOV, or WEBM video.', tooBig: 'Use a video under 80 MB.', failed: 'Unable to save right now. Please try again.' }
  };
  const text = () => labels[document.documentElement.lang === 'en' ? 'en' : 'zh'];
  const $ = id => document.getElementById(id);
  const fileInput = $('golfFile');
  const preview = $('golfPreview');
  const previewWrap = $('golfPreviewWrap');
  const statusNode = $('golfStatus');
  let selected = null;
  let busy = false;
  const setStatus = message => { statusNode.textContent = message || ''; if (message) statusNode.scrollIntoView({ block: 'center', inline: 'nearest' }); };
  const videoType = file => {
    const name = String(file?.name || '').toLowerCase();
    if (file?.type === 'video/mp4' || file?.type === 'video/quicktime' || file?.type === 'video/webm') return file.type;
    if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
    if (name.endsWith('.mov')) return 'video/quicktime';
    if (name.endsWith('.webm')) return 'video/webm';
    return '';
  };
  const clearVideo = () => {
    if (preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
    preview.removeAttribute('src');
    preview.load();
    previewWrap.hidden = true;
    fileInput.value = '';
    selected = null;
  };
  const showLocal = file => {
    clearVideo();
    selected = file;
    preview.src = URL.createObjectURL(file);
    previewWrap.hidden = false;
    setStatus('');
  };
  const chosen = name => document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const sessionRecord = (club, angle, media) => ({
    v: 1,
    kind: 'golf-session',
    sport: 'golf',
    club,
    angle,
    referenceKey: `${club}:${angle}`,
    video: media?.path ? { provider: media.provider || 'oss', path: media.path, name: media.name || '', type: media.type || '' } : null,
    phases: PHASES,
    analysis: null,
    comparisons: null
  });
  const readRecord = project => {
    const items = Array.isArray(project?.conversation) ? project.conversation : [];
    const storedVideo = items.flatMap(item => item.images || []).find(image => image?.path && (String(image.type || '').startsWith('video/') || /\.(mp4|mov|webm)$/i.test(image.path)));
    const candidates = [items.find(item => item?.type === 'project_meta')?.task, ...items.map(item => item?.question)];
    for (const value of candidates) {
      try {
        const record = JSON.parse(value || '');
        if (record?.kind === 'golf-session' && CLUBS.includes(record.club) && ANGLES.includes(record.angle) && REFERENCE_KEYS.includes(record.referenceKey)) return { record, media: record.video?.path ? record.video : storedVideo || null };
      } catch {}
    }
    return null;
  };
  const api = async (path, options) => {
    const response = await fetch(path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || text().failed);
    return body;
  };
  async function saveSwing() {
    const club = chosen('club');
    const angle = chosen('angle');
    const record = sessionRecord(club, angle, null);
    const language = document.documentElement.lang === 'en' ? 'en' : 'zh';
    const title = `Golf · ${labels.en[club]} · ${labels.en[angle]}`.slice(0, 120);
    const created = await api('/api/member/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, locale: language, conversation: [{ type: 'project_meta', workspace: 'golf', intent: 'golf', task: JSON.stringify(record) }, { question: JSON.stringify(record), answer: '' }] }) });
    const project = Array.isArray(created) ? created[0] : created;
    if (!project?.id) throw new Error(text().failed);
    const uploadFile = selected.type === videoType(selected) ? selected : new File([selected], selected.name || 'swing.mp4', { type: videoType(selected) });
    const form = new FormData();
    form.set('projectId', project.id);
    form.set('kind', 'reference');
    form.set('file', uploadFile, uploadFile.name);
    const uploaded = await api('/api/member/oss-media', { method: 'POST', body: form });
    const media = uploaded.media;
    if (!media?.path) throw new Error(text().failed);
    const saved = sessionRecord(club, angle, media);
    await api('/api/member/projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, locale: language, conversation: [{ type: 'project_meta', workspace: 'golf', intent: 'golf', task: JSON.stringify(saved) }, { question: `${labels.en[club]} · ${labels.en[angle]}`, answer: '', images: [media] }] }) });
    return project.id;
  }
  async function showResult(project) {
    const parsed = readRecord(project);
    if (!parsed) return false;
    $('golfSetup').hidden = true;
    $('golfResult').hidden = false;
    $('golfResultClub').textContent = text()[parsed.record.club];
    $('golfResultAngle').textContent = text()[parsed.record.angle];
    $('golfResultName').textContent = parsed.media?.name || project.title || '';
    const player = $('golfResultVideo');
    player.removeAttribute('src');
    if (parsed.media?.path) {
      const signed = await api(`/api/member/oss-media?provider=oss&path=${encodeURIComponent(parsed.media.path)}`);
      player.src = signed.url || '';
    }
    return true;
  }
  async function listSaved() {
    const box = $('golfSaved');
    const list = $('golfSavedList');
    try {
      const projects = await api('/api/member/projects');
      const sessions = (Array.isArray(projects) ? projects : []).map(project => ({ project, parsed: readRecord(project) })).filter(item => item.parsed);
      box.hidden = !sessions.length;
      list.replaceChildren(...sessions.map(item => {
        const link = document.createElement('a');
        link.href = `sports-golf.html?session=${encodeURIComponent(item.project.id)}`;
        const name = document.createElement('strong');
        name.textContent = `${text()[item.parsed.record.club]} · ${text()[item.parsed.record.angle]}`;
        const when = document.createElement('small');
        when.textContent = new Date(item.project.updated_at).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'zh-CN');
        link.append(name, when);
        return link;
      }));
    } catch { box.hidden = true; }
  }
  $('golfSignOut').addEventListener('click', async () => {
    try { await fetch('/api/account/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('ai-supermall-visual-draft-pending');
    ['ai-supermall-workspace-handoff', 'ai-supermall-post-login-return', 'ai-supermall-writing-draft', 'ai-supermall-presentation-draft', 'ai-supermall-video-draft'].forEach(key => sessionStorage.removeItem(key));
    try { indexedDB.deleteDatabase('ai-supermall-visual-drafts'); indexedDB.deleteDatabase('ai-supermall-video-drafts'); } catch {}
    location.href = 'account.html?mode=login';
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const type = videoType(file);
    if (!type) { clearVideo(); setStatus(text().badType); return; }
    if (file.size > 80 * 1024 * 1024) { clearVideo(); setStatus(text().tooBig); return; }
    showLocal(file);
  });
  $('golfRemove').addEventListener('click', () => { clearVideo(); setStatus(''); });
  $('golfAnalyze').addEventListener('click', () => {
    if (busy) return;
    if (!selected) { setStatus(text().needVideo); return; }
    if (!CLUBS.includes(chosen('club'))) { setStatus(text().needClub); return; }
    if (!ANGLES.includes(chosen('angle'))) { setStatus(text().needAngle); return; }
    busy = true;
    $('golfAnalyze').disabled = true;
    setStatus(text().saving);
    saveSwing().then(id => { location.assign(`sports-golf.html?session=${encodeURIComponent(id)}`); }).catch(error => {
      setStatus(error.message || text().failed);
      busy = false;
      $('golfAnalyze').disabled = false;
    });
  });
  $('golfAnother').addEventListener('click', () => { location.assign('sports-golf.html'); });
  new MutationObserver(() => {
    const parsed = window.__golfSession;
    if (parsed && !$('golfResult').hidden) {
      $('golfResultClub').textContent = text()[parsed.record.club];
      $('golfResultAngle').textContent = text()[parsed.record.angle];
    }
    if (!$('golfSetup').hidden) listSaved();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  (async () => {
    document.documentElement.classList.add('golf-locked');
    let signed = false;
    try { signed = (await fetch('/api/account/me')).ok; } catch { signed = false; }
    if (!signed) {
      const session = new URLSearchParams(location.search).get('session');
      const target = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(session || '') ? `sports-golf.html?session=${session}` : 'sports-golf.html';
      location.replace(`account.html?mode=login&returnTo=${encodeURIComponent(target)}`);
      return;
    }
    document.documentElement.classList.remove('golf-locked');
    const session = new URLSearchParams(location.search).get('session');
    if (session) {
      try {
        const project = await api(`/api/member/projects?id=${encodeURIComponent(session)}`);
        const parsed = readRecord(project);
        if (parsed && await showResult(project)) {
          window.__golfSession = parsed;
          document.dispatchEvent(new Event('golf-session-ready'));
          return;
        }
      } catch (error) { setStatus(error.message || text().failed); }
    }
    await listSaved();
  })();
})();
