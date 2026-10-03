/* Browser-only pose check for a saved swing. It draws a body skeleton and does not judge the swing. */
import { FilesetResolver, PoseLandmarker } from '/vendor/mediapipe/vision_bundle.js';

const SAMPLE_FPS = 24;
const MAX_SECONDS = 20;
const STABLE = 0.5;
const FOCUS = [
  [0, '头', 'Head'],
  [11, '左肩', 'Left shoulder'],
  [12, '右肩', 'Right shoulder'],
  [13, '左肘', 'Left elbow'],
  [14, '右肘', 'Right elbow'],
  [15, '左手腕', 'Left wrist'],
  [16, '右手腕', 'Right wrist'],
  [23, '左髋', 'Left hip'],
  [24, '右髋', 'Right hip'],
  [25, '左膝', 'Left knee'],
  [26, '右膝', 'Right knee'],
  [27, '左踝', 'Left ankle'],
  [28, '右踝', 'Right ankle']
];
const LINKS = [[0, 11], [0, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const LEFT = new Set([11, 13, 15, 23, 25, 27]);
const RIGHT = new Set([12, 14, 16, 24, 26, 28]);
const copy = {
  zh: {
    loading: '正在加载姿态模型…',
    reading: '正在读取视频…',
    running: (done, total) => `正在识别人体 ${done}/${total}`,
    ready: '可以播放视频，查看骨架是否跟着挥杆移动。',
    noVideo: '请先打开一条已保存的挥杆。',
    failed: '姿态测试没有完成，原来的视频还在。',
    noPerson: '没有稳定识别到人。请播放视频，确认全身是否都在画面里。',
    clipped: seconds => `视频共 ${seconds} 秒，这次只分析了前 ${MAX_SECONDS} 秒。`,
    length: (seconds, clipped) => clipped ? `视频长度 ${seconds} 秒，分析前 ${MAX_SECONDS} 秒` : `视频长度 ${seconds} 秒`,
    frames: (count, fps) => `分析帧数 ${count}（每秒 ${fps} 帧）`,
    found: (found, count) => `识别到人的帧数 ${found}/${count}`,
    time: seconds => `处理时间 ${seconds} 秒`,
    where: gpu => gpu ? '运行位置：浏览器 GPU' : '运行位置：浏览器 CPU',
    stable: (name, stable, found) => `${name} 稳定 ${stable}/${found}`,
    frameMiss: '这一帧没有识别到人',
    frameOk: '这一帧重点部位可见',
    frameWeak: names => `这一帧不够稳定：${names}`
  },
  en: {
    loading: 'Loading the pose model…',
    reading: 'Reading the video…',
    running: (done, total) => `Reading the body ${done}/${total}`,
    ready: 'Play the video and see whether the skeleton follows the swing.',
    noVideo: 'Open a saved swing first.',
    failed: 'The pose test did not finish. The original video is still here.',
    noPerson: 'No person was tracked reliably. Play the video and check that the full body stays in frame.',
    clipped: seconds => `The video is ${seconds}s. This test read only the first ${MAX_SECONDS}s.`,
    length: (seconds, clipped) => clipped ? `Length ${seconds}s, first ${MAX_SECONDS}s tested` : `Length ${seconds}s`,
    frames: (count, fps) => `Frames read ${count} (${fps} per second)`,
    found: (found, count) => `Frames with a person ${found}/${count}`,
    time: seconds => `Processing time ${seconds}s`,
    where: gpu => gpu ? 'Runs in the browser on GPU' : 'Runs in the browser on CPU',
    stable: (name, stable, found) => `${name} stable ${stable}/${found}`,
    frameMiss: 'No person in this frame',
    frameOk: 'Focused joints look stable in this frame',
    frameWeak: names => `Unstable in this frame: ${names}`
  }
};

const $ = id => document.getElementById(id);
const english = () => document.documentElement.lang === 'en';
const text = () => copy[english() ? 'en' : 'zh'];
const seconds = value => (Math.round(value * 10) / 10).toFixed(1);
const jointColor = index => LEFT.has(index) ? '#2f9bff' : RIGHT.has(index) ? '#ff8a2a' : '#ffffff';
const linkColor = (a, b) => LEFT.has(a) && LEFT.has(b) ? '#2f9bff' : RIGHT.has(a) && RIGHT.has(b) ? '#ff8a2a' : '#ffffff';

let busy = false;
let generation = 0;
let samples = [];
let summary = null;
let localUrl = '';
let painting = false;

function setStatus(message) {
  const node = $('golfPoseStatus');
  if (node) node.textContent = message || '';
}

function pictureBox(video) {
  const width = video.clientWidth;
  const height = video.clientHeight;
  const scale = Math.min(width / (video.videoWidth || width || 1), height / (video.videoHeight || height || 1));
  const boxWidth = (video.videoWidth || width) * scale;
  const boxHeight = (video.videoHeight || height) * scale;
  return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, w: boxWidth, h: boxHeight };
}

function draw(video, points) {
  const canvas = $('golfPoseCanvas');
  if (!canvas || canvas.hidden) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(video.clientWidth * dpr));
  const height = Math.max(1, Math.round(video.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!points) return;
  const box = pictureBox(video);
  const xOf = index => (box.x + points[index][0] * box.w) * dpr;
  const yOf = index => (box.y + points[index][1] * box.h) * dpr;
  const stable = index => points[index] && points[index][2] >= STABLE;
  ctx.lineCap = 'round';
  LINKS.forEach(([a, b]) => {
    if (!stable(a) || !stable(b)) return;
    ctx.beginPath();
    ctx.moveTo(xOf(a), yOf(a));
    ctx.lineTo(xOf(b), yOf(b));
    ctx.lineWidth = 5 * dpr;
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.stroke();
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = linkColor(a, b);
    ctx.stroke();
  });
  FOCUS.forEach(([index]) => {
    if (!points[index]) return;
    ctx.beginPath();
    ctx.arc(xOf(index), yOf(index), 5.5 * dpr, 0, Math.PI * 2);
    if (stable(index)) {
      ctx.fillStyle = jointColor(index);
      ctx.fill();
    } else {
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = jointColor(index);
      ctx.stroke();
    }
  });
}

function nearest(time) {
  if (!samples.length) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].t < time) low = mid + 1;
    else high = mid;
  }
  const next = samples[low];
  const prev = samples[low - 1];
  if (!prev) return next;
  return Math.abs(prev.t - time) <= Math.abs(next.t - time) ? prev : next;
}

