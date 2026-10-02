const presentationTools = (() => {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  const crc32 = bytes => {
    let c = 0xffffffff;
    for (const value of bytes) c = crcTable[(c ^ value) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const zipStore = files => {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    files.forEach(file => {
      const name = encoder.encode(file.name);
      const data = file.bytes instanceof Uint8Array ? file.bytes : encoder.encode(file.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length);
      const view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(8, 0, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
      local.set(name, 30);
      parts.push(local, data);
      const entry = new Uint8Array(46 + name.length);
      const centralView = new DataView(entry.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry);
      offset += local.length + data.length;
    });
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  };
  const xml = value => String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const run = (text, size, bold) => `<a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="1C1C1B"/></a:solidFill><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:rPr><a:t>${xml(text)}</a:t></a:r>`;
  const slideXml = (slide, imageRel) => {
    const withImage = Boolean(imageRel);
    const bodyWidth = withImage ? 6400800 : 11094720;
    const bullets = (slide.bullets || []).map(item => `<a:p><a:pPr marL="171450" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>${run(item, withImage ? 1600 : 1800, false)}</a:p>`).join('') || '<a:p/>';
    const picture = withImage ? `<p:pic><p:nvPicPr><p:cNvPr id="5" name="Picture"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imageRel}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="7132320" y="1463040"/><a:ext cx="4511040" cy="4511040"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="91440"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF5C4D"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="548640" y="274320"/><a:ext cx="11094720" cy="868680"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p>${run(slide.title || '', 2800, true)}</a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Body"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="548640" y="1371600"/><a:ext cx="${bodyWidth}" cy="4937760"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${bullets}</p:txBody></p:sp>${picture}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  };
  const group = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const emptyTree = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
  const theme = `${group}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="AI SuperMall"><a:themeElements><a:clrScheme name="AI SuperMall"><a:dk1><a:srgbClr val="1C1C1B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="242420"/></a:dk2><a:lt2><a:srgbClr val="F7F7F3"/></a:lt2><a:accent1><a:srgbClr val="FF5C4D"/></a:accent1><a:accent2><a:srgbClr val="1C1C1B"/></a:accent2><a:accent3><a:srgbClr val="8F8F87"/></a:accent3><a:accent4><a:srgbClr val="FFB3A9"/></a:accent4><a:accent5><a:srgbClr val="242420"/></a:accent5><a:accent6><a:srgbClr val="FF5C4D"/></a:accent6><a:hlink><a:srgbClr val="1C1C1B"/></a:hlink><a:folHlink><a:srgbClr val="8F8F87"/></a:folHlink></a:clrScheme><a:fontScheme name="AI SuperMall"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="AI SuperMall"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
  const buildPptx = deck => {
    const slides = deck.slides || [];
    const rel = items => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
      { name: '_rels/.rels', data: rel('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>') },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(deck.title || 'Presentation')}</dc:title><dc:creator>AI SuperMall</dc:creator></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AI SuperMall</Application><Slides>${slides.length}</Slides><PresentationFormat>On-screen Show (16:9)</PresentationFormat></Properties>` },
      { name: 'ppt/presentation.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>` },
      { name: 'ppt/_rels/presentation.xml.rels', data: rel(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, index) => `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')}`) },
      { name: 'ppt/slideMasters/slideMaster1.xml', data: `${group}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>` },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: rel('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>') },
      { name: 'ppt/slideLayouts/slideLayout1.xml', data: `${group}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${emptyTree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>` },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rel('<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>') },
      { name: 'ppt/theme/theme1.xml', data: theme }
    ];
    slides.forEach((slide, index) => {
      const ext = slide.imageType === 'image/jpeg' ? 'jpeg' : slide.imageType === 'image/webp' ? 'webp' : 'png';
      const hasImage = slide.imageBytes instanceof Uint8Array && slide.imageBytes.length;
      if (hasImage) files.push({ name: `ppt/media/image${index + 1}.${ext}`, bytes: slide.imageBytes });
      files.push({ name: `ppt/slides/slide${index + 1}.xml`, data: slideXml(slide, hasImage ? 'rId2' : '') });
      files.push({ name: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: rel(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${hasImage ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${index + 1}.${ext}"/>` : ''}`) });
    });
    return zipStore(files);
  };
  return { buildPptx };
})();

(() => {
  if (typeof document === 'undefined' || document.body?.dataset?.workspace !== 'presentation') return;
  const get = id => document.getElementById(id);
  const form = get('workspaceForm');
  const input = get('taskInput');
  const nameInput = get('projectName');
  const draftKey = 'ai-supermall-presentation-draft';
  const query = new URLSearchParams(location.search);
  const state = { messages: [], projectId: '', conversationId: '', title: '', generating: false, saveAfterLogin: false };
  const tr = () => document.documentElement.lang === 'en' ? {
    title: 'Presentation',
    description: 'Create presentations, reports, proposals and slides with AI',
    panel: 'Tell AI what you want to present',
    panelCopy: 'Describe the deck in your own words. The slide language follows your request.',
    projectName: 'Project name', task: 'Your request',
    placeholder: 'For example: make a 5-page introduction to Vancouver.',
    titlePlaceholder: 'Enter a project name',
    generate: 'Generate', revise: 'Continue editing', regenerate: 'Regenerate',
    download: 'Download PowerPoint', save: 'Save as project',
    saving: 'Saving your project…', saved: 'Saved to your project.', generating: 'AI is creating your slides…',
    required: 'Describe the presentation you want.', login: 'Sign in to save this presentation.',
    imagesDone: 'Images added to the slides.', imagesPartial: 'Some images could not be created. The finished ones are on the slides.',
    resultCopy: 'Ask for a change below. The next result revises this deck.',
    note: 'Sign in to save this presentation to your projects. The conversation is also kept in History.',
    unnamed: 'Untitled presentation', home: 'Home', projects: 'My Projects',
    voice: 'Voice input', voiceLanguage: 'Recognition language', browserLanguage: 'Browser language', listening: 'Listening…',
    slide: 'Slide'
  } : {
    title: '演示与汇报',
    description: '用一句话生成演示文稿、汇报、提案和课堂展示',
    panel: '告诉 AI 你想做什么演示',
    panelCopy: '直接说明页数、主题和语言。生成语言以你的要求为准。',
    projectName: '项目名称', task: '你的需求',
    placeholder: '例如：帮我做一个5页的温哥华旅游介绍。',
    titlePlaceholder: '请输入项目名称',
    generate: '生成', revise: '继续修改', regenerate: '重新生成',
    download: '下载 PowerPoint', save: '保存为项目',
    saving: '正在保存项目…', saved: '已保存到项目。', generating: 'AI 正在生成演示文稿…',
    required: '请先描述你想做的演示文稿。', login: '请先登录后再保存。',
    imagesDone: '图片已加入幻灯片。', imagesPartial: '有的图片没有生成，已经完成的图片已放在幻灯片上。',
    resultCopy: '在下方继续提出修改。下一次结果会基于这套幻灯片。',
    note: '登录后可保存到项目，这段演示也会进入对话历史。',
    unnamed: '未命名演示', home: '首页', projects: '我的项目',
    voice: '语音输入', voiceLanguage: '识别语言', browserLanguage: '浏览器语言', listening: '正在聆听…',
    slide: '第'
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
  const typedTitle = () => nameInput.value.trim().slice(0, 120);
  const currentDeck = () => {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      if (state.messages[index]?.presentation?.slides?.length) return state.messages[index].presentation;
    }
    return null;
  };
  const defaultTitle = () => String(state.messages[0]?.question || input.value || '').replace(/\s+/g, ' ').trim().slice(0, 40) || tr().unnamed;
  const deckText = deck => !deck ? '' : [deck.title, ...(deck.slides || []).map((slide, index) => `${index + 1}. ${slide.title}\n${(slide.bullets || []).map(item => `• ${item}`).join('\n')}`)].filter(Boolean).join('\n\n');
  const suggestionText = /^((?:配图建议|图片建议|建议配图|插图建议|image suggestion|suggested image)\s*[:：]\s*)(.+)$/i;
  function pullSuggestions(deck) {
    (deck?.slides || []).forEach(slide => {
      const kept = [];
      (slide.bullets || []).forEach(item => {
        const match = suggestionText.exec(String(item || '').trim());
        if (match) { if (!slide.imagePrompt) slide.imagePrompt = match[2].slice(0, 500); return; }
        if (String(item || '').trim()) kept.push(item);
      });
      slide.bullets = kept;
    });
    return deck;
  }
  function imageRequest(text) {
    const mentions = /(图片|配图|插图|照片|图像|\bimages?\b|\bpictures?\b|\bphotos?\b)/i.test(text);
    if (!mentions) return null;
    const replace = /(换(一?张)?图|更换图片|重新(生成|制作|来).{0,16}(图|图片|配图)|所有图片重新|regenerate .{0,24}(image|picture|photo)|replace .{0,16}(image|picture|photo))/i.test(text);
    const all = /(每[一]?[页张]|所有(幻灯片|页面|页)|全部(幻灯片|页面)?|each slide|every slide|all slides)/i.test(text);
    const indexes = new Set();
    for (const match of text.matchAll(/第\s*(\d+)\s*[页张]|slide\s*(\d+)/gi)) indexes.add(Number(match[1] || match[2]) - 1);
    if (/这一页|本页|当前页|this slide/i.test(text) && !indexes.size) indexes.add(0);
    const createsDeck = /(做|生成|制作|创建|write|create|make).{0,16}(演示|幻灯片|ppt|presentation|页)/i.test(text);
    const textEdit = /(写短|缩短|简短|改短|改成|翻译|删除|增加一页|加一页|语气|标题|正文|文字|英文|中文|专业)/.test(text);
    return { replace, targets: indexes.size && !all ? indexes : 'all', onlyImages: !createsDeck && !textEdit };
  }
  function mergeImages(previous, next, request) {
    const used = new Set();
    return (next?.slides || []).map((slide, index) => {
      const replaceThis = request?.replace && (request.targets === 'all' || request.targets.has(index));
      let found = -1;
      if (!replaceThis) {
        found = (previous || []).findIndex((item, itemIndex) => !used.has(itemIndex) && item?.title && item.title === slide.title && (item.image || item.imageUrl));
        if (found < 0 && previous?.[index] && !used.has(index)) found = index;
      }
      if (found >= 0) used.add(found);
      const source = found >= 0 ? previous[found] : null;
      return { ...slide, imagePrompt: slide.imagePrompt || source?.imagePrompt || '', image: replaceThis ? undefined : source?.image, imageUrl: replaceThis ? '' : (source?.imageUrl || '') };
    });
  }
  function illustrateIndexes(deck, request) {
    if (!request) return [];
    return (deck.slides || []).map((slide, index) => index).filter(index => {
      const targeted = request.targets === 'all' || request.targets.has(index);
      if (!targeted || index < 0 || index >= deck.slides.length) return false;
      return request.replace || !(deck.slides[index].image?.path || deck.slides[index].imageUrl);
    });
  }

  function applyCopy() {
    const text = tr();
    const deck = currentDeck();
    document.title = `AI SuperMall — ${text.title}`;
    get('workspaceTitle').textContent = text.title;
    get('workspaceDescription').textContent = text.description;
    get('presentationPanelTitle').textContent = text.panel;
    get('presentationPanelCopy').textContent = text.panelCopy;
    get('projectNameLabel').textContent = text.projectName;
    get('taskInputLabel').textContent = text.task;
    nameInput.placeholder = text.titlePlaceholder;
    input.placeholder = text.placeholder;
    get('workspaceSubmit').textContent = state.messages.length ? text.revise : text.generate;
    get('presentationRegenerate').textContent = text.regenerate;
    get('presentationDownload').textContent = text.download;
    get('saveProject').textContent = text.save;
    get('presentationDeckTitle').textContent = deck?.title || text.title;
    get('presentationResultCopy').textContent = text.resultCopy;
    get('homeLink').textContent = text.home;
    get('projectsLink').textContent = text.projects;
    get('languageToggle').textContent = language() === 'en' ? '中文' : 'EN';
    get('workspaceNote').textContent = text.note;
    get('presentationVoice').setAttribute('aria-label', text.voice);
    get('presentationVoice').title = text.voice;
    get('presentationVoiceLanguage').setAttribute('aria-label', text.voiceLanguage);
    get('presentationVoiceLanguage').querySelector('option[value="browser"]').textContent = text.browserLanguage;
    get('presentationRegenerate').disabled = !state.messages.length || state.generating;
    get('presentationDownload').disabled = !deck || state.generating;
  }
  function render() {
    const deck = currentDeck();
    const stage = get('presentationSlides');
    stage.replaceChildren();
    (deck?.slides || []).forEach((slide, index) => {
      const frame = document.createElement('article');
      const canvas = document.createElement('div');
      const header = document.createElement('header');
      const number = document.createElement('span');
      const title = document.createElement('h3');
      const body = document.createElement('div');
      const list = document.createElement('ul');
      frame.className = 'slide-frame';
      canvas.className = 'slide-canvas';
      number.className = 'slide-index';
      number.textContent = language() === 'en' ? `${tr().slide} ${index + 1}` : `${tr().slide} ${index + 1} 页`;
      title.textContent = slide.title || '';
      body.className = slide.imageUrl ? 'slide-body' : 'slide-body no-image';
      (slide.bullets || []).forEach(item => {
        if (suggestionText.test(String(item || '').trim())) return;
        const line = document.createElement('li');
        line.textContent = item;
        list.append(line);
      });
      header.append(number, title);
      body.append(list);
      if (slide.imageUrl) {
        const photo = document.createElement('img');
        photo.className = 'slide-photo';
        photo.alt = '';
        photo.src = slide.imageUrl;
        body.append(photo);
      }
      canvas.append(header, body);
      frame.append(canvas);
      stage.append(frame);
    });
    get('workspaceResults').hidden = !deck;
    applyCopy();
  }
  function persistDraft() {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({
        language: language(), title: nameInput.value, savedTitle: state.title, task: input.value,
        messages: state.messages, projectId: state.projectId, conversationId: state.conversationId, saveAfterLogin: state.saveAfterLogin
      }));
    } catch {}
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
    history.replaceState(null, '', state.projectId ? `create-presentation.html?project=${encodeURIComponent(state.projectId)}` : 'create-presentation.html');
    return true;
  }
  function restoreHandoff() {
    if (query.get('handoff') !== '1') return false;
    try {
      const handoff = JSON.parse(sessionStorage.getItem('ai-supermall-workspace-handoff') || '{}');
      if (handoff.workspace !== 'presentation' || typeof handoff.task !== 'string' || !handoff.task.trim()) return false;
      input.value = handoff.task.trim().slice(0, 8000);
      if (handoff.language === 'en' || handoff.language === 'zh') {
        localStorage.setItem('ai-supermall-language', handoff.language);
        document.documentElement.lang = handoff.language === 'en' ? 'en' : 'zh-CN';
      }
      sessionStorage.removeItem('ai-supermall-workspace-handoff');
      history.replaceState(null, '', 'create-presentation.html');
      persistDraft();
      return true;
    } catch { sessionStorage.removeItem('ai-supermall-workspace-handoff'); return false; }
  }
  async function signedIn() { return (await fetch('/api/account/me')).ok; }
  function projectConversation() {
    const task = input.value.trim() || state.messages.at(-1)?.question || state.messages[0]?.question || '';
    return [{ type: 'project_meta', workspace: 'presentation', intent: 'presentation', task: task.slice(0, 2000) }, ...state.messages.map(message => ({ question: message.question || '', answer: message.answer || '', workspace: 'presentation', presentation: message.presentation || null }))];
  }
  async function saveHistory() {
    if (!state.messages.length || !(await signedIn())) return;
    const existing = Boolean(state.conversationId);
    const messages = state.messages.map(message => ({ ...message, workspace: 'presentation' }));
    const payload = existing
      ? { id: state.conversationId, locale: language(), messages }
      : { title: typedTitle() || state.title || defaultTitle(), locale: language(), messages };
    const saved = await api('/api/member/conversations', existing ? patch(payload) : json(payload));
    const row = Array.isArray(saved) ? saved[0] : saved;
    if (!existing && row?.id) state.conversationId = row.id;
  }
  async function saveProject(manual = false) {
    if (!typedTitle() && !input.value.trim() && !state.messages.length) { if (manual) setStatus(tr().required); return; }
    if (!(await signedIn())) {
      state.saveAfterLogin = true;
      persistDraft();
      if (manual) location.href = `account.html?mode=login&returnTo=${encodeURIComponent('create-presentation.html?restoreDraft=1')}`;
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
    history.replaceState(null, '', `create-presentation.html?project=${encodeURIComponent(state.projectId)}`);
    setStatus(tr().saved);
  }
  async function loadProject() {
    const projectId = query.get('project');
    if (!projectId) return false;
    const project = await api(`/api/member/projects?id=${encodeURIComponent(projectId)}`);
    const meta = (project.conversation || []).find(item => item?.type === 'project_meta');
    if (meta?.workspace && meta.workspace !== 'presentation') return false;
    state.projectId = project.id;
    state.title = project.title || '';
    nameInput.value = state.title;
    state.messages = (project.conversation || []).filter(item => item?.type !== 'project_meta' && item?.type !== 'workspace_state').map(item => ({
      question: item.question || '', answer: item.answer || '', workspace: 'presentation', presentation: item.presentation || null
    })).filter(item => item.presentation?.slides?.length || item.question);
    state.messages.forEach(message => { if (message.presentation) pullSuggestions(message.presentation); });
    await hydrateImages();
    input.value = '';
    return true;
  }
  async function slideImageUrl(slide) {
    if (slide?.image?.path) {
      const endpoint = slide.image.provider === 'oss' ? '/api/member/oss-media?provider=oss&path=' : '/api/member/project-media?path=';
      try { return (await api(endpoint + encodeURIComponent(slide.image.path))).url; } catch { return slide.imageUrl || ''; }
    }
    return slide?.imageUrl || '';
  }
  async function hydrateImages() {
    const jobs = [];
    state.messages.forEach(message => (message.presentation?.slides || []).forEach(slide => {
      if (!slide?.image?.path) return;
      jobs.push(slideImageUrl(slide).then(url => { if (url) slide.imageUrl = url; }));
    }));
    await Promise.all(jobs);
  }
  async function storeSlideImage(slide, remoteUrl) {
    slide.imageUrl = remoteUrl;
    if (!(await signedIn())) return;
    if (!state.projectId) await saveProject(false);
    if (!state.projectId) return;
    const result = await api('/api/member/project-media', json({ projectId: state.projectId, media: [{ clientId: 'slide', url: remoteUrl, name: 'slide-image.png', kind: 'generated' }] }));
    const media = result.media?.[0];
    if (!media?.path) return;
    slide.image = { provider: 'supabase', path: media.path, name: media.name || 'slide-image.png', type: media.type || 'image/png', kind: 'generated' };
    slide.imageUrl = await slideImageUrl(slide) || remoteUrl;
    await saveProject(false);
  }
  async function illustrate(deck, indexes) {
    let failed = 0;
    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      const slide = deck.slides[indexes[cursor]];
      setStatus(language() === 'en' ? `Creating image ${cursor + 1} of ${indexes.length}…` : `正在生成图片（${cursor + 1}/${indexes.length}）…`);
      const description = slide.imagePrompt || [slide.title, ...(slide.bullets || [])].filter(Boolean).join('。');
      try {
        const response = await api('/api/visual/generate', json({
          prompt: `演示文稿配图，画面中不要出现文字。${description}`,
          language: language(), images: [], projectMedia: [], requireImage: false,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }));
        const remoteUrl = (response.images || []).find(item => typeof item === 'string' && /^https?:\/\//i.test(item));
        if (!remoteUrl) throw new Error('no image');
        await storeSlideImage(slide, remoteUrl);
        render();
      } catch { failed += 1; }
    }
    return failed;
  }
  async function planImagePrompts(deck, instruction) {
    const planned = await api('/api/presentation/generate', json({
      prompt: instruction, presentation: deckPayload(deck), imagePlan: true, language: language(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }));
    (deck.slides || []).forEach((slide, index) => {
      const prompt = planned.presentation?.slides?.[index]?.imagePrompt;
      if (prompt) slide.imagePrompt = prompt;
    });
  }
  async function downloadDeck() {
    const deck = currentDeck();
    if (!deck) return;
    const slides = [];
    for (const slide of deck.slides || []) {
      const next = { title: slide.title, bullets: slide.bullets };
      const url = await slideImageUrl(slide);
      if (url) {
        try {
          const response = await fetch(url);
          if (response.ok) {
            next.imageBytes = new Uint8Array(await response.arrayBuffer());
            next.imageType = String(response.headers.get('content-type') || slide.image?.type || '').split(';')[0].toLowerCase();
          }
        } catch {}
      }
      slides.push(next);
    }
    const blob = presentationTools.buildPptx({ title: deck.title, slides });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const name = (typedTitle() || state.title || deck.title || 'presentation').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'presentation';
    link.href = url;
    link.download = `${name}.pptx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function setupVoice() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = get('presentationVoice');
    const picker = get('presentationVoiceLanguage');
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
      const status = get('presentationVoiceStatus');
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
  function deckPayload(deck) {
    if (!deck?.slides?.length) return null;
    return { title: deck.title || '', slides: deck.slides.map(slide => ({ title: slide.title || '', bullets: slide.bullets || [], imagePrompt: slide.imagePrompt || '', image: slide.image || undefined })) };
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
      const pictures = imageRequest(instruction);
      const previous = prior.at(-1)?.presentation || null;
      let deck;
      if (pictures?.onlyImages && previous?.slides?.length) {
        deck = JSON.parse(JSON.stringify(previous));
        pullSuggestions(deck);
      } else {
        const response = await api('/api/presentation/generate', json({
          prompt: instruction,
          presentation: deckPayload(previous),
          context: prior.slice(-6).map(item => ({ question: item.question, answer: item.answer })),
          language: language(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }));
        deck = response.presentation;
        pullSuggestions(deck);
        deck.slides.forEach(slide => { slide.bullets = (slide.bullets || []).slice(0, 5); });
        deck.slides = mergeImages(previous?.slides || [], deck, pictures);
      }
      const answer = deckText(deck);
      if (regenerate) Object.assign(state.messages[state.messages.length - 1], { answer, presentation: deck, workspace: 'presentation' });
      else {
        state.messages.push({ question: instruction, answer, presentation: deck, workspace: 'presentation' });
        input.value = '';
      }
      if (!state.title && !typedTitle()) state.title = defaultTitle();
      render();
      const indexes = illustrateIndexes(deck, pictures);
      if (indexes.length && (pictures.replace || indexes.some(index => !deck.slides[index].imagePrompt))) {
        try { await planImagePrompts(deck, instruction); } catch {}
      }
      const failed = indexes.length ? await illustrate(deck, indexes) : 0;
      deck.answer = answer;
      const latest = state.messages.at(-1);
      if (latest) latest.answer = deckText(deck);
      persistDraft();
      history.replaceState(null, '', state.projectId ? `create-presentation.html?project=${encodeURIComponent(state.projectId)}` : 'create-presentation.html');
      await saveHistory();
      if (state.projectId || indexes.length) await saveProject(false);
      if (indexes.length) setStatus(failed ? tr().imagesPartial : tr().imagesDone);
      else if (!state.projectId) setStatus('');
    } catch (error) { setStatus(error.message); }
    finally { state.generating = false; applyCopy(); }
  }

  const storedLanguage = localStorage.getItem('ai-supermall-language');
  if (storedLanguage === 'en' || storedLanguage === 'zh') document.documentElement.lang = storedLanguage === 'en' ? 'en' : 'zh-CN';
  get('languageToggle').addEventListener('click', () => {
    const next = language() === 'en' ? 'zh' : 'en';
    localStorage.setItem('ai-supermall-language', next);
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-CN';
    render();
  });
  form.addEventListener('submit', event => { event.preventDefault(); generate(false); });
  get('presentationRegenerate').addEventListener('click', () => generate(true));
  get('presentationDownload').addEventListener('click', () => downloadDeck().catch(error => setStatus(error.message)));
  get('saveProject').addEventListener('click', () => { state.saveAfterLogin = true; persistDraft(); saveProject(true).catch(error => setStatus(error.message)); });
  nameInput.addEventListener('input', persistDraft);
  input.addEventListener('input', () => { history.replaceState(null, '', state.projectId ? `create-presentation.html?project=${encodeURIComponent(state.projectId)}` : 'create-presentation.html'); persistDraft(); });
  window.addEventListener('pagehide', persistDraft);
  setupVoice();
  applyCopy();
  (async () => {
    try {
      if (query.get('project')) await loadProject();
      else if (query.get('restoreDraft') === '1') restoreDraft();
      else if (!restoreHandoff() && query.get('new') !== '1') restoreDraft();
      render();
      if (state.saveAfterLogin && await signedIn()) await saveProject(true);
    } catch (error) {
      const projectId = query.get('project');
      if (/sign in/i.test(String(error.message || '')) && projectId) {
        location.href = `account.html?mode=login&returnTo=${encodeURIComponent(`create-presentation.html?project=${projectId}`)}`;
        return;
      }
      setStatus(error.message);
      applyCopy();
    }
  })();
})();
