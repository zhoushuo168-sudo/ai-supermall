/* Pose overlay and phase comparison for the golfer's video only.
   The standard swing video is left clean. */
import { FilesetResolver, PoseLandmarker } from '/vendor/mediapipe/vision_bundle.js';

// Local-only crash diagnostics: one small persistent record, no media or landmarks.
const crashDiagKey = 'golf-crash-stage-v1';
let crashDiagPanel;
let previousCrashDiag = '无';
let crashDiagStorageAvailable = true;
try {
  const previous = JSON.parse(localStorage.getItem(crashDiagKey) || 'null');
  if (previous) previousCrashDiag = JSON.stringify(previous);
} catch { crashDiagStorageAvailable = false; }
function showCrashStage(record) {
  try {
    if (!crashDiagPanel) {
      crashDiagPanel = document.createElement('div');
      crashDiagPanel.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;font-size:12px';
      document.body.prepend(crashDiagPanel);
    }
    crashDiagPanel.textContent = `上一次诊断最后成功：${previousCrashDiag}\n当前诊断：${record ? JSON.stringify(record) : '尚未开始'}${crashDiagStorageAvailable ? '' : '\n本地诊断存储不可用，Crash 后记录可能无法保留。'}`;
  } catch {}
}
function markCrashStage(stage, data = {}) {
  const record = { stage, time: new Date().toISOString(), ...data };
  try { localStorage.setItem(crashDiagKey, JSON.stringify(record)); }
  catch { crashDiagStorageAvailable = false; }
  showCrashStage(record);
}
if (document.body?.classList.contains('golf-app')) {
  showCrashStage(null);
  document.addEventListener('golf-crash-stage', event => markCrashStage(event.detail));
}

const SEEN = 0.5;
const LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
const STANCE = [11, 12, 23, 24, 27, 28];
const FRONT_METRICS = [
  ['pelvis_sway', '骨盆侧移', 'Pelvis sway', ' 躯干', ' torso'],
  ['torso_sway', '躯干侧移', 'Torso sway', ' 躯干', ' torso'],
  ['head_sway', '头部侧移', 'Head sway', ' 躯干', ' torso'],
  ['pelvis_lift', '骨盆升降', 'Pelvis lift', ' 躯干', ' torso'],
  ['lead_knee_flexion', '前导膝屈伸', 'Lead knee', '°', '°'],
  ['trail_knee_flexion', '后侧膝屈伸', 'Trail knee', '°', '°'],
  ['hand_path', '手部轨迹', 'Hand path', ' 躯干', ' torso']
];
const PHASE_NAME = {
  zh: { address: '准备', backswing: '上杆', top: '上杆顶点', downswing: '下杆', impact: '击球', 'follow-through': '送杆' },
  en: { address: 'Address', backswing: 'Backswing', top: 'Top', downswing: 'Downswing', impact: 'Impact', 'follow-through': 'Follow-through' }
};
const copy = {
  zh: {
    loading: '正在加载姿态模型…',
    failed: '姿态分析没有完成，原来的视频还在。',
    noPerson: '没有稳定识别到人。请确认全身都在画面里。',
    using: name => `正在与${name}标准挥杆比较`,
    unaligned: '这次没能和标准挥杆对齐。请确认全身都在画面里。',
    line: (name, value, unit) => `${name}：轨迹误差 ${value}${unit}`,
    tip: (name, value, unit) => `${name}轨迹误差 ${value}${unit}。`,
    swayRight: '上杆存在右侧移',
    swayLeft: '下杆存在左侧移',
    swayNone: '未检测到明显侧移',
    swayRightTip: '上杆时让骨盆保持在中间。',
    swayLeftTip: '下杆时不要让骨盆滑过左脚外侧。'
  },
  en: {
    loading: 'Loading the pose model…',
    failed: 'Pose analysis did not finish. The original video is still here.',
    noPerson: 'No person was tracked reliably. Keep the whole body in frame.',
    using: name => `Comparing with the ${name} standard swing`,
    unaligned: 'This swing could not be aligned with the standard. Keep the whole body in frame.',
    line: (name, value, unit) => `${name}: trajectory error ${value}${unit}`,
    tip: (name, value, unit) => `${name} trajectory error ${value}${unit}.`,
    swayRight: 'The pelvis shifts right in the backswing',
    swayLeft: 'The pelvis shifts left in the downswing',
    swayNone: 'No clear sway detected',
    swayRightTip: 'Keep the pelvis centered in the backswing.',
    swayLeftTip: 'Do not let the pelvis slide past the outside of the lead foot.'
  }
};

const $ = id => document.getElementById(id);
const english = () => document.documentElement.lang === 'en';
const text = () => copy[english() ? 'en' : 'zh'];
const phaseName = id => PHASE_NAME[english() ? 'en' : 'zh'][id] || id;

let samples = [];
let guides = null;
let faceOn = false;
let comparable = false;
let report = null;
let standardTemplate = null;
let landmarker = null;
let modelFileset = null;
let modelOptions = null;
let useGpu = true;
let opening = null;
let stamp = 0;
let token = 0;
let loopOn = false;
let lastPoints = null;
let reportAt = 0;

function setStatus(message) {
  const node = $('golfPoseStatus');
  if (node) node.textContent = message || '';
}

function emptyDiag() {
  return {
    loaded: false,
    duration: null,
    width: 0,
    height: 0,
    attempted: 0,
    decoded: 0,
    received: 0,
    posed: 0,
    poseTimes: [],
    firstPose: null,
    lastPose: null,
    stopped: ''
  };
}

