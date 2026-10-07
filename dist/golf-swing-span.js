/* Four swing nodes from the wrist-center track already sampled by MediaPipe.
   Swing Start stays on the previous takeaway rule.
   Top, Impact, and Finish follow the wrist-center direction changes. */

const TURN_FRAMES = 3;

// Optional observation only; callers without diagnostics retain the same results.
function diagnosticFailure(diag, reason) {
  if (diag) diag.failure = reason;
  return null;
}

export function smoothWrist(rows) {
  if (rows.length < 3) return rows.map(row => ({ t: row.t, h: row.h }));
  return rows.map((row, index) => {
    const left = rows[Math.max(0, index - 1)].h;
    const right = rows[Math.min(rows.length - 1, index + 1)].h;
    return { t: row.t, h: (left + row.h + right) / 3 };
  });
}

function rising(rows, index) {
  for (let step = 1; step <= TURN_FRAMES; step += 1) {
    if (index + step >= rows.length || rows[index + step].h <= rows[index + step - 1].h) return false;
  }
  return true;
}

export function swingStartOf(rows, diag) {
  if (!Array.isArray(rows) || rows.length < 8) return diagnosticFailure(diag, 'Start：原始有效点不足8个');
  const ordered = rows.filter(row => Number.isFinite(row?.t) && Number.isFinite(row?.h)).slice().sort((a, b) => a.t - b.t);
  if (ordered.length < 8) return diagnosticFailure(diag, 'Start：有限数值有效点不足8个');
  const high = Math.max(...ordered.map(row => row.h));
  const low = Math.min(...ordered.map(row => row.h));
  const span = high - low;
  if (span < 0.15) return diagnosticFailure(diag, 'Start：高度变化不足0.15');
  const band = high - span * 0.22;
  const runs = [];
  let run = null;
  ordered.forEach(row => {
    if (row.h >= band) {
      if (!run) run = { start: row.t, end: row.t, peak: row };
      else {
        run.end = row.t;
        if (row.h > run.peak.h) run.peak = row;
      }
    } else if (run) {
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);
  const merged = [];
  runs.forEach(item => {
    const prev = merged[merged.length - 1];
    if (prev && item.start - prev.end < 0.16) {
      prev.end = item.end;
      if (item.peak.h > prev.peak.h) prev.peak = item.peak;
    } else merged.push({ start: item.start, end: item.end, peak: item.peak });
  });
  const top = merged.find(item => item.end - item.start >= 0.28);
  if (!top) return diagnosticFailure(diag, 'Start：未找到持续至少0.28秒的高位平台（最高22%高度带，间隔小于0.16秒合并）');
  const before = ordered.filter(row => row.t <= top.start);
  if (before.length < 2) return diagnosticFailure(diag, 'Start：平台前有效点不足2个');
  const address = before.reduce((best, row) => row.h < best.h ? row : best);
  const rise = top.peak.h - address.h;
  if (rise < span * 0.45) return diagnosticFailure(diag, 'Start：上升幅度不足整体变化的45%');
  let swingStart = address.t;
  for (let index = before.length - 1; index >= 0; index -= 1) {
    if (before[index].h <= address.h + rise * 0.12) {
      swingStart = before[index].t;
      break;
    }
  }
  return swingStart;
}

function firstPlateau(ordered, diag) {
  if (ordered.length < 8) return diagnosticFailure(diag, 'Top平台：有效点不足8个');
  const high = Math.max(...ordered.map(row => row.h));
  const low = Math.min(...ordered.map(row => row.h));
  const span = high - low;
  if (span < 0.15) return diagnosticFailure(diag, 'Top平台：高度变化不足0.15');
  const band = high - span * 0.22;
  const runs = [];
  let run = null;
  ordered.forEach(row => {
    if (row.h >= band) {
      if (!run) run = { start: row.t, end: row.t, peak: row };
      else {
        run.end = row.t;
        if (row.h > run.peak.h) run.peak = row;
      }
    } else if (run) {
      runs.push(run);
      run = null;
    }
  });
  if (run) runs.push(run);
  const merged = [];
  runs.forEach(item => {
    const prev = merged[merged.length - 1];
    if (prev && item.start - prev.end < 0.16) {
      prev.end = item.end;
      if (item.peak.h > prev.peak.h) prev.peak = item.peak;
    } else merged.push({ start: item.start, end: item.end, peak: item.peak });
  });
  const top = merged.find(item => item.end - item.start >= 0.28);
  return top ? { start: top.start, end: top.end, peak: top.peak, band } : diagnosticFailure(diag, 'Top平台：未找到持续至少0.28秒的高位平台');
}

function descentStart(rows, peak, impact) {
  let index = impact;
  while (index > peak && rows[index - 1].h >= rows[index].h) index -= 1;
  return index;
}

function firstTurnAfter(rows, valley) {
  if (!rising(rows, valley)) return -1;
  let peak = valley;
  for (let index = valley + 1; index < rows.length; index += 1) {
    if (rows[index].h > rows[peak].h) peak = index;
    else if (peak > valley) return peak;
  }
  return -1;
}

function nodesAfter(rows, startTime, diag) {
  const start = rows.findIndex(row => row.t >= startTime - 1e-6);
  if (start < 0 || start >= rows.length - TURN_FRAMES - 1) return diagnosticFailure(diag, 'Start位置无效或后续点数不足');
  const plateau = firstPlateau(rows.slice(start), diag);
  if (!plateau) return null;
  let peak = start;
  for (let index = start; index < rows.length; index += 1) {
    if (rows[index].t < plateau.start - 1e-6 || rows[index].t > plateau.end + 1e-6) continue;
    if (rows[index].h >= rows[peak].h) peak = index;
  }
  if (peak <= start) return diagnosticFailure(diag, 'Top平台峰值不在Start之后');
  if (diag) diag.plateauPeak = rows[peak].t;
  let impact = -1;
  let rose = false;
  for (let index = peak + 1; index < rows.length; index += 1) {
    if (rows[index].t < plateau.end - 1e-6) continue;
    if (impact < 0 || rows[index].h < rows[impact].h) impact = index;
    if (impact > peak && rows[index].t > rows[impact].t && rows[index].h >= plateau.band) {
      rose = true;
      break;
    }
  }
  if (!rose || impact <= peak) return diagnosticFailure(diag, 'Impact未确认：未找到平台后低点及随后回升至平台高度带');
  if (diag) diag.impact = rows[impact].t;
  const finish = firstTurnAfter(rows, impact);
  const top = descentStart(rows, peak, impact);
  if (diag) diag.top = rows[top].t;
  if (finish < 0) {
    if (rows[top].h > rows[start].h && rows[impact].h < rows[top].h && rows[start].t < rows[top].t && rows[top].t < rows[impact].t) {
      return { top: rows[top].t, impact: rows[impact].t, finish: null, release: rows[impact].t };
    }
    return diagnosticFailure(diag, 'Finish未找到：Impact后须连续3次严格上升，随后出现不再上升的点');
  }
  if (diag) diag.finish = rows[finish].t;
  if (!(rows[top].h > rows[start].h && rows[impact].h < rows[top].h && rows[finish].h > rows[impact].h)) return diagnosticFailure(diag, '四节点高度升降关系不满足');
  if (!(rows[start].t < rows[top].t && rows[top].t < rows[impact].t && rows[impact].t < rows[finish].t)) return diagnosticFailure(diag, '时间顺序不满足 Start < Top < Impact < Finish');
  let release = rows[finish].t;
  for (let index = finish + 1; index < rows.length; index += 1) {
    if (rows[index].h < plateau.band) break;
    release = rows[index].t;
  }
  return { top: rows[top].t, impact: rows[impact].t, finish: rows[finish].t, release };
}

export function findCompleteSwings(rows, diagnostics) {
  const ordered = Array.isArray(rows) ? rows.filter(row => Number.isFinite(row?.t) && Number.isFinite(row?.h)).slice().sort((a, b) => a.t - b.t) : [];
  if (ordered.length < 8) {
    diagnostics?.push({ failure: '有效点不足8个' });
    return [];
  }
  const smoothed = smoothWrist(ordered);
  const swings = [];
  let cursor = ordered[0].t;
  while (swings.length < 12) {
    const remain = ordered.filter(row => row.t >= cursor - 1e-6);
    const diag = diagnostics ? {} : undefined;
    if (diag) diagnostics.push(diag);
    const start = swingStartOf(remain, diag);
    if (diag && start != null) diag.start = start;
    if (start == null || start < cursor - 1e-6) {
      if (diag && start != null) diag.failure = 'Start早于当前搜索起点';
      break;
    }
    const nodes = nodesAfter(smoothed.filter(row => row.t >= start - 1e-6), start, diag);
    if (!nodes || !(nodes.finish > start)) {
      if (diag && nodes) diag.failure = 'Finish不晚于Start';
      break;
    }
    swings.push({
      start: round(start),
      top: round(nodes.top),
      impact: round(nodes.impact),
      finish: round(nodes.finish)
    });
    const next = Math.max(nodes.finish, nodes.release) + 0.04;
    if (next <= cursor) {
      if (diag) diag.failure = '下一搜索位置未前进';
      break;
    }
    cursor = next;
  }
  return swings;
}

function orderedRows(rows) {
  return Array.isArray(rows) ? rows.filter(row => Number.isFinite(row?.t) && Number.isFinite(row?.h)).slice().sort((a, b) => a.t - b.t) : [];
}

function phasesFrom(rows) {
  const ordered = orderedRows(rows);
  if (ordered.length < 8) return null;
  const start = swingStartOf(ordered);
  if (start == null) return null;
  const nodes = nodesAfter(smoothWrist(ordered).filter(row => row.t >= start - 1e-6), start);
  if (!nodes || !(nodes.top > start) || !(nodes.impact > nodes.top)) return null;
  return {
    start,
    top: nodes.top,
    impact: nodes.impact,
    finish: nodes.finish > nodes.impact ? nodes.finish : null
  };
}

export function resolveSwingPoints(wristRows, elbowRows, endTime) {
  const wrist = phasesFrom(wristRows);
  const elbow = phasesFrom(elbowRows);
  const start = wrist?.start ?? elbow?.start;
  const top = wrist?.top ?? elbow?.top;
  const impact = wrist?.impact ?? elbow?.impact;
  let finish = wrist?.finish ?? elbow?.finish ?? null;
  if (start == null || top == null || impact == null) return null;
  if (finish == null) {
    const cap = Number.isFinite(endTime) ? endTime : impact + 0.10;
    finish = Math.min(cap, impact + 0.10);
  }
  if (!(start < top && top < impact && impact <= finish)) return null;
  return {
    start: round(start),
    top: round(top),
    impact: round(impact),
    finish: round(finish)
  };
}

export function chooseSwing(swings) {
  if (!swings.length) return null;
  return swings.length === 1 ? { swing: swings[0], number: 1 } : { swing: swings[1], number: 2 };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function seconds(value) {
  return `${value.toFixed(2)}s`;
}

function showClip(video, swing) {
  const source = document.getElementById('golfResultVideo');
  const base = (source?.currentSrc || source?.src || '').split('#')[0];
  if (!video || !base) return;
  const start = swing.start;
  const finish = swing.finish;
  video.onloadedmetadata = () => { video.currentTime = start; };
  video.ontimeupdate = () => {
    if (video.currentTime >= finish - 0.02) {
      video.pause();
      if (video.currentTime > finish) video.currentTime = finish;
    }
  };
  video.onplay = () => {
    if (video.currentTime < start - 0.04 || video.currentTime >= finish - 0.04) video.currentTime = start;
  };
  if (video.getAttribute('src') !== base) video.src = base;
  else video.currentTime = start;
  video.hidden = false;
}

function seek(video, time) {
  const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.04));
  if (Math.abs((video.currentTime || 0) - target) < 0.001 && video.readyState >= 2) {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  return new Promise(resolve => {
    const done = () => {
      video.removeEventListener('seeked', done);
      clearTimeout(timer);
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    };
    const timer = setTimeout(done, 900);
    video.addEventListener('seeked', done);
    try { video.currentTime = target; } catch { done(); }
  });
}

function frameSource() {
  const reader = document.getElementById('golfPoseReader');
  if (reader?.src?.startsWith('blob:')) return reader.src;
  const source = document.getElementById('golfResultVideo');
  return (source?.currentSrc || source?.src || '').split('#')[0];
}

async function showFrames(swing, token) {
  const section = document.getElementById('golfStills');
  const grid = document.getElementById('golfStillsGrid') || document.getElementById('golfSwingFrames');
  const base = frameSource();
  if (!grid || !base) return;
  if (section) section.hidden = false;
  grid.replaceChildren();
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.className = 'golf-pose-decoder';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);
  try {
    video.src = base;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('load')), 20000);
      video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
      video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('load')); }, { once: true });
    });
    if (token !== showFrames.token) return;
    const shots = [
      ['Swing Start', swing.start],
      ['Top', swing.top],
      ['Impact / 击球位置', swing.impact],
      ['Finish', swing.finish]
    ];
    for (const [label, time] of shots) {
      if (token !== showFrames.token) return;
      await seek(video, time);
      if (token !== showFrames.token) return;
    const canvas = document.createElement('canvas');
    const srcW = video.videoWidth || 1;
    const srcH = video.videoHeight || 1;
    const scale = Math.min(1, 720 / Math.max(srcW, srcH));
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `${label}  ${seconds(time)}`;
      figure.append(canvas, caption);
      grid.append(figure);
    }
  } finally {
    video.remove();
  }
}

