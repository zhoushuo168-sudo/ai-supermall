/* Shared playback for the customer's swing and the standard swing.
   It does not match swing phases, change either video's length, or draw on the standard video. */
(() => {
  if (!document.body.classList.contains('golf-app')) return;
  const user = document.getElementById('golfResultVideo');
  const standard = document.getElementById('golfStandardVideo');
  const empty = document.getElementById('golfStandardEmpty');
  if (!user || !standard) return;
  let rate = 1;
  const hasSource = video => Boolean(video.currentSrc || video.getAttribute('src'));
  const applyRate = () => {
    [user, standard].forEach(video => {
      if (!hasSource(video)) return;
      try { video.playbackRate = rate; } catch {}
    });
  };
  const start = (video, force) => {
    if (!hasSource(video) || video.hidden) return;
    if (video.ended && !force) return;
    try { video.playbackRate = rate; } catch {}
    const pending = video.play();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  };
  const play = () => {
    applyRate();
    start(user, false);
    start(standard, false);
  };
  const pause = () => {
    user.pause();
    standard.pause();
  };
  const replay = () => {
    pause();
    [user, standard].forEach(video => {
      if (!hasSource(video) || video.hidden) return;
      try { video.currentTime = 0; } catch {}
    });
    applyRate();
    start(user, true);
    start(standard, true);
  };
  const setRate = next => {
    if (![1, 0.5, 0.3].includes(next)) return;
    rate = next;
    applyRate();
    document.querySelectorAll('[data-golf-speed]').forEach(button => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.golfSpeed) === next));
    });
  };
  document.getElementById('golfPlay')?.addEventListener('click', play);
  document.getElementById('golfPause')?.addEventListener('click', pause);
  document.getElementById('golfReplay')?.addEventListener('click', replay);
  document.querySelectorAll('[data-golf-speed]').forEach(button => {
    button.addEventListener('click', () => setRate(Number(button.dataset.golfSpeed)));
  });
  user.addEventListener('loadedmetadata', applyRate);
  standard.addEventListener('loadedmetadata', applyRate);

  const configuredSlot = () => {
    const slots = window.aiSuperMallGolfStandard?.slots;
    if (!Array.isArray(slots)) return null;
    const club = window.__golfSession?.record?.club || '';
    return slots.find(slot => slot && slot.club === club && typeof slot.src === 'string' && slot.src) || null;
  };
  const applyStandard = () => {
    const slot = configuredSlot();
    if (!slot) {
      standard.pause();
      standard.removeAttribute('src');
      standard.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    standard.hidden = false;
    if (standard.getAttribute('src') !== slot.src) standard.src = slot.src;
    applyRate();
  };
  document.addEventListener('golf-session-ready', applyStandard);
  applyStandard();

  const analysis = document.getElementById('golfAnalysisCanvas');
  window.aiSuperMallGolfOverlay = {
    userCanvas: analysis,
    clear() {
      if (!analysis) return;
      analysis.getContext('2d')?.clearRect(0, 0, analysis.width, analysis.height);
    }
  };
})();