function showDiag(diag) {
  const box = $('golfSwingSpan');
  const note = $('golfSwingSpanText');
  if (box) box.hidden = false;
  if (!note || !diag) return;
  const yes = diag.loaded ? '是' : '否';
  const duration = Number.isFinite(diag.duration) ? `${diag.duration.toFixed(2)}s` : '无';
  const poseTime = value => Number.isFinite(value) ? `${value.toFixed(2)}s` : '无';
  let step = 'A 视频没有加载';
  if (diag.loaded && !diag.decoded) step = 'B 没有成功解码帧';
  else if (diag.decoded && !diag.received) step = 'C MediaPipe没有收到帧';
  else if (diag.received && !diag.posed) step = 'D MediaPipe收到帧但没有识别到人体';
  else if (diag.posed) step = 'E 已经有Pose数据，但4点挥杆规则没有找到完整挥杆';
  note.textContent = [
    '诊断 span-7',
    `1. 上传视频是否成功加载：${yes}`,
    `2. 视频 duration：${duration}`,
    `3. videoWidth × videoHeight：${diag.width} × ${diag.height}`,
    `4. 实际尝试采样的总帧数：${diag.attempted}`,
    `5. 成功解码得到图像的帧数：${diag.decoded}`,
    `6. MediaPipe 实际收到的帧数：${diag.received}`,
    `7. MediaPipe 成功返回 Pose landmarks 的帧数：${diag.posed}`,
    `8. 第一帧成功 Pose 的时间：${poseTime(diag.firstPose)}`,
    `9. 最后一帧成功 Pose 的时间：${poseTime(diag.lastPose)}`,
    `10. 失败步骤：${step}`,
    diag.stopped ? `停止原因：${diag.stopped}` : ''
  ].filter(Boolean).join('\n');
}

function pictureBox(video) {
  const width = video.clientWidth;
  const height = video.clientHeight;
  const scale = Math.min(width / (video.videoWidth || width || 1), height / (video.videoHeight || height || 1));
  const boxWidth = (video.videoWidth || width) * scale;
  const boxHeight = (video.videoHeight || height) * scale;
  return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2, w: boxWidth, h: boxHeight };
}

function seen(points, index) {
  return points?.[index] && points[index][2] >= SEEN;
}

function draw(video, points) {
  const canvas = $('golfPoseCanvas');
  if (!canvas || canvas.hidden || !video) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(video.clientWidth * dpr));
  const height = Math.max(1, Math.round(video.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const box = pictureBox(video);
  const xOf = value => (box.x + value * box.w) * dpr;
  const yOf = value => (box.y + value * box.h) * dpr;
  if (faceOn && guides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 226, 120, .92)';
    ctx.lineWidth = 1.25 * dpr;
    ctx.shadowColor = 'rgba(0, 0, 0, .55)';
    ctx.shadowBlur = 1.5 * dpr;
    [guides.left, guides.right].forEach(imageX => {
      const x = xOf(imageX);
      ctx.beginPath();
      ctx.moveTo(x, box.y * dpr);
      ctx.lineTo(x, (box.y + box.h) * dpr);
      ctx.stroke();
    });
    ctx.restore();
  }
  if (!points) return;
  const joint = index => [xOf(points[index][0]), yOf(points[index][1])];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, .95)';
  ctx.lineWidth = 1.15 * dpr;
  ctx.shadowColor = 'rgba(0, 0, 0, .7)';
  ctx.shadowBlur = 1.5 * dpr;
  LINKS.forEach(([a, b]) => {
    if (!seen(points, a) || !seen(points, b)) return;
    const [ax, ay] = joint(a);
    const [bx, by] = joint(b);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  });
  const mark = (x, y, radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1 * dpr;
    ctx.strokeStyle = 'rgba(0, 0, 0, .75)';
    ctx.stroke();
  };
  [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(index => {
    if (!seen(points, index)) return;
    const [x, y] = joint(index);
    mark(x, y, 2.2);
  });
  if (seen(points, 7) && seen(points, 8)) mark(xOf((points[7][0] + points[8][0]) / 2), yOf((points[7][1] + points[8][1]) / 2), 2);
  else if (seen(points, 0)) mark(...joint(0), 2);
}

function renderReport() {
  const list = $('golfFindingsList');
  const note = $('golfFindingsNote');
  if (!list || !note || !report) return;
  const labels = text();
  note.removeAttribute('data-zone-zh');
  note.removeAttribute('data-zone-en');
  if (!report.compared) {
    list.hidden = true;
    list.replaceChildren();
    note.hidden = false;
    note.textContent = report.other ? labels.using(clubName()) : labels.unaligned;
    return;
  }
  const rows = report.lines.map(item => (item.sway ? (english() ? item.en : item.zh) : labels.line(english() ? item.en : item.zh, item.text, english() ? item.unitEn : item.unit)));
  list.replaceChildren(...rows.map(line => {
    const row = document.createElement('p');
    row.textContent = line;
    return row;
  }));
  list.hidden = false;
  const tips = report.tips.map(item => (item.sway ? (english() ? item.en : item.zh) : labels.tip(english() ? item.en : item.zh, item.text, english() ? item.unitEn : item.unit)));
  note.hidden = false;
  note.textContent = [labels.using(clubName()), ...rows, ...tips].join(english() ? ' ' : '');
}

function pack(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 29) return null;
  return landmarks.map(point => [
    Math.round((Number(point?.x) || 0) * 10000) / 10000,
    Math.round((Number(point?.y) || 0) * 10000) / 10000,
    Math.round((Number(point?.visibility) || 0) * 1000) / 1000
  ]);
}