function tracksOf(detail) {
  if (Array.isArray(detail)) return { wrist: detail, elbow: [], end: null };
  return {
    wrist: Array.isArray(detail?.wrist) ? detail.wrist : [],
    elbow: Array.isArray(detail?.elbow) ? detail.elbow : [],
    end: Number.isFinite(detail?.end) ? detail.end : null
  };
}

function render(detail) {
  const box = document.getElementById('golfSwingSpan');
  const note = document.getElementById('golfSwingSpanText');
  const video = document.getElementById('golfSwingClip');
  const section = document.getElementById('golfStills');
  const grid = document.getElementById('golfStillsGrid') || document.getElementById('golfSwingFrames');
  if (!box || !note) return;
  box.hidden = false;
  const tracks = tracksOf(detail);
  document.dispatchEvent(new CustomEvent('golf-crash-stage', { detail: 'D14' }));
  const stageDiagnostics = [];
  const chosen = chooseSwing(findCompleteSwings(tracks.wrist, stageDiagnostics));
  const swing = chosen?.swing || resolveSwingPoints(tracks.wrist, tracks.elbow, tracks.end);
  const stageText = stageDiagnosticText(tracks, stageDiagnostics);
  document.dispatchEvent(new CustomEvent('golf-crash-stage', { detail: 'D15' }));
  if (!swing) {
    note.textContent = `没有找到完整挥杆\n\n${diagnosticText(latestDiag)}\n\n${stageText}`;
    if (video) video.hidden = true;
    if (section) section.hidden = true;
    if (grid) grid.replaceChildren();
    return;
  }
  note.textContent = [
    '检测到完整挥杆',
    `Swing Start：${seconds(swing.start)}`,
    `Top：${seconds(swing.top)}`,
    `Impact：${seconds(swing.impact)}`,
    `Finish：${seconds(swing.finish)}`,
    '',
    stageText
  ].join('\n');
  showClip(video, swing);
  const token = (showFrames.token || 0) + 1;
  showFrames.token = token;
  showFrames(swing, token).catch(() => {
    if (token === showFrames.token && grid && !grid.children.length) grid.replaceChildren();
  });
}