function renderLive() {
  const node = $('golfPoseLive');
  const video = $('golfResultVideo');
  if (!node || !video || !samples.length) return;
  const sample = nearest(video.currentTime || 0);
  const labels = text();
  if (!sample?.points) {
    if (node.textContent !== labels.frameMiss) node.textContent = labels.frameMiss;
    return;
  }
  const weak = FOCUS.filter(([index]) => (sample.points[index]?.[2] ?? 0) < STABLE).map(([, zh, en]) => english() ? en : zh);
  const next = weak.length ? labels.frameWeak(weak.join(english() ? ', ' : '、')) : labels.frameOk;
  if (node.textContent !== next) node.textContent = next;
}

function renderStats() {
  const node = $('golfPoseStats');
  if (!node || !summary) return;
  const labels = text();
  const lines = [
    labels.length(summary.length, summary.clipped),
    summary.clipped ? labels.clipped(summary.length) : '',
    labels.frames(summary.count, SAMPLE_FPS),
    labels.found(summary.found, summary.count),
    labels.time(summary.elapsed),
    labels.where(summary.gpu)
  ].filter(Boolean);
  if (summary.found) {
    FOCUS.forEach(([index, zh, en]) => {
      lines.push(labels.stable(english() ? en : zh, summary.stable[index] || 0, summary.found));
    });
  }
  node.replaceChildren(...lines.map(line => {
    const row = document.createElement('div');
    row.textContent = line;
    return row;
  }));
  node.hidden = false;
  $('golfPoseLegend').hidden = false;
  renderLive();
}

function paint() {
  const video = $('golfResultVideo');
  if (!video || !samples.length) return;
  const sample = nearest(video.currentTime || 0);
  draw(video, sample?.points || null);
  renderLive();
}

function watchPlayback() {
  if (painting) return;
  painting = true;
  const loop = () => {
    paint();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener('resize', paint);
}

function pack(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) return null;
  return landmarks.map(point => [
    Math.round((Number(point?.x) || 0) * 10000) / 10000,
    Math.round((Number(point?.y) || 0) * 10000) / 10000,
    Math.round((Number(point?.visibility) || 0) * 1000) / 1000
  ]);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function seek(video, time) {
  const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.04));
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 900);
    video.addEventListener('seeked', done);
    try { video.currentTime = target; } catch { done(); }
  });
}