function wristHeight(sample, space) {
  const points = sample?.points;
  const visibility = sample?.visibility;
  const usable = index => {
    const point = points?.[index];
    if (!point) return false;
    const score = visibility ? visibility[index] : point[2];
    return score == null || score >= SEEN;
  };
  if (!usable(15) || !usable(16)) return null;
  const y = (points[15][1] + points[16][1]) / 2;
  return space === 'body' ? y : -y;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function assignPhases(list, space = 'image') {
  const hands = list.map(sample => ({ t: sample.t, h: wristHeight(sample, space) })).filter(item => item.h != null);
  const duration = hands[hands.length - 1]?.t || 0;
  if (hands.length < 4 || duration <= 0) return;
  const low = Math.min(...hands.map(item => item.h));
  const high = Math.max(...hands.map(item => item.h));
  const span = high - low || 1;
  const unit = value => (value - low) / span;
  const earlyCut = Math.min(0.45, Math.max(duration * 0.12, hands[1].t));
  const early = hands.filter(item => item.t <= earlyCut);
  const addressH = median((early.length ? early : hands.slice(0, 3)).map(item => item.h));
  let addressEnd = hands[0].t;
  for (const item of hands) {
    if (item.t < Math.min(0.2, duration * 0.05)) continue;
    if (unit(item.h) - unit(addressH) > 0.12) {
      addressEnd = item.t;
      break;
    }
  }
  const band = high - span * 0.22;
  const runs = [];
  let run = null;
  hands.forEach(item => {
    if (item.t < addressEnd) return;
    if (item.h >= band) {
      if (!run) run = { start: item.t, end: item.t, peak: item };
      else {
        run.end = item.t;
        if (item.h > run.peak.h) run.peak = item;
      }
    } else if (run) {
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);
  const plateau = runs.find(item => item.end - item.start >= 0.28) || runs.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const topStart = plateau ? plateau.start : addressEnd;
  let topEnd = plateau ? plateau.end : addressEnd;
  const afterTop = hands.filter(item => item.t > topEnd + 1e-9);
  let impact = null;
  for (const item of afterTop) {
    if (item.h >= band) break;
    if (!impact || item.h < impact.h) impact = item;
  }
  if (!impact || !plateau || plateau.peak.h - impact.h < span * 0.35) impact = null;
  let impactStart = impact ? impact.t : duration;
  let impactEnd = impact ? impact.t : duration;
  if (impact) {
    const travel = plateau.peak.h - impact.h || span;
    const nearImpact = value => value - impact.h <= travel * 0.22;
    const valley = hands.filter(item => item.t >= topEnd - 1e-9);
    const at = Math.max(0, valley.findIndex(item => item.t === impact.t));
    for (let index = at; index >= 0; index -= 1) {
      if (!nearImpact(valley[index].h)) break;
      impactStart = valley[index].t;
    }
    for (let index = at; index < valley.length; index += 1) {
      if (!nearImpact(valley[index].h)) break;
      impactEnd = valley[index].t;
    }
    if (impactStart < topEnd) impactStart = topEnd;
    if (impactEnd < impactStart) impactEnd = impactStart;
  }
  const bounds = {
    address: [0, addressEnd],
    backswing: [addressEnd, Math.max(addressEnd, topStart)],
    top: [topStart, Math.max(topStart, topEnd)],
    downswing: [Math.max(topStart, topEnd), Math.max(topEnd, impactStart)],
    impact: [impactStart, Math.max(impactStart, impactEnd)],
    'follow-through': [impactEnd, Math.max(impactEnd, duration)]
  };
  list.forEach(sample => {
    if (wristHeight(sample, space) == null) {
      delete sample.phase;
      delete sample.phasePercent;
      return;
    }
    let phase = impact ? 'follow-through' : 'top';
    if (sample.t <= bounds.address[1]) phase = 'address';
    else if (sample.t < bounds.backswing[1]) phase = 'backswing';
    else if (sample.t <= bounds.top[1]) phase = 'top';
    else if (impact && sample.t < bounds.downswing[1]) phase = 'downswing';
    else if (impact && sample.t <= bounds.impact[1]) phase = 'impact';
    else if (!impact) phase = 'top';
    sample.phase = phase;
    const [start, end] = bounds[phase];
    sample.phasePercent = end > start ? Math.min(100, Math.max(0, (sample.t - start) / (end - start) * 100)) : 50;
  });
  return { bounds, duration, hasImpact: Boolean(impact) };
}

function stanceGuides(list) {
  let minX = 1;
  let maxX = 0;
  let count = 0;
  list.filter(sample => sample.phase === 'address' && sample.points).forEach(sample => {
    STANCE.forEach(index => {
      if (!seen(sample.points, index)) return;
      minX = Math.min(minX, sample.points[index][0]);
      maxX = Math.max(maxX, sample.points[index][0]);
      count += 1;
    });
  });
  if (count < 4 || maxX - minX < 0.02) return null;
  const pad = Math.max(0.012, (maxX - minX) * 0.06);
  return { left: minX - pad, right: maxX + pad };
}

function addressFrame(list) {
  const rows = list.filter(sample => sample.phase === 'address' && seen(sample.points, 11) && seen(sample.points, 12) && seen(sample.points, 23) && seen(sample.points, 24));
  const pool = rows.length ? rows : list.filter(sample => seen(sample.points, 11) && seen(sample.points, 12) && seen(sample.points, 23) && seen(sample.points, 24)).slice(0, 4);
  if (!pool.length) return null;
  const measured = pool.map(sample => {
    const shoulder = [(sample.points[11][0] + sample.points[12][0]) / 2, (sample.points[11][1] + sample.points[12][1]) / 2];
    const hip = [(sample.points[23][0] + sample.points[24][0]) / 2, (sample.points[23][1] + sample.points[24][1]) / 2];
    const width = Math.hypot(sample.points[11][0] - sample.points[12][0], sample.points[11][1] - sample.points[12][1]);
    return { hip, torso: Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1]), width, t: sample.t };
  }).filter(item => item.torso > 0.02 && item.width > 0.02);
  if (!measured.length) return null;
  const early = measured.filter(item => item.t <= measured[0].t + 0.2);
  const base = early.length ? early : measured.slice(0, 3);
  const widthRef = median(base.map(item => item.width));
  const stable = measured.filter(item => item.width >= widthRef * 0.85);
  const used = stable.length >= 2 ? stable : base;
  const origin = [median(used.map(item => item.hip[0])), median(used.map(item => item.hip[1]))];
  const torso = median(used.map(item => item.torso));
  if (!torso || torso < 0.02) return null;
  return { origin, torso };
}

function bodyPoint(points, index, frame) {
  if (!seen(points, index)) return null;
  return [
    (points[index][0] - frame.origin[0]) / frame.torso,
    (frame.origin[1] - points[index][1]) / frame.torso
  ];
}

function jointAngle(a, b, c) {
  if (!a || !b || !c) return null;
  const left = [a[0] - b[0], a[1] - b[1]];
  const right = [c[0] - b[0], c[1] - b[1]];
  const leftLength = Math.hypot(left[0], left[1]);
  const rightLength = Math.hypot(right[0], right[1]);
  if (!leftLength || !rightLength) return null;
  const cos = Math.max(-1, Math.min(1, (left[0] * right[0] + left[1] * right[1]) / (leftLength * rightLength)));
  return Math.acos(cos) * 180 / Math.PI;
}

function midpoint(a, b) {
  if (!a || !b) return null;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

const SEGMENT_SAMPLES = 100;

function playerList(list) {
  const hand = typeof window === 'undefined' ? null : window.__golfSession?.record?.hand;
  if (hand !== 'left' || !list) return list;
  return list.map(sample => ({
    t: sample.t,
    points: sample.points ? sample.points.map(point => (point ? [1 - point[0], point[1], point[2]] : point)) : null,
    visibility: sample.visibility
  }));
}

function headCenter(points, frame) {
  const ears = [bodyPoint(points, 7, frame), bodyPoint(points, 8, frame)];
  if (ears[0] && ears[1]) return midpoint(ears[0], ears[1]);
  const eyes = [bodyPoint(points, 2, frame), bodyPoint(points, 5, frame)];
  if (eyes[0] && eyes[1]) return midpoint(eyes[0], eyes[1]);
  return ears[0] || ears[1] || eyes[0] || eyes[1] || null;
}

function frameSignal(points, frame) {
  const hipL = bodyPoint(points, 23, frame);
  const hipR = bodyPoint(points, 24, frame);
  const shoulderL = bodyPoint(points, 11, frame);
  const shoulderR = bodyPoint(points, 12, frame);
  const hip = midpoint(hipL, hipR);
  const shoulder = midpoint(shoulderL, shoulderR);
  const torso = midpoint(shoulder, hip);
  const head = headCenter(points, frame);
  return {
    pelvisX: hip ? hip[0] : null,
    torsoX: torso ? torso[0] : null,
    headX: head ? head[0] : null,
    pelvisY: hip ? hip[1] : null,
    leadKnee: jointAngle(hipL, bodyPoint(points, 25, frame), bodyPoint(points, 27, frame)),
    trailKnee: jointAngle(hipR, bodyPoint(points, 26, frame), bodyPoint(points, 28, frame)),
    hip,
    w15: bodyPoint(points, 15, frame),
    w16: bodyPoint(points, 16, frame),
    v15: points?.[15]?.[2] ?? 0,
    v16: points?.[16]?.[2] ?? 0
  };
}

function wristJump(prev, next) {
  if (!prev || !next) return null;
  return [next[0] - prev[0], next[1] - prev[1]];
}

function jumpLength(step) {
  return step ? Math.hypot(step[0], step[1]) : null;
}

function repairWrist(track, times, bad) {
  const out = track.map(point => (point ? point.slice() : null));
  bad.forEach((isBad, index) => {
    if (!isBad) return;
    let prev = index - 1;
    while (prev >= 0 && (bad[prev] || !out[prev])) prev -= 1;
    let next = index + 1;
    while (next < out.length && (bad[next] || !out[next])) next += 1;
    const gap = prev >= 0 && next < out.length ? times[next] - times[prev] : Infinity;
    if (prev < 0 || next >= out.length || gap > 0.2 || next - prev > 2) {
      out[index] = null;
      return;
    }
    const mix = (times[index] - times[prev]) / gap;
    out[index] = [
      out[prev][0] + (out[next][0] - out[prev][0]) * mix,
      out[prev][1] + (out[next][1] - out[prev][1]) * mix
    ];
  });
  return out;
}

function handCenters(rows) {
  const times = rows.map(row => row.t);
  const left = rows.map(row => row.w15);
  const right = rows.map(row => row.w16);
  const badLeft = rows.map(() => false);
  const badRight = rows.map(() => false);
  for (let index = 1; index < rows.length - 1; index += 1) {
    const stepLeft = wristJump(left[index - 1], left[index]);
    const stepRight = wristJump(right[index - 1], right[index]);
    const leftLength = jumpLength(stepLeft);
    const rightLength = jumpLength(stepRight);
    if (leftLength == null || rightLength == null) continue;
    const max = Math.max(leftLength, rightLength);
    const min = Math.min(leftLength, rightLength);
    const dot = stepLeft[0] * stepRight[0] + stepLeft[1] * stepRight[1];
    const cosine = dot / ((leftLength * rightLength) || 1);
    if (max < 0.35 || (cosine >= 0.2 && max < min * 2.2 + 0.15)) continue;
    const backLeft = wristJump(left[index], left[index + 1]);
    const backRight = wristJump(right[index], right[index + 1]);
    const leftSpike = jumpLength(backLeft) != null && leftLength > 0.35 && jumpLength(backLeft) > 0.35 && (stepLeft[0] * backLeft[0] + stepLeft[1] * backLeft[1]) < 0;
    const rightSpike = jumpLength(backRight) != null && rightLength > 0.35 && jumpLength(backRight) > 0.35 && (stepRight[0] * backRight[0] + stepRight[1] * backRight[1]) < 0;
    if (leftSpike === rightSpike) continue;
    if (leftSpike) badLeft[index] = true;
    if (rightSpike) badRight[index] = true;
  }
  const fixedLeft = repairWrist(left, times, badLeft);
  const fixedRight = repairWrist(right, times, badRight);
  let lastLeft = null;
  let lastRight = null;
  let lastCenter = null;
  return fixedLeft.map((leftPoint, index) => {
    const rightPoint = fixedRight[index];
    if (!leftPoint || !rightPoint) return null;
    let useLeft = leftPoint;
    let useRight = rightPoint;
    const apart = Math.hypot(leftPoint[0] - rightPoint[0], leftPoint[1] - rightPoint[1]);
    if (lastCenter && apart > 0.55) {
      const fromCenter = point => Math.hypot(point[0] - lastCenter[0], point[1] - lastCenter[1]);
      const leftFar = fromCenter(leftPoint) > fromCenter(rightPoint) + 0.2;
      const rightFar = fromCenter(rightPoint) > fromCenter(leftPoint) + 0.2;
      if (leftFar && lastLeft && lastRight) {
        useLeft = [lastLeft[0] + rightPoint[0] - lastRight[0], lastLeft[1] + rightPoint[1] - lastRight[1]];
      } else if (rightFar && lastLeft && lastRight) {
        useRight = [lastRight[0] + leftPoint[0] - lastLeft[0], lastRight[1] + leftPoint[1] - lastLeft[1]];
      } else if (leftFar && rows[index].v15 < rows[index].v16) {
        useLeft = rightPoint;
      } else if (rightFar && rows[index].v16 < rows[index].v15) {
        useRight = leftPoint;
      }
    }
    const center = midpoint(useLeft, useRight);
    lastLeft = useLeft;
    lastRight = useRight;
    lastCenter = center;
    return center;
  });
}

function signalSeries(list, frame) {
  const rows = list.filter(sample => sample.points).map(sample => ({ t: sample.t, phase: sample.phase, ...frameSignal(sample.points, frame) }));
  const centers = handCenters(rows);
  rows.forEach((row, index) => {
    const center = centers[index];
    row.hand = center && row.hip ? [center[0] - row.hip[0], center[1] - row.hip[1]] : null;
  });
  const address = rows.filter(row => row.phase === 'address');
  const base = address.length ? address : rows.slice(0, 3);
  const baseOf = key => median(base.map(row => row[key]).filter(Number.isFinite)) || 0;
  const hands = base.map(row => row.hand).filter(Boolean);
  const handBase = hands.length
    ? [hands.reduce((sum, point) => sum + point[0], 0) / hands.length, hands.reduce((sum, point) => sum + point[1], 0) / hands.length]
    : [0, 0];
  const pelvisX = baseOf('pelvisX');
  const torsoX = baseOf('torsoX');
  const headX = baseOf('headX');
  const pelvisY = baseOf('pelvisY');
  return rows.map(row => ({
    t: row.t,
    pelvis_sway: row.pelvisX == null ? null : row.pelvisX - pelvisX,
    torso_sway: row.torsoX == null ? null : row.torsoX - torsoX,
    head_sway: row.headX == null ? null : row.headX - headX,
    pelvis_lift: row.pelvisY == null ? null : row.pelvisY - pelvisY,
    lead_knee_flexion: row.leadKnee,
    trail_knee_flexion: row.trailKnee,
    hand_path: row.hand ? [row.hand[0] - handBase[0], row.hand[1] - handBase[1]] : null
  }));
}

function markerTimes(list) {
  const times = name => list.filter(sample => sample.phase === name).map(sample => sample.t);
  const address = times('address');
  const top = times('top');
  const impact = times('impact');
  const follow = times('follow-through');
  if (!address.length || !top.length) return null;
  return {
    address: address[address.length - 1],
    top: top[0],
    topEnd: top[top.length - 1],
    impact: impact.length ? impact[Math.floor((impact.length - 1) / 2)] : null,
    finish: follow.length ? follow[follow.length - 1] : null
  };
}

function valueAt(series, time, key) {
  if (!series.length) return null;
  let prev = series[0];
  let next = series[series.length - 1];
  for (let index = 0; index < series.length; index += 1) {
    if (series[index].t >= time) {
      next = series[index];
      prev = series[index - 1] || next;
      break;
    }
  }
  const span = next.t - prev.t;
  const mix = span > 0 ? (time - prev.t) / span : 0;
  const left = prev[key];
  const right = next[key];
  if (left == null || right == null) return left == null ? right : left;
  if (Array.isArray(left) && Array.isArray(right)) return [left[0] + (right[0] - left[0]) * mix, left[1] + (right[1] - left[1]) * mix];
  if (Array.isArray(left) || Array.isArray(right)) return null;
  return left + (right - left) * mix;
}

function roundSignal(value, key) {
  if (value == null) return null;
  const scale = key.includes('knee') ? 100 : 10000;
  if (Array.isArray(value)) return value.map(item => Math.round(item * scale) / scale);
  return Math.round(value * scale) / scale;
}

function resampleSegment(series, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const out = {};
  FRONT_METRICS.forEach(([key]) => { out[key] = []; });
  for (let index = 0; index < SEGMENT_SAMPLES; index += 1) {
    const time = start + (end - start) * (index / (SEGMENT_SAMPLES - 1));
    FRONT_METRICS.forEach(([key]) => out[key].push(roundSignal(valueAt(series, time, key), key)));
  }
  return out;
}

function resampleFront(series, markers) {
  const front = {};
  const addressTop = resampleSegment(series, markers.address, markers.top);
  if (addressTop) front['address-top'] = addressTop;
  if (markers.topEnd > markers.top) {
    const top = resampleSegment(series, markers.top, markers.topEnd);
    if (top) front.top = top;
  }
  if (markers.impact == null) return front;
  const topImpact = resampleSegment(series, markers.topEnd, markers.impact);
  if (topImpact) front['top-impact'] = topImpact;
  if (markers.finish != null && markers.finish > markers.impact) {
    const impactFinish = resampleSegment(series, markers.impact, markers.finish);
    if (impactFinish) front['impact-finish'] = impactFinish;
  }
  return front;
}

function buildMotionModel(list) {
  const copy = list.map(sample => ({ t: sample.t, points: sample.points, visibility: sample.visibility }));
  assignPhases(copy, 'image');
  const frame = addressFrame(copy);
  const markers = markerTimes(copy);
  if (!frame || !markers) return null;
  const front = resampleFront(signalSeries(copy, frame), markers);
  if (!front['address-top']) return null;
  return {
    version: 'golf-motion-v1',
    sourceVideo: 'golf/standard/driver-face-v1.mp4',
    capturedView: 'face-on',
    clubProfile: { iron: 'base', driver: 'base' },
    handedness: 'right',
    normalization: { origin: 'address_hip_center', scale: 'address_torso_length' },
    samplesPerSegment: SEGMENT_SAMPLES,
    phases: {
      address: markers.address,
      top: markers.top,
      topEnd: markers.topEnd,
      impact: markers.impact,
      finish: markers.finish
    },
    front,
    side: null,
    tolerance: null
  };
}

function pairGap(user, model) {
  if (user == null || model == null) return null;
  if (Array.isArray(user) && Array.isArray(model)) return Math.hypot(user[0] - model[0], user[1] - model[1]);
  if (typeof user === 'number' && typeof model === 'number') return Math.abs(user - model);
  return null;
}

function typicalGap(values, minimum) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length < minimum) return null;
  const mid = nums.length >> 1;
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function faceSway(list) {
  const address = list.filter(sample => sample.phase === 'address' && seen(sample.points, 23) && seen(sample.points, 24));
  if (address.length < 2) return null;
  const hipX = sample => (sample.points[23][0] + sample.points[24][0]) / 2;
  const xs = address.map(hipX);
  const center = median(xs);
  const leftX = median(address.map(sample => sample.points[23][0]));
  const rightX = median(address.map(sample => sample.points[24][0]));
  const rightWay = Math.sign(rightX - leftX);
  const wobble = Math.max(...xs) - Math.min(...xs);
  const gate = Math.max(wobble, 0.012);
  const backswing = list.filter(sample => (sample.phase === 'backswing' || sample.phase === 'top') && seen(sample.points, 23) && seen(sample.points, 24));
  const rightSway = Boolean(rightWay && backswing.length >= 2 && median(backswing.map(sample => (hipX(sample) - center) * rightWay)) > gate);
  const down = list.filter(sample => (sample.phase === 'downswing' || sample.phase === 'impact') && seen(sample.points, 23));
  const stance = stanceGuides(list);
  let leftSway = false;
  if (stance && down.length && Math.abs(leftX - center) > 0.01) {
    const line = leftX > center ? stance.right : stance.left;
    const outward = leftX > center ? 1 : -1;
    const past = down.filter(sample => (sample.points[23][0] - line) * outward > 0).length;
    leftSway = past >= Math.min(2, down.length);
  }
  const lines = [
    { sway: true, zh: rightSway ? copy.zh.swayRight : `上杆：${copy.zh.swayNone}`, en: rightSway ? copy.en.swayRight : `Backswing: ${copy.en.swayNone}` },
    { sway: true, zh: leftSway ? copy.zh.swayLeft : `下杆：${copy.zh.swayNone}`, en: leftSway ? copy.en.swayLeft : `Downswing: ${copy.en.swayNone}` }
  ];
  const tips = [];
  if (rightSway) tips.push({ sway: true, zh: copy.zh.swayRightTip, en: copy.en.swayRightTip });
  if (leftSway) tips.push({ sway: true, zh: copy.zh.swayLeftTip, en: copy.en.swayLeftTip });
  return { lines, tips, rightSway, leftSway };
}

function compareWithStandard(list, model) {
  if (model?.version !== 'golf-motion-v1' || !model.front) return null;
  const copy = playerList(list).map(sample => ({ t: sample.t, points: sample.points, visibility: sample.visibility }));
  assignPhases(copy, 'image');
  const frame = addressFrame(copy);
  const markers = markerTimes(copy);
  if (!frame || !markers) return null;
  const front = resampleFront(signalSeries(copy, frame), markers);
  const gaps = {};
  const events = {};
  FRONT_METRICS.forEach(([key]) => { gaps[key] = []; events[key] = []; });
  const segments = ['address-top', 'top', 'top-impact', 'impact-finish'].filter(name => front[name] && model.front[name]);
  segments.forEach(segment => {
    const user = front[segment];
    const reference = model.front[segment];
    if (!user || !reference) return;
    FRONT_METRICS.forEach(([key]) => {
      const count = Math.min(user[key].length, reference[key].length);
      for (let index = 0; index < count; index += 1) {
        const gap = pairGap(user[key][index], reference[key][index]);
        if (gap == null) continue;
        gaps[key].push(gap);
        if (index === 0 || index === count - 1) events[key].push(gap);
      }
    });
  });
  const lines = FRONT_METRICS.filter(([key]) => key !== 'pelvis_sway').map(([key, zh, en, unit, unitEn]) => {
    const error = typicalGap(gaps[key], 8);
    if (error == null) return null;
    const text = error.toFixed(unit === '°' ? 1 : 2);
    return { key, zh, en, unit, unitEn, error, text, keyEvent: typicalGap(events[key], 1) };
  }).filter(Boolean);
  const sway = faceSway(copy);
  const tips = lines.filter(item => item.unit !== '°').sort((a, b) => b.error - a.error).slice(0, 2);
  return { lines: [...(sway?.lines || []), ...lines], tips: [...(sway?.tips || []), ...tips], segments: Object.keys(front) };
}

function showReport(result, canCompare) {
  report = result?.lines?.length
    ? { compared: true, lines: result.lines, tips: result.tips, other: false }
    : { compared: false, lines: [], tips: [], other: !canCompare };
  renderReport();
}

function clubName() {
  const club = window.__golfSession?.record?.club;
  if (english()) return club === 'iron' ? 'Driver' : 'Iron';
  return club === 'iron' ? '1号木' : '铁杆';
}

function readSession() {
  const record = window.__golfSession?.record;
  faceOn = record?.angle === 'face-on';
  comparable = record?.club === 'driver' && faceOn;
}

async function prepare() {
  markCrashStage('D2');
  if (opening) return opening;
  const pending = (async () => {
    setStatus(text().loading);
    const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe/wasm');
    markCrashStage('D3');
    const options = delegate => ({
      baseOptions: { modelAssetPath: '/vendor/mediapipe/pose_landmarker_full.task', delegate },
      runningMode: 'VIDEO',
      numPoses: 1
    });
    modelFileset = fileset;
    modelOptions = options;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options(ios ? 'CPU' : 'GPU'));
      useGpu = !ios;
    } catch {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
      useGpu = false;
    }
    markCrashStage('D4');
    await loadStandard();
    markCrashStage('D5');
    setStatus('');
  })();
  opening = pending.catch(error => {
    opening = null;
    throw error;
  });
  return opening;
}