function stageDiagnosticText(tracks, attempts) {
  const times = latestDiag?.poseTimes || [];
  return [
    `成功Pose时间戳（采样目标时间，秒）：${times.length ? times.map(t => t.toFixed(3)).join(', ') : '无'}`,
    `左右手腕visibility均≥0.5的有效节点：${tracks.wrist.length}`,
    `左右肘关节visibility均≥0.5的有效节点：${tracks.elbow.length}`,
    ...attempts.map((diag, index) => [
      `候选 ${index + 1}（后续阶段遇前置失败不继续评估）：`,
      ...[['start', 'Swing Start'], ['top', 'Top'], ['impact', 'Impact'], ['finish', 'Finish']].map(([key, label]) =>
        `${label}：${Number.isFinite(diag[key]) ? `找到 ${seconds(diag[key])}` : '未找到／尚未执行到该阶段'}`),
      ...(Number.isFinite(diag.plateauPeak) ? [`Top平台峰值候选：${seconds(diag.plateauPeak)}（不等于最终Top）`] : []),
      `判定：${diag.failure || '完整四节点通过'}`
    ].join('\n'))
  ].join('\n');
}

function diagnosticText(diag) {
  const yes = diag?.loaded ? '是' : '否';
  const duration = Number.isFinite(diag?.duration) ? `${diag.duration.toFixed(2)}s` : '无';
  const size = diag ? `${diag.width} × ${diag.height}` : '无';
  const count = key => Number.isFinite(diag?.[key]) ? String(diag[key]) : '无';
  const poseTime = key => Number.isFinite(diag?.[key]) ? `${diag[key].toFixed(2)}s` : '无';
  let step = 'A 视频没有加载';
  if (diag?.loaded && !diag.decoded) step = 'B 没有成功解码帧';
  else if (diag?.decoded && !diag.received) step = 'C MediaPipe没有收到帧';
  else if (diag?.received && !diag.posed) step = 'D MediaPipe收到帧但没有识别到人体';
  else if (diag?.posed) step = 'E 已经有Pose数据，但4点挥杆规则没有找到完整挥杆';
  return [
    `1. 上传视频是否成功加载：${yes}`,
    `2. 视频 duration：${duration}`,
    `3. videoWidth × videoHeight：${size}`,
    `4. 实际尝试采样的总帧数：${count('attempted')}`,
    `5. 成功解码得到图像的帧数：${count('decoded')}`,
    `6. MediaPipe 实际收到的帧数：${count('received')}`,
    `7. MediaPipe 成功返回 Pose landmarks 的帧数：${count('posed')}`,
    `8. 第一帧成功 Pose 的时间：${poseTime('firstPose')}`,
    `9. 最后一帧成功 Pose 的时间：${poseTime('lastPose')}`,
    `10. 失败步骤：${step}`
  ].join('\n');
}

let latestDiag = null;

if (typeof document !== 'undefined' && document.body?.classList.contains('golf-app')) {
  document.addEventListener('golf-swing-diagnostic', event => { latestDiag = event.detail || null; });
  document.addEventListener('golf-swing-track', event => render(event.detail || []));
}