async function loadModel() {
  const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
  const options = delegate => ({
    baseOptions: { modelAssetPath: '/vendor/mediapipe/pose_landmarker_full.task', delegate },
    runningMode: 'VIDEO',
    numPoses: 1
  });
  try {
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options('GPU')), gpu: true, fileset, options };
  } catch {
    return { landmarker: await PoseLandmarker.createFromOptions(fileset, options('CPU')), gpu: false, fileset, options };
  }
}

async function readVideo(path) {
  const response = await fetch(`/api/member/oss-media?provider=oss&path=${encodeURIComponent(path)}&download=1`);
  if (!response.ok) throw new Error('download');
  return response.blob();
}

async function showLocal(video, blob) {
  const previous = video.currentSrc || video.src;
  const url = URL.createObjectURL(blob);
  const oldUrl = localUrl;
  localUrl = url;
  video.pause();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('load')); }, 20000);
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error('load')); };
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', ok);
        video.removeEventListener('error', bad);
      };
      video.addEventListener('loadeddata', ok);
      video.addEventListener('error', bad);
      video.src = url;
      video.load();
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    localUrl = oldUrl;
    if (previous) video.src = previous;
    throw error;
  }
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  return previous;
}

async function runPose() {
  if (busy) return;
  const video = $('golfResultVideo');
  const button = $('golfPoseTest');
  const path = window.__golfSession?.media?.path || '';
  if (!video || $('golfResult')?.hidden || !path) {
    setStatus(text().noVideo);
    return;
  }
  const generationId = ++generation;
  busy = true;
  button.disabled = true;
  samples = [];
  summary = null;
  $('golfPoseCanvas').hidden = true;
  $('golfPoseStats').hidden = true;
  $('golfPoseLive').textContent = '';
  const started = performance.now();
  const wasMuted = video.muted;
  let previous = '';
  let model = null;
  try {
    setStatus(text().loading);
    model = await loadModel();
    setStatus(text().reading);
    const blob = await readVideo(path);
    previous = await showLocal(video, blob);
    video.muted = true;
    try { await video.play(); video.pause(); } catch {}
    if (!video.videoWidth || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('load');
    const span = Math.min(video.duration, MAX_SECONDS);
    const step = 1 / SAMPLE_FPS;
    const times = [];
    for (let time = 0; time < span - 0.001; time += step) times.push(time);
    if (!times.length) times.push(0);
    let stamp = performance.now();
    let gpu = model.gpu;
    for (let index = 0; index < times.length; index += 1) {
      if (generationId !== generation) return;
      if (index % 4 === 0) setStatus(text().running(index, times.length));
      await seek(video, times[index]);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      stamp = Math.max(performance.now(), stamp + 1);
      let result;
      try {
        result = model.landmarker.detectForVideo(video, stamp);
      } catch (error) {
        if (!gpu) throw error;
        try { model.landmarker.close(); } catch {}
        model.landmarker = await PoseLandmarker.createFromOptions(model.fileset, model.options('CPU'));
        gpu = false;
        stamp = Math.max(performance.now(), stamp + 1);
        result = model.landmarker.detectForVideo(video, stamp);
      }
      samples.push({ t: times[index], points: pack(result?.landmarks?.[0]) });
      await wait(0);
    }
    const found = samples.filter(sample => sample.points).length;
    const stable = {};
    FOCUS.forEach(([index]) => {
      stable[index] = samples.filter(sample => sample.points && (sample.points[index]?.[2] ?? 0) >= STABLE).length;
    });
    summary = {
      length: seconds(video.duration),
      clipped: video.duration > MAX_SECONDS + 0.05,
      count: samples.length,
      found,
      elapsed: seconds((performance.now() - started) / 1000),
      gpu,
      stable
    };
    $('golfPoseCanvas').hidden = false;
    renderStats();
    watchPlayback();
    video.currentTime = 0;
    video.muted = wasMuted;
    setStatus(found ? text().ready : text().noPerson);
    try { await video.play(); } catch {}
  } catch {
    if (previous) video.src = previous;
    video.muted = wasMuted;
    setStatus(text().failed);
  } finally {
    try { model?.landmarker?.close(); } catch {}
    busy = false;
    button.disabled = false;
  }
}

window.addEventListener('pagehide', () => {
  generation += 1;
  if (localUrl) URL.revokeObjectURL(localUrl);
});
new MutationObserver(() => { renderStats(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
$('golfPoseTest')?.addEventListener('click', () => { runPose(); });