function clearCanvas() {
  const canvas = $('golfPoseCanvas');
  const ctx = canvas?.getContext('2d');
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function resetTracking() {
  token += 1;
  loopOn = false;
  samples = [];
  guides = null;
  lastPoints = null;
  clearCanvas();
}

function lockGuides() {
  if (!faceOn || guides || samples.length < 3) return;
  assignPhases(samples);
  const next = stanceGuides(samples);
  const last = samples[samples.length - 1];
  if (next && last.t > 0.35 && last.phase !== 'address') guides = next;
}

function loadStandard() {
  if (standardTemplate?.version === 'golf-motion-v1') return Promise.resolve(standardTemplate);
  if (!loadStandard.pending) {
    loadStandard.pending = fetch('/golf/standard/standard-golf-motion-v1.json').then(async response => {
      if (!response.ok) throw new Error('standard');
      const data = await response.json();
      if (data?.version !== 'golf-motion-v1' || !data.front) throw new Error('standard');
      standardTemplate = data;
      loadStandard.pending = null;
      return standardTemplate;
    }).catch(error => {
      loadStandard.pending = null;
      throw error;
    });
  }
  return loadStandard.pending;
}

function publishReport(finished) {
  readSession();
  const run = async () => {
    await loadStandard();
    readSession();
    const count = samples.filter(sample => sample.points).length;
    if (count < 3 || standardTemplate?.version !== 'golf-motion-v1') return;
    if (!comparable) {
      showReport(null, false);
      return;
    }
    assignPhases(samples);
    const compared = compareWithStandard(samples, standardTemplate);
    if (compared?.lines?.length) showReport(compared, true);
    else if (finished) showReport(null, true);
  };
  run().catch(() => { if (finished && !report?.compared) showReport(null, comparable); });
}

function remember(points, time) {
  if (!points) return;
  if (samples.length && time + 0.05 < samples[samples.length - 1].t) {
    samples = [];
    guides = null;
  }
  const previous = samples[samples.length - 1];
  if (previous && Math.abs(previous.t - time) < 0.03) previous.points = points;
  else samples.push({ t: time, points });
  if (samples.length > 900) samples.splice(0, samples.length - 900);
  lockGuides();
  const count = samples.filter(sample => sample.points).length;
  const now = performance.now();
  if (count >= 3 && (count === 3 || now - reportAt > 800)) {
    reportAt = now;
    publishReport(false);
  }
}

let scanning = null;
let painting = false;
let reading = false;
let primed = false;
let readerUrl = '';

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

function readerVideo() {
  let node = $('golfPoseReader');
  if (node) return node;
  node = document.createElement('video');
  node.id = 'golfPoseReader';
  node.muted = true;
  node.defaultMuted = true;
  node.playsInline = true;
  node.setAttribute('playsinline', '');
  node.setAttribute('webkit-playsinline', '');
  node.preload = 'auto';
  node.setAttribute('aria-hidden', 'true');
  document.body.appendChild(node);
  return node;
}

function seek(video, time) {
  const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.04));
  if (Math.abs((video.currentTime || 0) - target) < 0.001 && video.readyState >= 2) return Promise.resolve();
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

function waitFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function frameDecoded(video) {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
}

async function openReader(video, blob) {
  markCrashStage('D8');
  const url = URL.createObjectURL(blob);
  const previous = readerUrl;
  readerUrl = url;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('load')); }, 20000);
    const ok = () => {
      markCrashStage('D9', { readyState: video.readyState, videoWidth: video.videoWidth, videoHeight: video.videoHeight, duration: video.duration });
      cleanup(); resolve();
    };
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
  if (previous) URL.revokeObjectURL(previous);
}

async function readVideo(path) {
  markCrashStage('D6');
  const response = await fetch(`/api/member/oss-media?provider=oss&path=${encodeURIComponent(path)}&download=1`);
  if (!response.ok) throw new Error('download');
  return response.blob();
}

async function detectFrame(video) {
  stamp = Math.max(performance.now(), stamp + 1);
  try {
    return landmarker.detectForVideo(video, stamp);
  } catch (error) {
    if (!useGpu) throw error;
    useGpu = false;
    try { landmarker.close(); } catch {}
    landmarker = await PoseLandmarker.createFromOptions(modelFileset, modelOptions('CPU'));
    stamp = Math.max(performance.now(), stamp + 1);
    return landmarker.detectForVideo(video, stamp);
  }
}

function paint() {
  const video = $('golfResultVideo');
  if (!video) return;
  const sample = nearest(video.currentTime || 0);
  const points = sample?.points || null;
  if (!points && !guides) return;
  const canvas = $('golfPoseCanvas');
  if (canvas) canvas.hidden = false;
  lastPoints = points;
  draw(video, points);
}

function watchPlayback() {
  if (painting) return;
  painting = true;
  const loop = () => {
    paint();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

async function ensureSamples() {
  if (scanning) return scanning;
  const path = window.__golfSession?.media?.path || '';
  if (!path) return;
  markCrashStage('D1');
  const id = ++token;
  const diag = emptyDiag();
  showDiag(diag);
  scanning = (async () => {
    readSession();
    await prepare();
    if (id !== token) return;
    if (!landmarker) {
      diag.stopped = 'MediaPipe 没有准备好';
      showDiag(diag);
      return;
    }
    const video = readerVideo();
    if (video.readyState < 2 || !readerUrl) {
      const blob = await readVideo(path);
      markCrashStage('D7', { size: blob.size, type: blob.type });
      if (id !== token) return;
      await openReader(video, blob);
    }
    if (id !== token) return;
    diag.loaded = !!(video.videoWidth && Number.isFinite(video.duration) && video.duration > 0);
    diag.duration = Number.isFinite(video.duration) ? video.duration : null;
    diag.width = video.videoWidth || 0;
    diag.height = video.videoHeight || 0;
    showDiag(diag);
    video.muted = true;
    if (!primed) {
      let playError = '';
      const started = await video.play().then(() => true).catch(error => {
        playError = error?.name || error?.message || 'play failed';
        return false;
      });
      if (started) markCrashStage('D10');
      video.pause();
      if (!started) {
        diag.stopped = playError ? `播放未启动：${playError}` : '播放未启动';
        showDiag(diag);
        scanning = null;
        return;
      }
      primed = true;
    }
    if (!video.videoWidth || !Number.isFinite(video.duration) || video.duration <= 0) throw new Error('load');
    const span = Math.min(video.duration, 20);
    const step = 1 / 12;
    samples = [];
    guides = null;
    reading = true;
    let diagnosticProgress = 25;
    const diagnosticFrameCount = Math.ceil(Math.max(0, span - 0.001) / step);
    for (let time = 0; time < span - 0.001; time += step) {
      if (id !== token) { reading = false; return; }
      diag.attempted += 1;
      await seek(video, time);
      await waitFrame();
      if (id !== token) { reading = false; return; }
      if (frameDecoded(video)) diag.decoded += 1;
      if (diag.attempted === 1) markCrashStage('D11');
      const result = await detectFrame(video);
      if (diag.attempted === 1) markCrashStage('D12');
      if (id !== token) { reading = false; return; }
      diag.received += 1;
      const landmarks = result?.landmarks?.[0];
      if (Array.isArray(landmarks) && landmarks.length) {
        diag.posed += 1;
        diag.poseTimes.push(time);
        if (diag.firstPose == null) diag.firstPose = time;
        diag.lastPose = time;
      }
      remember(pack(landmarks), time);
      while (diagnosticProgress <= 100 && diag.attempted / diagnosticFrameCount * 100 >= diagnosticProgress) {
        markCrashStage('D12', { progress: diagnosticProgress, frames: diag.attempted });
        diagnosticProgress += 25;
      }
    }
    markCrashStage('D13', { frames: diag.attempted });
    reading = false;
    const marks = assignPhases(samples);
    if (id === token) {
      const timingTrack = (left, right) => samples.map(sample => {
        const points = sample.points;
        if (!points || !(points[left]?.[2] >= 0.5) || !(points[right]?.[2] >= 0.5)) return null;
        return { t: sample.t, h: -((points[left][1] + points[right][1]) / 2) };
      }).filter(Boolean);
      showDiag(diag);
      document.dispatchEvent(new CustomEvent('golf-swing-sampled', { detail: marks || null }));
      document.dispatchEvent(new CustomEvent('golf-swing-diagnostic', { detail: diag }));
      document.dispatchEvent(new CustomEvent('golf-swing-track', {
        detail: { wrist: timingTrack(15, 16), elbow: timingTrack(13, 14), end: video.duration }
      }));
    }
    publishReport(true);
    setStatus('');
  })().catch(error => {
    reading = false;
    scanning = null;
    diag.stopped = error?.name || error?.message || '采样中断';
    showDiag(diag);
    throw error;
  });
  return scanning;
}

function restartAnalysis() {
  token += 1;
  scanning = null;
  reading = false;
  report = null;
  reportAt = 0;
  samples = [];
  guides = null;
  const note = $('golfFindingsNote');
  const list = $('golfFindingsList');
  if (list) {
    list.hidden = true;
    list.replaceChildren();
  }
  if (note) {
    note.hidden = false;
    note.textContent = english()
      ? 'Differences from the standard swing appear here after analysis.'
      : '分析后，这里显示与标准挥杆的差异。';
  }
  ensureSamples().catch(() => setStatus(text().failed));
}

function bootPose() {
  readSession();
  watchPlayback();
  ensureSamples().catch(() => setStatus(text().failed));
}

const userVideo = $('golfResultVideo');
if (userVideo && document.body.classList.contains('golf-app')) {
  loadStandard().catch(() => {});
  document.addEventListener('golf-session-ready', bootPose);
  document.addEventListener('golf-playback-play', () => {
    const reader = $('golfPoseReader');
    if (reader && (reader.currentSrc || reader.getAttribute('src')) && !reading) {
      reader.muted = true;
      const pending = reader.play();
      if (pending && typeof pending.then === 'function') pending.then(() => { primed = true; reader.pause(); }).catch(() => {});
    }
    bootPose();
    publishReport(false);
  });
  userVideo.addEventListener('ended', () => publishReport(true));
  document.addEventListener('golf-playback-replay', () => restartAnalysis());
  new ResizeObserver(() => { paint(); }).observe(userVideo);
  window.addEventListener('pagehide', () => {
    token += 1;
    if (readerUrl) URL.revokeObjectURL(readerUrl);
    try { landmarker?.close(); } catch {}
    landmarker = null;
  });
  if (window.__golfSession?.media?.path) bootPose();
}
new MutationObserver(() => { renderReport(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
