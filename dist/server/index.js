const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

const accountRegionFor = (request, url) => {
  const requested = url.searchParams.get("region");
  if (requested === "cn" || requested === "global") return requested;
  return request.headers.get("cf-ipcountry") === "CN" ? "cn" : "global";
};

const globalAccountReady = env => Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
const accountUnavailable = region => json({ error: region === "cn" ? "The China account service is not available yet." : "The account service is not configured yet." }, 503);
const supabaseHeaders = (env, token) => ({
  "apikey": env.SUPABASE_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
  ...(token ? { "Authorization": `Bearer ${token}` } : {})
});
const safeEmail = email => String(email || "").trim().toLowerCase().slice(0, 254);
const safePassword = password => String(password || "");
const routeModel = text => /\b(code|coding|program|debug|algorithm|math|mathematics|equation|proof|technical|architecture)\b|代码|编程|调试|算法|数学|方程|证明|技术分析|架构/i.test(text) ? "deepseek" : "qwen";
const taskInstruction = (taskType, isEnglish) => {
  const instructions = isEnglish
    ? { image_creation: "AI SuperMall has its own Visuals & posters workspace and image generation. Keep the user inside AI SuperMall; do not say image generation is unavailable.", presentation: "AI SuperMall has its own Presentations workspace. Keep the user inside AI SuperMall.", video: "AI SuperMall has its own Video & shorts workspace. Keep the user inside AI SuperMall.", writing: "Help produce the requested writing, plan, summary, translation, or outline directly inside AI SuperMall.", productivity: "Help turn the user's goal into practical next steps and useful work inside AI SuperMall." }
    : { image_creation: "AI SuperMall 已提供自己的视觉与海报工作台和图像生成能力。必须在本站内继续完成，不得说图像生成不可用。", presentation: "AI SuperMall 已提供自己的演示与汇报工作台。必须在本站内继续完成。", video: "AI SuperMall 已提供自己的视频与短片工作台。必须在本站内继续完成。", writing: "请在 AI SuperMall 内直接完成用户需要的写作、计划、总结、翻译或大纲。", productivity: "请在 AI SuperMall 内把用户目标转化为可执行的下一步和实用工作成果。" };
  return instructions[taskType] || "";
};
const imageHost = value => {
  const clean = String(value || "").trim().replace(/^https:\/\//, "").replace(/\/$/, "");
  if (/^[a-z0-9-]+\.ap-southeast-1\.maas\.aliyuncs\.com$/i.test(clean)) return clean;
  if (/^[a-z0-9_-]+$/i.test(clean)) return `${clean}.ap-southeast-1.maas.aliyuncs.com`;
  return "";
};
const visualError = (language, message, code = "") => {
  const detail = code === "InvalidParameter"
    ? (language === "en" ? "The image or request parameters are not supported. Please try a normal JPG, PNG, or WEBP image." : "图片或请求参数不符合模型要求。请使用正常尺寸的 JPG、PNG 或 WEBP 图片后重试。")
    : (language === "en" ? message : "图像服务暂时不可用，请稍后重试。");
  return json({ error: detail, code }, 502);
};
const ossConfigured = env => Boolean(env.ALIBABA_CLOUD_ACCESS_KEY_ID && env.ALIBABA_CLOUD_ACCESS_KEY_SECRET && env.ALIBABA_OSS_BUCKET && env.ALIBABA_OSS_REGION && env.ALIBABA_OSS_ENDPOINT);
const ossText = value => new TextEncoder().encode(String(value));
const ossHex = bytes => Array.from(new Uint8Array(bytes)).map(value => value.toString(16).padStart(2, "0")).join("");
const ossHash = async value => ossHex(await crypto.subtle.digest("SHA-256", ossText(value)));
const ossHmac = async (key, value) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key instanceof Uint8Array ? key : ossText(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), ossText(value)));
const ossEncode = value => String(value).split("/").map(part => encodeURIComponent(part).replace(/%7E/gi, "~")).join("/");
const ossDate = now => {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return { stamp: iso, day: iso.slice(0, 8) };
};
const ossEndpoint = env => String(env.ALIBABA_OSS_ENDPOINT || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
const ossObjectKeyPattern = /^[a-z]+\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]+\.(?:jpg|jpeg|png|webp)$/i;
const videoUploadTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const videoUploadKeyPattern = /^original\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]+\.(?:mp4|mov|webm)$/i;
const ossObjectKeyFor = (userId, projectId, type, kind = "original") => `${kind}/${userId}/${projectId}/${crypto.randomUUID()}.${mediaExtension(type)}`;
async function ossPresignedUrl(env, method, objectKey, expires = 600, contentType = "") {
  if (!ossConfigured(env)) throw new Error("OSS storage is not configured.");
  const host = `${env.ALIBABA_OSS_BUCKET}.${ossEndpoint(env)}`, { stamp, day } = ossDate(new Date());
  const scope = `${day}/${env.ALIBABA_OSS_REGION}/oss/aliyun_v4_request`;
  const additionalHeaders = contentType ? "content-type;host" : "host";
  const canonicalHeaders = contentType ? `content-type:${contentType}\nhost:${host}\n` : `host:${host}\n`;
  const query = new URLSearchParams({
    "x-oss-additional-headers": additionalHeaders,
    "x-oss-credential": `${env.ALIBABA_CLOUD_ACCESS_KEY_ID}/${scope}`,
    "x-oss-date": stamp,
    "x-oss-expires": String(Math.max(1, Math.min(604800, expires))),
    "x-oss-signature-version": "OSS4-HMAC-SHA256"
  });
  const canonicalQuery = Array.from(query.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  const canonical = [method, `/${env.ALIBABA_OSS_BUCKET}/${ossEncode(objectKey)}`, canonicalQuery, canonicalHeaders, additionalHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const signingDate = await ossHmac(`aliyun_v4${env.ALIBABA_CLOUD_ACCESS_KEY_SECRET}`, day);
  const signingRegion = await ossHmac(signingDate, env.ALIBABA_OSS_REGION);
  const signingService = await ossHmac(signingRegion, "oss");
  const signingKey = await ossHmac(signingService, "aliyun_v4_request");
  const signature = ossHex(await ossHmac(signingKey, `OSS4-HMAC-SHA256\n${stamp}\n${scope}\n${await ossHash(canonical)}`));
  query.set("x-oss-signature", signature);
  return `https://${host}/${ossEncode(objectKey)}?${query.toString()}`;
}
const normalizeMediaDescriptor = item => {
  const provider = item?.provider === "oss" ? "oss" : "supabase";
  const path = String(item?.path || item?.key || "").slice(0, 500);
  return {
    provider, path,
    name: String(item?.name || "image").slice(0, 180),
    type: mediaTypes.has(item?.type) || videoUploadTypes.has(item?.type) ? item.type : "image/png",
    kind: item?.kind === "generated" ? "generated" : "reference"
  };
};
const validMediaDescriptor = item => item.provider === "oss" ? (videoUploadTypes.has(item.type) ? videoUploadKeyPattern.test(item.path) : ossObjectKeyPattern.test(item.path)) : /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(item.path);
const clockFact = (timeZone) => {
  const now = new Date();
  const utc = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const zone = /^[A-Za-z0-9_/+-]{1,80}$/.test(String(timeZone || "")) ? String(timeZone) : "";
  if (!zone) return { when: utc, zone: "" };
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const pick = type => parts.find(part => part.type === type)?.value || "";
    const year = pick("year"), month = pick("month"), day = pick("day"), hour = pick("hour"), minute = pick("minute"), second = pick("second");
    if (!year || !month || !day || !hour || !minute || !second) return { when: utc, zone: "" };
    return { when: `${year}-${month}-${day}T${hour}:${minute}:${second}`, zone };
  } catch { return { when: utc, zone: "" }; }
};
async function clarifyVisualTask(env, text, imageCount, timeZone) {
  try {
    if (!env.BAILIAN_API_KEY) return "";
    const { when, zone } = clockFact(timeZone);
    const modelId = env.BAILIAN_MODEL || "qwen3.8-flash";
    const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
    const facts = `Current date/time: ${when}\nUser timezone: ${zone || "not provided"}\nImage count: ${imageCount}`;
    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: "Rewrite the user's words into one clear image task. Use the supplied facts and your own knowledge. Return only the task text, in the same language as the user." },
          { role: "user", content: `${facts}\n\nUser request:\n${text}` }
        ]
      })
    });
    if (!upstream.ok) return "";
    const payload = await upstream.json().catch(() => ({}));
    const clarified = String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 2000);
    return clarified;
  } catch (error) {
    console.warn("Visual task clarify skipped", { message: error instanceof Error ? error.message : "unavailable" });
    return "";
  }
}
async function visualRoute(request, env) {
  const { prompt = "", language = "zh", images = [], projectMedia = [], requireImage = false, timeZone = "" } = await request.json();
  const text = String(prompt).trim().slice(0, 2000), isEnglish = language === "en";
  if (!text) return json({ error: isEnglish ? "Please describe the image you want." : "请描述你想生成或修改的图片。" }, 400);
  const host = imageHost(env.BAILIAN_WORKSPACE_ID);
  if (!env.BAILIAN_API_KEY || !host) return json({ error: isEnglish ? "Image service is not configured." : "图像服务尚未配置。" }, 503);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  const files = Array.isArray(images) ? images.slice(0, 10).filter(item => allowed.has(item?.type) && /^data:image\/(jpeg|png|webp);base64,/i.test(String(item?.data || "")) && String(item.data).length <= 28_000_000) : [];
  const token = bearerToken(request), user = Array.isArray(projectMedia) && projectMedia.length ? await supabaseUser(env, token) : null;
  const references = Array.isArray(projectMedia) && user ? projectMedia.slice(0, 10).map(normalizeMediaDescriptor).filter(item => validMediaDescriptor(item) && (item.provider === "oss" ? item.path.startsWith(`original/${user.id}/`) : item.path.startsWith(`${user.id}/`))) : [];
  const stored = [];
  if (references.length) {
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    for (const reference of references) {
      if (reference.provider === "oss") {
        try { stored.push(await ossPresignedUrl(env, "GET", reference.path, 600)); }
        catch (error) { console.warn("Bailian OSS image reference could not be signed", { message: error instanceof Error ? error.message : "signing failed" }); }
        continue;
      }
      const signedResponse = await fetch(`${base}/storage/v1/object/sign/project-media/${reference.path}`, { method: "POST", headers: supabaseHeaders(env, token), body: JSON.stringify({ expiresIn: 600 }) });
      const signedBody = await signedResponse.json().catch(() => ({}));
      const signed = String(signedBody?.signedURL || signedBody?.signedUrl || "");
      if (signedResponse.ok && signed) stored.push(/^https:\/\//i.test(signed) ? signed : `${base}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`);
      else console.warn("Bailian image reference could not be signed", { status: signedResponse.status });
    }
  }
  const inputImages = [...stored, ...files.map(item => item.data)].slice(0, 10);
  if (requireImage && !inputImages.length) return json({ error: isEnglish ? "Your reference image was not available. Please reselect it or reopen the project after it finishes loading." : "没有找到可用的原始图片。请重新选择图片，或等待项目恢复完成后重试。" }, 400);
  const clarified = await clarifyVisualTask(env, text, inputImages.length, timeZone);
  const taskText = clarified || text;
  const editInstruction = inputImages.length > 1
    ? (isEnglish ? "This is an image-editing task. Image 1 is the original image to edit and must stay the canvas. Every image after image 1 is a new reference or source image supplied by the user. Add those later images into image 1 as the user requested. Do not use image 1 in place of those reference images, and do not treat a later image as a new canvas." : "这是图像编辑任务。第 1 张图是要修改的原图，必须作为底图。后续图片是用户新提供的参考或素材图，必须按用户要求加入第 1 张图。不要用第 1 张图代替这些参考图，也不要把后续图片当成新的底图。")
    : inputImages.length
      ? (isEnglish ? "This is an image-editing task. Use the first input image as the original. Preserve its scene, subject, composition, architecture, trees, objects, and identity. Make only the changes explicitly requested by the user. Do not invent an unrelated scene." : "这是图像编辑任务。必须以第 1 张输入图片为原图，保留原始场景、主体、构图、建筑、树木和物体；只执行用户明确要求的修改，不要生成无关的新场景。")
      : "";
  const content = [...inputImages.map(image => ({ image })), { text: [taskText, editInstruction].filter(Boolean).join("\n\n") }];
  const model = env.BAILIAN_IMAGE_MODEL || "wan2.7-image", mode = inputImages.length ? "image_editing" : "text_to_image";
  console.info("Bailian image request", { model, mode, directImageCount: files.length, storedImageCount: stored.length, inputImageCount: inputImages.length });
  const response = await fetch(`https://${host}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: "POST", headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: { messages: [{ role: "user", content }] }, parameters: { size: "1024*1024", n: 1, watermark: false } })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = String(body?.code || body?.error_code || "");
    console.error("Bailian image request failed", { status: response.status, code });
    return visualError(language, "Image service is temporarily unavailable.", code);
  }
  const resultImages = (body?.output?.choices || []).flatMap(choice => choice?.message?.content || []).filter(item => item?.type === "image" && typeof item.image === "string").map(item => item.image);
  if (!resultImages.length) return visualError(language, "Image service returned no image.");
  return json({ answer: mode === "image_editing" ? (isEnglish ? "The image editing model created a result from your reference image." : "图像编辑模型已根据你的原图生成结果。") : (isEnglish ? "The image model created a result." : "图像模型已生成结果。"), images: resultImages, generation: { provider: "bailian", model, mode, inputImageCount: inputImages.length } });
}
async function writingRoute(request, env) {
  const { prompt = "", draft = "", context = [], language = "zh" } = await request.json();
  const text = String(prompt).trim().slice(0, 8000);
  const current = String(draft || "").slice(0, 12000);
  const isEnglish = language === "en";
  if (!text) return json({ error: isEnglish ? "Describe the writing you want." : "请先描述你想写的内容。" }, 400);
  if (!env.BAILIAN_API_KEY) return json({ error: isEnglish ? "AI service is not configured." : "AI 服务尚未连接。" }, 503);
  const modelId = env.BAILIAN_MODEL || "qwen3.8-flash";
  const earlier = Array.isArray(context) ? context.slice(-8).map(item => `Instruction: ${String(item?.question || "").slice(0, 2000)}\nResult: ${String(item?.answer || "").slice(0, 4000)}`).join("\n\n") : "";
  const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.4,
      max_tokens: 4000,
      messages: [
        { role: "system", content: "You are the writing assistant inside AI SuperMall. Follow the user's latest instruction and return only the finished writing. Do not add a preamble or explanation unless the user asked for one. Write in the language the user requests. If they do not name a language, keep the language of their instruction and of the current draft. Do not change language because of any interface setting. When a current draft is provided, revise that draft according to the instruction instead of starting an unrelated piece. Keep details from the draft that the user did not ask to change." },
        { role: "user", content: `Current draft:\n${current || "(none)"}\n\nEarlier turns:\n${earlier || "(none)"}\n\nLatest instruction:\n${text}` }
      ]
    })
  });
  if (!upstream.ok) {
    const failure = await upstream.json().catch(() => ({}));
    console.error("Writing request failed", { model: modelId, status: upstream.status, code: failure?.code || failure?.error_code || "" });
    return json({ error: isEnglish ? "Writing service is temporarily unavailable." : "写作服务暂时不可用，请稍后重试。" }, 502);
  }
  const payload = await upstream.json().catch(() => ({}));
  const result = String(payload?.choices?.[0]?.message?.content || "").trim().slice(0, 12000);
  if (!result) return json({ error: isEnglish ? "The writing model returned no text." : "写作模型没有返回文字。" }, 502);
  return json({ text: result });
}
async function presentationRoute(request, env) {
  const { prompt = "", presentation = null, context = [], language = "zh", timeZone = "", imagePlan = false } = await request.json();
  const text = String(prompt).trim().slice(0, 8000);
  const isEnglish = language === "en";
  if (!text) return json({ error: isEnglish ? "Describe the presentation you want." : "请先描述你想做的演示文稿。" }, 400);
  if (!env.BAILIAN_API_KEY) return json({ error: isEnglish ? "AI service is not configured." : "AI 服务尚未连接。" }, 503);
  const current = safePresentation(presentation);
  const deckForModel = current ? { title: current.title, slides: current.slides.map(slide => ({ title: slide.title, bullets: slide.bullets, imagePrompt: slide.imagePrompt || "" })) } : null;
  const { when, zone } = clockFact(timeZone);
  const modelId = env.BAILIAN_MODEL || "qwen3.8-flash";
  const earlier = Array.isArray(context) ? context.slice(-6).map(item => `Instruction: ${String(item?.question || "").slice(0, 1500)}\nResult: ${String(item?.answer || "").slice(0, 2500)}`).join("\n\n") : "";
  const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const system = imagePlan
    ? "You write image prompts for an existing slide deck. Return JSON only: {\"title\":\"\",\"slides\":[{\"title\":\"\",\"bullets\":[\"\"],\"imagePrompt\":\"\"}]}. Copy the title, bullets, slide count, and order exactly. Do not rewrite the wording. imagePrompt is one short visual description for an image generator. It must not ask for words, letters, or captions inside the image. Never put 配图建议 or any image suggestion into bullets."
    : "You create presentation slide decks. Return JSON only: {\"title\":\"\",\"slides\":[{\"title\":\"\",\"bullets\":[\"\"],\"imagePrompt\":\"\"}]}. Each slide is one page, not an article. If the user asks for a number of pages, use exactly that number, from 1 to 20. Keep each title short. Use 3 to 5 short bullet points, one line each, never a paragraph. Write in the language the user requests. If they do not name a language, use the language of their request and of the current deck. Do not change language because of any interface setting. When a current deck is provided, revise that deck and keep slides the user did not ask to change. Return the full updated deck. Never write 配图建议, image suggestions, or image captions in bullets. imagePrompt is optional internal text and is not slide body. When the request depends on today, this year, this month, or another relative time, use the supplied current date and time. Do not invent a year.";
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      temperature: imagePlan ? 0.2 : 0.4,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Current date/time: ${when}\nUser timezone: ${zone || "not provided"}\n\nCurrent deck:\n${deckForModel ? JSON.stringify(deckForModel) : "(none)"}\n\nEarlier turns:\n${earlier || "(none)"}\n\nLatest instruction:\n${text}` }
      ]
    })
  });
  if (!upstream.ok) {
    const failure = await upstream.json().catch(() => ({}));
    console.error("Presentation request failed", { model: modelId, status: upstream.status, code: failure?.code || failure?.error_code || "" });
    return json({ error: isEnglish ? "Presentation service is temporarily unavailable." : "演示文稿服务暂时不可用，请稍后重试。" }, 502);
  }
  const payload = await upstream.json().catch(() => ({}));
  const raw = String(payload?.choices?.[0]?.message?.content || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let parsed = {};
  try { if (start >= 0 && end > start) parsed = JSON.parse(raw.slice(start, end + 1)); } catch { parsed = {}; }
  const deck = safePresentation(parsed);
  if (!deck) return json({ error: isEnglish ? "The presentation model returned no slides." : "演示模型没有返回分页内容。" }, 502);
  return json({ presentation: deck });
}
const videoModel = "wan3.0-video";
const videoGenerationRequest = { resolution: "720P", duration: 5, ratio: "adaptive", prompt_extend: false, watermark: false };
const videoEditRequest = { resolution: "720P", duration: 5, ratio: "adaptive", prompt_extend: true, watermark: false };
const videoCreditOperation = "video_generate";
const videoEditOperation = "video_edit";
const referenceVideoKeyPattern = /^original\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]+\.(?:mp4|mov)$/i;
const videoPathPattern = /^video\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]+\.mp4$/i;
const safeVideo = value => {
  const taskId = String(value?.taskId || "").slice(0, 80);
  const path = String(value?.path || "");
  const stored = value?.provider === "oss" && videoPathPattern.test(path);
  if (!stored && !/^[A-Za-z0-9-]{8,80}$/.test(taskId)) return undefined;
  const video = { taskId };
  if (stored) {
    video.provider = "oss";
    video.path = path;
    video.name = String(value?.name || "video.mp4").slice(0, 180);
    video.type = "video/mp4";
    video.kind = "generated";
  }
  return video;
};
const videoQuotaError = (code, message) => /quota|arrear|billing|overdue|insufficient|free.?quota|allocationquota|prepaid/i.test(`${code} ${message}`);
const videoModelError = (code, message) => /model.?not.?found|invalidmodel|unsupportedmodel|access.?denied|not.?authorized|does not exist/i.test(`${code} ${message}`);
function videoFailure(language, code, message) {
  const isEnglish = language === "en";
  if (videoQuotaError(code, message)) return json({ error: isEnglish ? "Video generation quota is currently unavailable." : "当前视频生成额度不可用。", code: "quota", status: "FAILED" }, 402);
  if (videoModelError(code, message)) return json({ error: isEnglish ? "wan3.0-video is not available in this Singapore workspace." : "当前新加坡工作区不能使用 wan3.0-video。请在百炼控制台确认该标准模型已开通。", code: "model", status: "FAILED" }, 403);
  const detail = String(message || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const safeDetail = detail && !/sk-|bearer|api[_-]?key/i.test(detail) ? detail : "";
  return json({ error: safeDetail ? (isEnglish ? `Video generation failed. ${safeDetail}` : `视频生成失败。${safeDetail}`) : (isEnglish ? "Video generation failed. You can try again." : "视频生成失败，可以重新生成。"), status: "FAILED" }, 502);
}
async function storeVideoTask(env, token, user, { projectId, title, locale, prompt, taskId, replace }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return "";
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const headers = { ...supabaseHeaders(env, token), Prefer: "return=representation" };
  const meta = { type: "project_meta", workspace: "video", intent: "video", task: String(prompt || "").slice(0, 2000) };
  const videoMessage = { question: String(prompt || "").slice(0, 8000), answer: "", video: { taskId: String(taskId || "").slice(0, 80) } };
  const language = locale === "en" ? "en" : "zh";
  const cleanTitle = String(title || prompt || "Untitled video").trim().slice(0, 120) || "Untitled video";
  const id = String(projectId || "");
  if (projectIdPattern.test(id)) {
    const existing = await fetch(`${base}/rest/v1/projects?select=id,conversation&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) });
    const rows = await existing.json().catch(() => []);
    if (!existing.ok || !rows[0]) return "";
    const oldMeta = Array.isArray(rows[0].conversation) ? rows[0].conversation.find(item => item?.type === "project_meta") : null;
    if (oldMeta?.historyHidden === true) meta.historyHidden = true;
    const prior = Array.isArray(rows[0].conversation) ? rows[0].conversation.filter(item => item?.type !== "project_meta" && item?.type !== "workspace_state") : [];
    if (replace && prior.length) prior[prior.length - 1] = videoMessage;
    else prior.push(videoMessage);
    const update = { locale: language, conversation: safeProjectConversation([meta, ...prior]), updated_at: new Date().toISOString() };
    if (String(title || "").trim()) update.title = String(title).trim().slice(0, 120);
    const updated = await fetch(`${base}/rest/v1/projects?id=eq.${id}&owner_id=eq.${user.id}&select=id`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(update)
    });
    const body = await updated.json().catch(() => []);
    return updated.ok && body[0]?.id ? body[0].id : "";
  }
  const created = await fetch(`${base}/rest/v1/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({ owner_id: user.id, title: cleanTitle, locale: language, conversation: safeProjectConversation([meta, videoMessage]) })
  });
  const body = await created.json().catch(() => []);
  const project = Array.isArray(body) ? body[0] : body;
  return created.ok && project?.id ? project.id : "";
}
const creditArgs = (operation, inputSeconds) => {
  const request = operation === videoEditOperation ? videoEditRequest : videoGenerationRequest;
  return {
    p_model: videoModel,
    p_operation: operation === videoEditOperation ? videoEditOperation : videoCreditOperation,
    p_resolution: request.resolution,
    p_input_seconds: inputSeconds,
    p_output_seconds: request.duration
  };
};
function durationFromMediaBytes(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  for (let index = 0; index + 24 < source.length; index += 1) {
    if (source[index] !== 0x6d || source[index + 1] !== 0x76 || source[index + 2] !== 0x68 || source[index + 3] !== 0x64) continue;
    const version = source[index + 4];
    let timescale = 0;
    let duration = 0;
    if (version === 0) {
      timescale = view.getUint32(index + 16);
      duration = view.getUint32(index + 20);
    } else if (version === 1 && index + 36 <= source.length) {
      timescale = view.getUint32(index + 24);
      duration = Number(view.getBigUint64(index + 28));
    }
    if (timescale < 1 || timescale > 1_000_000 || duration <= 0) continue;
    const seconds = duration / timescale;
    if (seconds >= 0.2 && seconds <= 120) return seconds;
  }
  return null;
}
function objectByteLength(response, received) {
  const match = /\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (match) return Number(match[1]);
  return response.status === 200 ? received : 0;
}
async function referenceDuration(env, path) {
  const url = await ossPresignedUrl(env, "GET", path, 600);
  const head = await fetch(url, { headers: { Range: "bytes=0-1048575" } });
  if (!head.ok && head.status !== 206) return null;
  const first = new Uint8Array(await head.arrayBuffer());
  const fromStart = durationFromMediaBytes(first);
  if (fromStart) return fromStart;
  const total = objectByteLength(head, first.byteLength);
  if (total > first.byteLength && total <= 80 * 1024 * 1024) {
    const start = Math.max(first.byteLength, total - 2097152);
    const tail = await fetch(url, { headers: { Range: `bytes=${start}-${total - 1}` } });
    if (tail.ok || tail.status === 206) {
      const fromTail = durationFromMediaBytes(new Uint8Array(await tail.arrayBuffer()));
      if (fromTail) return fromTail;
    }
    const full = await fetch(url);
    if (full.ok) return durationFromMediaBytes(new Uint8Array(await full.arrayBuffer()));
  }
  return null;
}
async function measureReferenceVideos(env, user, paths, isEnglish) {
  const unique = [...new Set((Array.isArray(paths) ? paths : []).map(path => String(path || "")))].filter(Boolean).slice(0, 5);
  if (!unique.length || unique.length > 5) return { ok: false, status: 400, error: isEnglish ? "The reference video could not be used. Video generation was not started." : "参考视频无法使用，没有开始生成视频。" };
  let total = 0;
  for (const path of unique) {
    if (!referenceVideoKeyPattern.test(path) || !path.startsWith(`original/${user.id}/`)) return { ok: false, status: 400, error: isEnglish ? "The reference video must be an MP4 or MOV saved for this account. Video generation was not started." : "参考视频必须是这个账号已保存的 MP4 或 MOV。没有开始生成视频。" };
    let seconds = null;
    try { seconds = await referenceDuration(env, path); }
    catch (error) { console.error("Reference video duration failed", { message: error instanceof Error ? error.message : "unknown" }); }
    if (!(seconds >= 1 && seconds <= 15)) return { ok: false, status: 400, error: isEnglish ? "The reference video must be an MP4 or MOV between 1 and 15 seconds. Video generation was not started." : "参考视频必须是 1 到 15 秒的 MP4 或 MOV。没有开始生成视频。" };
    total += seconds;
  }
  if (total > 15 || total + videoEditRequest.duration > 30) return { ok: false, status: 400, error: isEnglish ? "Reference videos together must be 15 seconds or less. Video generation was not started." : "参考视频合计不能超过 15 秒。没有开始生成视频。" };
  return { ok: true, seconds: Math.round(total * 1000) / 1000, paths: unique };
}
async function creditRpc(env, name, args) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { ok: false, code: "credits_unconfigured" };
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Credit ledger call failed", { name, status: response.status });
    return { ok: false, code: "credits_unavailable" };
  }
  return body && typeof body === "object" ? body : { ok: false, code: "credits_unavailable" };
}
function creditRefusal(isEnglish, quote) {
  if (quote.code === "insufficient") return json({
    error: isEnglish ? "Not enough credits. Video generation was not started." : "Credits 不足，没有开始生成视频。",
    code: "insufficient",
    balance: quote.balance,
    estimated: quote.credits,
    projected: quote.projected
  }, 402);
  if (quote.code === "in_progress") return json({
    error: isEnglish ? "That request is already being handled. It was not submitted again." : "这次请求已经在处理，没有重复提交。",
    code: "in_progress"
  }, 409);
  return json({
    error: isEnglish ? "Credits could not be confirmed. Video generation was not started." : "暂时无法确认 Credits，没有开始生成视频。",
    code: quote.code || "credits_unavailable"
  }, 503);
}
async function creditPreviewRoute(env, user, url) {
  const isEnglish = url.searchParams.get("language") === "en";
  const paths = url.searchParams.getAll("videoPath");
  let operation = videoCreditOperation;
  let inputSeconds = 0;
  if (paths.length) {
    const measured = await measureReferenceVideos(env, user, paths, isEnglish);
    if (!measured.ok) return json({ error: measured.error, code: "duration" }, measured.status || 400);
    operation = videoEditOperation;
    inputSeconds = measured.seconds;
  }
  const quote = await creditRpc(env, "credit_preview", { p_user_id: user.id, ...creditArgs(operation, inputSeconds) });
  if (!quote.ok) return creditRefusal(isEnglish, quote);
  return json({
    balance: quote.balance,
    estimated: quote.estimated,
    projected: quote.projected,
    sufficient: quote.sufficient === true,
    operation,
    inputSeconds,
    outputSeconds: operation === videoEditOperation ? videoEditRequest.duration : videoGenerationRequest.duration
  });
}
async function videoCreateRoute(request, env) {
  const { prompt = "", images = [], language = "zh", projectId = "", title = "", replace = false, idempotencyKey = "", referenceVideos = [] } = await request.json();
  const text = String(prompt).trim().slice(0, 5000);
  const isEnglish = language === "en";
  if (!text) return json({ error: isEnglish ? "Describe the video you want." : "请先描述你想制作的视频。" }, 400);
  const requestKey = String(idempotencyKey || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) return json({ error: isEnglish ? "The video request could not be started." : "视频请求无法开始。" }, 400);
  const user = await supabaseUser(env, bearerToken(request));
  if (!user) return json({ error: isEnglish ? "Please sign in to continue." : "请先登录后再生成视频。" }, 401);
  const host = imageHost(env.BAILIAN_WORKSPACE_ID);
  if (!env.BAILIAN_API_KEY || !host) return json({ error: isEnglish ? "Video service is not configured." : "视频服务尚未配置。" }, 503);
  const referencePaths = (Array.isArray(referenceVideos) ? referenceVideos : []).map(item => String(item?.path || "")).filter(Boolean);
  let operation = videoCreditOperation;
  let inputSeconds = 0;
  let acceptedReferences = [];
  if (referencePaths.length) {
    const measured = await measureReferenceVideos(env, user, referencePaths, isEnglish);
    if (!measured.ok) return json({ error: measured.error, code: "duration" }, measured.status || 400);
    operation = videoEditOperation;
    inputSeconds = measured.seconds;
    acceptedReferences = measured.paths;
  }
  const reserved = await creditRpc(env, "credit_reserve", { p_user_id: user.id, p_idempotency_key: requestKey, ...creditArgs(operation, inputSeconds) });
  if (!reserved.ok) return creditRefusal(isEnglish, reserved);
  if (!reserved.created) {
    if (reserved.task_id && (reserved.status === "reserved" || reserved.status === "posted")) return json({ taskId: reserved.task_id, status: "PENDING", model: videoModel, balance: reserved.balance, estimated: reserved.credits, replayed: true });
    if (reserved.status === "released" || reserved.status === "failed") return json({
      error: isEnglish ? "The previous request ended without a charge. Try once more." : "上一次请求已经结束，没有扣 Credits。请再试一次。",
      code: "retry"
    }, 409);
    return creditRefusal(isEnglish, { code: "in_progress" });
  }
  let releaseReservation = true;
  try {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const files = Array.isArray(images) ? images.slice(0, 4).filter(item => allowed.has(String(item?.type || "")) && /^data:image\/(jpeg|png|webp);base64,/i.test(String(item?.data || "")) && String(item.data).length <= 8_000_000) : [];
    let media = [];
    let parameters = videoGenerationRequest;
    if (operation === videoEditOperation) {
      media = [];
      for (const path of acceptedReferences) media.push({ type: "reference_video", url: await ossPresignedUrl(env, "GET", path, 3600) });
      files.forEach(item => media.push({ type: "reference_image", url: item.data }));
      parameters = videoEditRequest;
    } else media = files.length === 1 ? [{ type: "first_frame", url: files[0].data }] : files.map(item => ({ type: "reference_image", url: item.data }));
    const response = await fetch(`https://${host}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json", "X-DashScope-Async": "enable" },
      body: JSON.stringify({
        model: videoModel,
        input: media.length ? { prompt: text, media } : { prompt: text },
        parameters
      })
    });
    const payload = await response.json().catch(() => ({}));
    const output = payload.output || {};
    const code = String(output.code || payload.code || "");
    const message = String(output.message || payload.message || "");
    if (!response.ok || !output.task_id) {
      console.error("Video task create failed", { status: response.status, code });
      return videoFailure(language, code, message);
    }
    const taskId = String(output.task_id);
    const attached = await creditRpc(env, "credit_attach_task", { p_user_id: user.id, p_idempotency_key: requestKey, p_task_id: taskId });
    if (!attached.ok) return json({ error: isEnglish ? "Credits could not be confirmed. Video generation was not started." : "暂时无法确认 Credits，没有开始生成视频。", code: "credits_unavailable" }, 502);
    releaseReservation = false;
    let savedProjectId = "";
    try {
      savedProjectId = await storeVideoTask(env, bearerToken(request), user, { projectId, title, locale: language, prompt: text, taskId, replace: Boolean(replace) });
    } catch (error) {
      console.error("Video task project save failed", { message: error instanceof Error ? error.message : "unknown" });
    }
    return json({ taskId, status: String(output.task_status || "PENDING"), model: videoModel, projectId: savedProjectId, balance: reserved.balance, estimated: reserved.credits });
  } finally {
    if (releaseReservation) {
      try { await creditRpc(env, "credit_release", { p_idempotency_key: requestKey, p_user_id: user.id }); }
      catch (error) { console.error("Credit release failed", { message: error instanceof Error ? error.message : "unknown" }); }
    }
  }
}
async function videoTaskRoute(request, env, url) {
  const taskId = String(url.searchParams.get("id") || "");
  const language = url.searchParams.get("language") === "en" ? "en" : "zh";
  if (!/^[A-Za-z0-9-]{8,80}$/.test(taskId)) return json({ error: language === "en" ? "Invalid video task." : "视频任务无效。" }, 400);
  const host = imageHost(env.BAILIAN_WORKSPACE_ID);
  if (!env.BAILIAN_API_KEY || !host) return json({ error: language === "en" ? "Video service is not configured." : "视频服务尚未配置。" }, 503);
  const response = await fetch(`https://${host}/api/v1/tasks/${taskId}`, { headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}` } });
  const payload = await response.json().catch(() => ({}));
  const output = payload.output || {};
  const status = String(output.task_status || "");
  const code = String(output.code || payload.code || "");
  const message = String(output.message || payload.message || "");
  if (!response.ok && !status) {
    console.error("Video task query failed", { status: response.status, code });
    return videoFailure(language, code, message);
  }
  if (status === "SUCCEEDED") {
    const videoUrl = String(output.video_url || "");
    if (!/^https:\/\//i.test(videoUrl)) {
      await creditRpc(env, "credit_release", { p_task_id: taskId });
      return json({ error: language === "en" ? "The video result had no file." : "视频结果里没有文件。", status: "FAILED" }, 502);
    }
    await creditRpc(env, "credit_settle", { p_task_id: taskId });
    return json({ taskId, status, videoUrl, model: videoModel });
  }
  if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
    console.error("Video task failed", { status, code });
    await creditRpc(env, "credit_release", { p_task_id: taskId });
    return videoFailure(language, code, message);
  }
  return json({ taskId, status: status || "PENDING", model: videoModel });
}
async function videoMediaRoute(request, env, token, user, url) {
  if (!ossConfigured(env)) return json({ error: "Private OSS storage is not configured yet." }, 503);
  if (request.method === "GET") {
    const path = String(url.searchParams.get("path") || "");
    if (!videoPathPattern.test(path) || !path.startsWith(`video/${user.id}/`)) return json({ error: "Media not found." }, 404);
    try { return json({ url: await ossPresignedUrl(env, "GET", path, 3600), provider: "oss", path }); }
    catch (error) { console.error("Video signing failed", { message: error instanceof Error ? error.message : "unknown" }); return json({ error: "Private video preview is temporarily unavailable." }, 502); }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { projectId, url: source = "", taskId = "" } = await request.json();
  const id = String(projectId || "");
  let remoteUrl;
  try { remoteUrl = new URL(String(source)); } catch { return json({ error: "Video address is not valid." }, 400); }
  if (remoteUrl.protocol !== "https:" || !/(^|\.)aliyuncs\.com$/i.test(remoteUrl.hostname)) return json({ error: "Video address is not valid." }, 400);
  if (!projectIdPattern.test(id)) return json({ error: "Invalid project identifier." }, 400);
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const owned = await fetch(`${base}/rest/v1/projects?select=id&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) });
  const projects = await owned.json().catch(() => []);
  if (!owned.ok || !projects[0]) return json({ error: "Project not found." }, 404);
  const remote = await fetch(remoteUrl);
  if (!remote.ok) return json({ error: "The video was created, but saving it failed. Reopen this project to retry the same task." }, 502);
  const bytes = await remote.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 80 * 1024 * 1024) return json({ error: "The generated video is too large to save." }, 400);
  const path = `video/${user.id}/${id}/${crypto.randomUUID()}.mp4`;
  try {
    const upload = await fetch(await ossPresignedUrl(env, "PUT", path, 600, "video/mp4"), { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes });
    if (!upload.ok) return json({ error: "Private video upload failed." }, 502);
  } catch (error) {
    console.error("Video upload failed", { message: error instanceof Error ? error.message : "unknown" });
    return json({ error: "Private video upload failed." }, 502);
  }
  return json({ video: { provider: "oss", path, name: "video.mp4", type: "video/mp4", kind: "generated", taskId: String(taskId || "").slice(0, 80) } });
}
const supabaseError = (body, status, action) => {
  const message = String(body?.msg || body?.error_description || body?.message || body?.error || "").trim();
  const code = String(body?.code || body?.error_code || "").trim();
  const detail = String(body?.details || body?.hint || "").trim();
  if (code === "PGRST205") return "Supabase 数据表 public.projects 尚未创建（PGRST205）。请在 Supabase SQL Editor 运行网站提供的会员数据库迁移文件。";
  if (/redirect/i.test(message)) return "Supabase rejected the confirmation return address. Please check the allowed Redirect URLs setting.";
  if (/rate limit|email.*rate/i.test(message)) return "Supabase email sending is temporarily rate-limited. Please wait a few minutes before trying again.";
  if (/email.*provider.*disabled|email.*not.*enabled/i.test(message)) return "Supabase Email/Password sign-in is not enabled in Authentication settings.";
  return `${message || `Supabase ${action} failed (HTTP ${status}).`}${detail ? ` — ${detail}` : ""}${code ? ` [${code}]` : ""}`;
};
const cookieValue = (request, name) => {
  const found = (request.headers.get("Cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
};
const bearerToken = request => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim() || cookieValue(request, "ai_supermall_session");
const sessionResponse = (body, accessToken, maxAge = 3600) => new Response(JSON.stringify(body), {
  status: 200,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Set-Cookie": `ai_supermall_session=${encodeURIComponent(accessToken)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  }
});

async function supabaseUser(env, token) {
  if (!token) return null;
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, { headers: supabaseHeaders(env, token) });
  return response.ok ? response.json() : null;
}

const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const safeProjectMedia = media => Array.isArray(media) ? media.slice(0, 10).map(normalizeMediaDescriptor).filter(validMediaDescriptor) : [];
const safeTextLayers = layers => Array.isArray(layers) ? layers.slice(0, 12).map(layer => ({
  id: String(layer?.id || crypto.randomUUID()).slice(0, 80), text: String(layer?.text || "").slice(0, 240),
  size: Math.max(14, Math.min(120, Number(layer?.size) || 34)), bold: Boolean(layer?.bold),
  color: /^#[0-9a-f]{6}$/i.test(String(layer?.color || "")) ? String(layer.color) : "#ffffff",
  align: ["left", "center", "right"].includes(layer?.align) ? layer.align : "center",
  position: ["top", "middle", "bottom"].includes(layer?.position) ? layer.position : "bottom"
})).filter(layer => layer.text) : [];
const safePresentation = value => {
  const slides = Array.isArray(value?.slides) ? value.slides.slice(0, 20).map(slide => {
    let imagePrompt = String(slide?.imagePrompt || "").trim().slice(0, 500);
    const bullets = Array.isArray(slide?.bullets) ? slide.bullets.slice(0, 8).map(item => String(item || "").trim()).map(item => {
      const suggestion = /^(?:配图建议|图片建议|建议配图|插图建议|image suggestion|suggested image)\s*[:：]\s*(.+)$/i.exec(item);
      if (!suggestion) return item.slice(0, 400);
      if (!imagePrompt) imagePrompt = suggestion[1].slice(0, 500);
      return "";
    }).filter(Boolean) : [];
    const image = normalizeMediaDescriptor(slide?.image);
    const stored = validMediaDescriptor(image) ? image : undefined;
    const next = { title: String(slide?.title || "").trim().slice(0, 180), bullets };
    if (imagePrompt) next.imagePrompt = imagePrompt;
    if (stored) next.image = stored;
    return next;
  }).filter(slide => slide.title || slide.bullets.length || slide.image) : [];
  if (!slides.length) return undefined;
  return { title: String(value?.title || "").trim().slice(0, 180), slides };
};
const safeProjectConversation = (items, options = {}) => {
  if (!Array.isArray(items)) return [];
  const state = items.find(item => item?.type === "workspace_state" && item?.workspace === "visual");
  const suppliedMeta = items.find(item => item?.type === "project_meta");
  const inferredWorkspace = state ? "visual" : ["visual", "video", "writing", "presentation", "knowledge"].includes(suppliedMeta?.workspace) ? suppliedMeta.workspace : "knowledge";
  const meta = {
    type: "project_meta",
    workspace: inferredWorkspace,
    intent: ["visual", "video", "writing", "presentation", "knowledge"].includes(suppliedMeta?.intent) ? suppliedMeta.intent : inferredWorkspace,
    task: String(suppliedMeta?.task || state?.task || "").slice(0, 2000)
  };
  if (suppliedMeta?.historyHidden === true || options.historyHidden === true) meta.historyHidden = true;
  const messages = items.filter(item => item?.type !== "workspace_state" && item?.type !== "project_meta").slice(-30).map(item => {
    const message = {
      question: String(item?.question || "").slice(0, 8000), answer: String(item?.answer || "").slice(0, 12000), images: safeProjectMedia(item?.images),
      generation: item?.generation?.provider === "bailian" ? { provider: "bailian", model: String(item.generation.model || "wan2.7-image").slice(0, 120), mode: item.generation.mode === "image_editing" ? "image_editing" : "text_to_image", inputImageCount: Math.max(0, Math.min(10, Number(item.generation.inputImageCount) || 0)), status: "completed" } : undefined
    };
    const presentation = safePresentation(item?.presentation);
    if (presentation) message.presentation = presentation;
    const video = safeVideo(item?.video);
    if (video) message.video = video;
    return message;
  });
  return state ? [{ type: "workspace_state", workspace: "visual", task: String(state.task || "").slice(0, 2000), status: state.status === "completed" ? "completed" : "editing", finalImage: normalizeMediaDescriptor(state.finalImage), uploads: safeProjectMedia(state.uploads), textLayers: safeTextLayers(state.textLayers) }, meta, ...messages] : [meta, ...messages];
};
const bytesFromDataUrl = value => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i.exec(String(value || ""));
  if (!match || !mediaTypes.has(match[1].toLowerCase())) return null;
  const raw = atob(match[2].replace(/\s/g, ""));
  if (raw.length > 20 * 1024 * 1024) return null;
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return { bytes, type: match[1].toLowerCase() };
};
const mediaExtension = type => type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : type === "video/mp4" ? "mp4" : type === "video/webm" ? "webm" : type === "video/quicktime" ? "mov" : "png";
const mediaPathFor = (userId, projectId, type) => `${userId}/${projectId}/${crypto.randomUUID()}.${mediaExtension(type)}`;
const signedStorageUrl = (base, signed) => /^https:\/\//i.test(signed) ? signed : `${base}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;

async function projectMediaRoute(request, env, token, user, url) {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  if (request.method === "GET") {
    const path = String(url.searchParams.get("path") || "");
    if (!path.startsWith(`${user.id}/`)) return json({ error: "Media not found." }, 404);
    const response = await fetch(`${base}/storage/v1/object/sign/project-media/${path}`, {
      method: "POST", headers: supabaseHeaders(env, token), body: JSON.stringify({ expiresIn: 3600 })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return json({ error: supabaseError(body, response.status, "media loading") }, response.status);
    const signed = String(body?.signedURL || body?.signedUrl || "");
    if (!signed) return json({ error: "Media signing failed." }, 502);
    return json({ url: signedStorageUrl(base, signed) });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await request.formData(), id = String(form.get("projectId") || ""), file = form.get("file"), kind = String(form.get("kind") || "") === "generated" ? "generated" : "reference";
    if (!projectIdPattern.test(id) || !(file instanceof File) || !mediaTypes.has(file.type) || file.size > 20 * 1024 * 1024) return json({ error: "Please choose a JPG, PNG, or WEBP image under 20 MB." }, 400);
    const own = await fetch(`${base}/rest/v1/projects?select=id&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) }), projects = await own.json().catch(() => []);
    if (!own.ok || !projects[0]) return json({ error: "Project not found." }, 404);
    const path = mediaPathFor(user.id, id, file.type), upload = await fetch(`${base}/storage/v1/object/project-media/${path}`, { method: "POST", headers: { ...supabaseHeaders(env, token), "Content-Type": file.type, "x-upsert": "false" }, body: await file.arrayBuffer() });
    const body = await upload.json().catch(() => ({}));
    if (!upload.ok) return json({ error: supabaseError(body, upload.status, "media saving") }, upload.status);
    return json({ media: [{ clientId: String(form.get("clientId") || ""), path, name: String(file.name || `image.${mediaExtension(file.type)}`).slice(0, 180), type: file.type, kind }] });
  }
  const { projectId, media = [] } = await request.json();
  const id = String(projectId || "");
  if (!projectIdPattern.test(id)) return json({ error: "Invalid project identifier." }, 400);
  const own = await fetch(`${base}/rest/v1/projects?select=id&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) });
  const projects = await own.json().catch(() => []);
  if (!own.ok || !projects[0]) return json({ error: "Project not found." }, 404);
  const saved = [];
  for (const item of Array.isArray(media) ? media.slice(0, 20) : []) {
    let asset = bytesFromDataUrl(item?.data), type = asset?.type;
    if (!asset && /^https:\/\//i.test(String(item?.url || ""))) {
      const remote = await fetch(String(item.url));
      const remoteType = String(remote.headers.get("content-type") || "").split(";")[0].toLowerCase();
      const blob = remote.ok && mediaTypes.has(remoteType) ? await remote.arrayBuffer() : null;
      if (blob && blob.byteLength <= 20 * 1024 * 1024) asset = { bytes: new Uint8Array(blob), type: remoteType }, type = remoteType;
    }
    if (!asset || !type) return json({ error: "One image could not be saved. Please use a JPG, PNG, or WEBP image under 20 MB." }, 400);
    const path = mediaPathFor(user.id, id, type);
    const upload = await fetch(`${base}/storage/v1/object/project-media/${path}`, {
      method: "POST", headers: { ...supabaseHeaders(env, token), "Content-Type": type, "x-upsert": "false" }, body: asset.bytes
    });
    const body = await upload.json().catch(() => ({}));
    if (!upload.ok) return json({ error: supabaseError(body, upload.status, "media saving") }, upload.status);
    saved.push({ clientId: String(item?.clientId || ""), path, name: String(item?.name || `image.${mediaExtension(type)}`).slice(0, 180), type, kind: item?.kind === "generated" ? "generated" : "reference" });
  }
  return json({ media: saved });
}

async function ossMediaRoute(request, env, token, user, url) {
  if (!ossConfigured(env)) return json({ error: "Private OSS storage is not configured yet." }, 503);
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  if (request.method === "GET") {
    const provider = String(url.searchParams.get("provider") || ""), path = String(url.searchParams.get("path") || "");
    const ownedPath = ossObjectKeyPattern.test(path) || videoUploadKeyPattern.test(path);
    if (provider !== "oss" || !ownedPath || !path.startsWith(`original/${user.id}/`)) return json({ error: "Media not found." }, 404);
    if (url.searchParams.get("download") === "1" && videoUploadKeyPattern.test(path)) {
      try {
        const remote = await fetch(await ossPresignedUrl(env, "GET", path, 600));
        if (!remote.ok || !remote.body) return json({ error: "Private media preview is temporarily unavailable." }, 502);
        const type = path.toLowerCase().endsWith(".webm") ? "video/webm" : path.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4";
        return new Response(remote.body, { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
      } catch (error) {
        console.error("OSS media read failed", { message: error instanceof Error ? error.message : "unknown" });
        return json({ error: "Private media preview is temporarily unavailable." }, 502);
      }
    }
    try { return json({ url: await ossPresignedUrl(env, "GET", path, 3600), provider: "oss", path }); }
    catch (error) { console.error("OSS media signing failed", { message: error instanceof Error ? error.message : "unknown" }); return json({ error: "Private media preview is temporarily unavailable." }, 502); }
  }
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
    const head = {
      hasBoundary: /boundary=/i.test(request.headers.get("content-type") || ""),
      contentLength: request.headers.get("content-length"),
      bodyUsed: request.bodyUsed
    };
    let form;
    try {
      form = await request.formData();
      console.error("oss-media-diag", { step: "formData-ok", ...head });
    } catch (error) {
      console.error("oss-media-diag", { step: "formData-throw", ...head, errName: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
    const id = String(form.get("projectId") || ""), file = form.get("file"), kind = String(form.get("kind") || "") === "generated" ? "generated" : "reference";
    console.error("oss-media-diag", {
      step: "parsed",
      isFile: file instanceof File,
      isBlob: file instanceof Blob,
      size: file instanceof Blob ? file.size : null,
      type: file instanceof Blob ? String(file.type || "").slice(0, 40) : typeof file,
      nameLen: file instanceof File ? String(file.name || "").length : 0,
      projectIdOk: projectIdPattern.test(id)
    });
    const uploadedVideo = videoUploadTypes.has(file instanceof File ? file.type : "");
    const uploadLimit = uploadedVideo ? 80 * 1024 * 1024 : 20 * 1024 * 1024;
    if (!projectIdPattern.test(id) || !(file instanceof File) || !(mediaTypes.has(file.type) || uploadedVideo) || file.size > uploadLimit) return json({ error: uploadedVideo ? "Please choose an MP4, MOV, or WEBM video under 80 MB." : "Please choose a JPG, PNG, or WEBP image under 20 MB." }, 400);
    const owned = await fetch(`${base}/rest/v1/projects?select=id&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) });
    const projects = await owned.json().catch(() => []);
    if (!owned.ok || !projects[0]) return json({ error: "Project not found." }, 404);
    const path = ossObjectKeyFor(user.id, id, file.type, kind === "generated" ? "generated" : "original");
    try {
      const bytes = await file.arrayBuffer();
      console.error("oss-media-diag", { step: "arrayBuffer", byteLength: bytes.byteLength, declaredSize: file.size, reachedPut: true });
      const upload = await fetch(await ossPresignedUrl(env, "PUT", path, 600, file.type), { method: "PUT", headers: { "Content-Type": file.type }, body: bytes });
      if (!upload.ok) {
        const detail = (await upload.text().catch(() => "")).slice(0, 240);
        console.error("OSS server upload failed", { status: upload.status, detail });
        console.error("oss-media-diag", { step: "oss-put", ossStatus: upload.status, diag: "277" });
        return json({ error: `Private image upload failed (OSS HTTP ${upload.status}).`, diag: "277" }, 502);
      }
      return json({ media: { provider: "oss", path, name: String(file.name || `image.${mediaExtension(file.type)}`).slice(0, 180), type: file.type, kind } });
    } catch (error) {
      console.error("OSS server upload failed", { message: error instanceof Error ? error.message : "unknown" });
      console.error("oss-media-diag", { step: "put-catch", errName: error instanceof Error ? error.name : "unknown", diag: "282" });
      return json({ error: "Private image upload failed while sending the file to private storage.", diag: "282" }, 502);
    }
  }
  const { projectId, name, type, size, kind = "reference" } = await request.json().catch(() => ({}));
  const id = String(projectId || ""), cleanType = String(type || "").toLowerCase(), bytes = Number(size || 0);
  if (!projectIdPattern.test(id) || !mediaTypes.has(cleanType) || !Number.isFinite(bytes) || bytes <= 0 || bytes > 20 * 1024 * 1024) return json({ error: "Please choose a JPG, PNG, or WEBP image under 20 MB." }, 400);
  const owned = await fetch(`${base}/rest/v1/projects?select=id&id=eq.${id}&owner_id=eq.${user.id}`, { headers: supabaseHeaders(env, token) });
  const projects = await owned.json().catch(() => []);
  if (!owned.ok || !projects[0]) return json({ error: "Project not found." }, 404);
  const path = ossObjectKeyFor(user.id, id, cleanType, kind === "generated" ? "generated" : "original");
  try {
    return json({
      provider: "oss", path,
      uploadUrl: await ossPresignedUrl(env, "PUT", path, 600, cleanType),
      headers: { "Content-Type": cleanType },
      media: { provider: "oss", path, name: String(name || `image.${mediaExtension(cleanType)}`).slice(0, 180), type: cleanType, kind: kind === "generated" ? "generated" : "reference" }
    });
  } catch (error) {
    console.error("OSS upload authorization failed", { message: error instanceof Error ? error.message : "unknown" });
    return json({ error: "Private upload authorization is temporarily unavailable." }, 502);
  }
}

async function accountRoute(request, env, url) {
  const region = accountRegionFor(request, url);
  if (region !== "global" || !globalAccountReady(env)) return accountUnavailable(region);
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const path = url.pathname;
  if (path === "/api/account/health" && request.method === "GET") {
    const response = await fetch(`${base}/auth/v1/settings`, { headers: supabaseHeaders(env) });
    return json({ region: "global", connected: response.ok }, response.ok ? 200 : 502);
  }
  if (path === "/api/account/register" && request.method === "POST") {
    const { email, password } = await request.json();
    const cleanEmail = safeEmail(email), cleanPassword = safePassword(password);
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail) || cleanPassword.length < 8) return json({ error: "Use a valid email and a password of at least 8 characters." }, 400);
    const response = await fetch(`${base}/auth/v1/signup?redirect_to=${encodeURIComponent(`${url.origin}/account.html`)}`, {
      method: "POST", headers: supabaseHeaders(env),
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
    });
    const body = await response.json();
    if (!response.ok) return json({ error: supabaseError(body, response.status, "registration"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
    return json({ needsVerification: true, email: cleanEmail });
  }
  if (path === "/api/account/verify" && request.method === "POST") {
    const { email, code } = await request.json();
    const response = await fetch(`${base}/auth/v1/verify`, {
      method: "POST", headers: supabaseHeaders(env),
      body: JSON.stringify({ email: safeEmail(email), token: String(code || "").trim(), type: "signup" })
    });
    const body = await response.json();
    if (!response.ok) return json({ error: body.message || "The verification code is not valid." }, response.status);
    if (!body.session?.access_token) return json({ error: "Email verification succeeded, but no session was created. Please sign in." }, 200);
    return sessionResponse({ signedIn: true, email: safeEmail(email) }, body.session.access_token, body.session.expires_in || 3600);
  }
  if (path === "/api/account/session" && request.method === "POST") {
    const { email, password } = await request.json();
    const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: supabaseHeaders(env), body: JSON.stringify({ email: safeEmail(email), password: safePassword(password) })
    });
    const body = await response.json();
    if (!response.ok) return json({ error: body.error_description || body.message || "Email or password is incorrect." }, response.status);
    return sessionResponse({ signedIn: true, email: safeEmail(email) }, body.access_token, body.expires_in || 3600);
  }
  if (path === "/api/account/me" && request.method === "GET") {
    const user = await supabaseUser(env, bearerToken(request));
    if (!user) return json({ signedIn: false }, 401);
    return json({ signedIn: true, email: user.email || "" });
  }
  if (path === "/api/account/logout" && request.method === "POST") {
    return sessionResponse({ signedIn: false }, "", 0);
  }
  if (path === "/api/member/project-media") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    return projectMediaRoute(request, env, token, user, url);
  }
  if (path === "/api/member/video-media") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    return videoMediaRoute(request, env, token, user, url);
  }
  if (path === "/api/member/oss-media") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    return ossMediaRoute(request, env, token, user, url);
  }
  if (path === "/api/member/projects") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    if (request.method === "GET") {
      const projectId = url.searchParams.get("id");
      if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return json({ error: "Invalid project identifier." }, 400);
      const query = new URLSearchParams({ select: "id,title,locale,conversation,updated_at", order: "updated_at.desc" });
      query.set("owner_id", `eq.${user.id}`);
      if (projectId) query.set("id", `eq.${projectId}`);
      const response = await fetch(`${base}/rest/v1/projects?${query.toString()}`, { headers: supabaseHeaders(env, token) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project loading"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (projectId) return body[0] ? json(body[0]) : json({ error: "Project not found." }, 404);
      return json(body, response.status);
    }
    if (request.method === "POST") {
      const { title, locale = "zh", conversation = [] } = await request.json();
      const cleanTitle = String(title || "Untitled project").trim().slice(0, 120) || "Untitled project";
      const safeConversation = safeProjectConversation(conversation);
      const response = await fetch(`${base}/rest/v1/projects`, { method: "POST", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify({ owner_id: user.id, title: cleanTitle, locale: locale === "en" ? "en" : "zh", conversation: safeConversation }) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project saving"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      return json(body, response.status);
    }
    if (request.method === "PATCH") {
      const payload = await request.json();
      const { id, title, locale = "zh", conversation } = payload;
      const projectId = String(id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return json({ error: "Invalid project identifier." }, 400);
      const hideOnly = payload.historyHidden === true && !Array.isArray(conversation);
      let storedConversation = null;
      if (hideOnly || Array.isArray(conversation)) {
        const priorResponse = await fetch(`${base}/rest/v1/projects?id=eq.${projectId}&owner_id=eq.${user.id}&select=conversation`, { headers: supabaseHeaders(env, token) });
        const priorBody = await priorResponse.json().catch(() => []);
        if (!priorResponse.ok) return json({ error: supabaseError(priorBody, priorResponse.status, "project updating"), providerCode: String(priorBody?.code || priorBody?.error_code || priorResponse.status) }, priorResponse.status);
        if (!priorBody[0]) return json({ error: "Project not found." }, 404);
        storedConversation = Array.isArray(priorBody[0].conversation) ? priorBody[0].conversation : [];
      }
      if (hideOnly) {
        const next = storedConversation.map(item => item?.type === "project_meta" ? { ...item, historyHidden: true } : item);
        if (!next.some(item => item?.type === "project_meta")) next.unshift({ type: "project_meta", workspace: "knowledge", intent: "knowledge", task: "", historyHidden: true });
        const query = new URLSearchParams({ id: `eq.${projectId}`, owner_id: `eq.${user.id}`, select: "id,title,locale,conversation,updated_at" });
        const response = await fetch(`${base}/rest/v1/projects?${query.toString()}`, { method: "PATCH", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify({ conversation: next, updated_at: new Date().toISOString() }) });
        const body = await response.json();
        if (!response.ok) return json({ error: supabaseError(body, response.status, "project updating"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
        if (!body[0]) return json({ error: "Project not found." }, 404);
        return json(body[0], response.status);
      }
      const keepHistoryHidden = Boolean(payload.historyHidden === true || (storedConversation || []).find(item => item?.type === "project_meta")?.historyHidden === true);
      const safeConversation = Array.isArray(conversation) ? safeProjectConversation(conversation, { historyHidden: keepHistoryHidden }) : undefined;
      const query = new URLSearchParams({ id: `eq.${projectId}`, owner_id: `eq.${user.id}`, select: "id,title,locale,conversation,updated_at" });
      const update = { locale: locale === "en" ? "en" : "zh", updated_at: new Date().toISOString() };
      if (safeConversation) update.conversation = safeConversation;
      if (typeof title === "string" && title.trim()) update.title = title.trim().slice(0, 120);
      const response = await fetch(`${base}/rest/v1/projects?${query.toString()}`, { method: "PATCH", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify(update) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project updating"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (!body[0]) return json({ error: "Project not found." }, 404);
      return json(body[0], response.status);
    }
    if (request.method === "DELETE") {
      const projectId = String(url.searchParams.get("id") || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) return json({ error: "Invalid project identifier." }, 400);
      const query = new URLSearchParams({ id: `eq.${projectId}`, owner_id: `eq.${user.id}` });
      const response = await fetch(`${base}/rest/v1/projects?${query.toString()}`, { method: "DELETE", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" } });
      const body = await response.json().catch(() => []);
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project deleting"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (!Array.isArray(body) || !body[0]) return json({ error: "Project not found." }, 404);
      return json({ id: body[0].id });
    }
    return json({ error: "Method not allowed" }, 405);
  }
  if (path === "/api/member/conversations") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    if (request.method === "GET") {
      const conversationId = url.searchParams.get("id");
      if (conversationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) return json({ error: "Invalid conversation identifier." }, 400);
      const query = new URLSearchParams({ select: "id,title,locale,messages,updated_at", order: "updated_at.desc" });
      if (conversationId) query.set("id", `eq.${conversationId}`);
      const response = await fetch(`${base}/rest/v1/conversations?${query.toString()}`, { headers: supabaseHeaders(env, token) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "conversation loading"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (conversationId) return body[0] ? json(body[0]) : json({ error: "Conversation not found." }, 404);
      return json(body, response.status);
    }
    const safeMessages = items => Array.isArray(items) ? items.slice(-50).map(item => {
      const message = { question: String(item?.question || "").slice(0, 8000), answer: String(item?.answer || "").slice(0, 12000) };
      if (item?.workspace === "writing" || item?.workspace === "presentation" || item?.workspace === "video") message.workspace = item.workspace;
      const presentation = safePresentation(item?.presentation);
      if (presentation) message.presentation = presentation;
      const video = safeVideo(item?.video);
      if (video) message.video = video;
      return message;
    }) : [];
    if (request.method === "POST") {
      const { title, locale = "zh", messages = [] } = await request.json();
      const cleanTitle = String(title || "New conversation").trim().slice(0, 120) || "New conversation";
      const response = await fetch(`${base}/rest/v1/conversations`, { method: "POST", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify({ owner_id: user.id, title: cleanTitle, locale: locale === "en" ? "en" : "zh", messages: safeMessages(messages) }) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "conversation saving"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      return json(body, response.status);
    }
    if (request.method === "PATCH") {
      const { id, locale = "zh", messages = [] } = await request.json();
      const conversationId = String(id || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) return json({ error: "Invalid conversation identifier." }, 400);
      const query = new URLSearchParams({ id: `eq.${conversationId}`, select: "id,title,locale,messages,updated_at" });
      const response = await fetch(`${base}/rest/v1/conversations?${query.toString()}`, { method: "PATCH", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify({ locale: locale === "en" ? "en" : "zh", messages: safeMessages(messages), updated_at: new Date().toISOString() }) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "conversation updating"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (!body[0]) return json({ error: "Conversation not found." }, 404);
      return json(body[0], response.status);
    }
    if (request.method === "DELETE") {
      const conversationId = String(url.searchParams.get("id") || "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) return json({ error: "Invalid conversation identifier." }, 400);
      const query = new URLSearchParams({ id: `eq.${conversationId}`, owner_id: `eq.${user.id}` });
      const response = await fetch(`${base}/rest/v1/conversations?${query.toString()}`, { method: "DELETE", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" } });
      const body = await response.json().catch(() => []);
      if (!response.ok) return json({ error: supabaseError(body, response.status, "conversation deleting"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      if (!Array.isArray(body) || !body[0]) return json({ error: "Conversation not found." }, 404);
      return json({ id: body[0].id });
    }
    return json({ error: "Method not allowed" }, 405);
  }
  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/account/bootstrap") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const region = accountRegionFor(request, url);
      const globalReady = globalAccountReady(env);
      const chinaReady = Boolean(env.CN_AUTH_URL && env.CN_AUTH_PUBLISHABLE_KEY);
      return json({ region, ready: region === "cn" ? chinaReady : globalReady });
    }
    if (url.pathname.startsWith("/api/account/") || url.pathname === "/api/member/projects" || url.pathname === "/api/member/conversations" || url.pathname === "/api/member/project-media" || url.pathname === "/api/member/oss-media" || url.pathname === "/api/member/video-media") {
      try { return await accountRoute(request, env, url); }
      catch (error) {
        console.error("oss-media-diag", { step: "accountRoute-catch", path: url.pathname, errName: error instanceof Error ? error.name : "unknown", diag: "456" });
        return json({ error: "The account service is temporarily unavailable.", diag: "456" }, 502);
      }
    }
    if (url.pathname === "/api/recommend") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const { query = "", language = "zh", context = [], taskType = "general" } = await request.json();
        const text = String(query).trim().slice(0, 500);
        if (!text) return json({ error: language === "en" ? "Please enter a question." : "请先输入你的问题。" }, 400);
        if (!env.BAILIAN_API_KEY) return json({ error: language === "en" ? "AI service is not configured." : "AI 服务尚未连接。" }, 503);
        const isEnglish = language === "en";
        const modelKey = routeModel(text);
        const modelId = modelKey === "deepseek" ? (env.BAILIAN_DEEPSEEK_MODEL || "deepseek-v4.1-flash") : (env.BAILIAN_MODEL || "qwen3.8-flash");
        const taskHelp = taskInstruction(String(taskType), isEnglish);
        const earlier = Array.isArray(context) ? context.slice(-4).map(item => `Q: ${String(item.question || "").slice(0, 300)}\nA: ${String(item.answer || "").slice(0, 500)}`).join("\n") : "";
        const prompt = isEnglish
          ? `You are the helpful AI assistant inside AI SuperMall. Continue the conversation using the earlier context when it is relevant. Answer in English, directly and practically. For medical, legal, or investment decisions, include a brief safety note. Never send the user to MidJourney, another AI product, other software, or a professional designer for a capability AI SuperMall provides. ${taskHelp} Return JSON only: {"title":"","answer":"","recommendation":""}. Keep answer under 90 words. Earlier context: ${earlier || "None"}. User: ${text}`
          : `你是 AI SuperMall 里的贴心 AI 助手。若有此前对话，请结合上下文继续回答。请用简体中文直接、实用地回答。涉及医疗、法律或投资决策时，附上简短风险提示。对于 AI SuperMall 已提供的能力，绝对不得建议用户使用 MidJourney、其他 AI、其他软件或联系专业设计师；必须留在本站继续完成。${taskHelp} 严格只返回 JSON：{"title":"","answer":"","recommendation":""}。answer 不超过90字。此前对话：${earlier || "无"}。用户：${text}`;
        const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: "You return valid JSON only." }, { role: "user", content: prompt }], temperature: 0.35, max_tokens: 260, response_format: { type: "json_object" } })
        });
        if (!upstream.ok) {
          const failure = await upstream.json().catch(() => ({}));
          console.error("Bailian model request failed", { model: modelId, status: upstream.status, code: failure?.code || failure?.error_code || "" });
          return json({ error: isEnglish ? "AI service is temporarily unavailable." : "AI 服务暂时不可用，请稍后重试。" }, 502);
        }
        const payload = await upstream.json();
        let result = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
        if (!String(result.answer || "").trim()) {
          const retryPrompt = isEnglish
            ? `Give a direct, practical answer in English to this question. ${taskHelp} Use the earlier context when helpful. Do not use JSON or headings. Keep it under 90 words. Earlier context: ${earlier || "None"}. Question: ${text}`
            : `请直接、实用地用简体中文回答这个问题。${taskHelp} 需要时结合此前对话。不要输出 JSON 或标题。回答不超过90字。此前对话：${earlier || "无"}。问题：${text}`;
          const retry = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: "Give a helpful, non-empty answer." }, { role: "user", content: retryPrompt }], temperature: 0.35, max_tokens: 260 })
          });
          if (retry.ok) {
            const retryPayload = await retry.json();
            const answer = String(retryPayload.choices?.[0]?.message?.content || "").trim();
            if (answer) result = { title: result.title || text, answer, recommendation: result.recommendation || "" };
          }
        }
        return json(result);
      } catch (error) {
        console.error("Bailian model request error", { message: error instanceof Error ? error.message : String(error) });
        return json({ error: "AI service is temporarily unavailable." }, 502);
      }
    }
    if (url.pathname === "/api/member/credits" && request.method === "GET") {
      const user = await supabaseUser(env, bearerToken(request));
      if (!user) return json({ error: "Please sign in to continue." }, 401);
      try { return await creditPreviewRoute(env, user, url); }
      catch (error) { console.error("Credit preview failed", { message: error instanceof Error ? error.message : "unknown" }); return json({ error: "Credits could not be confirmed." }, 503); }
    }
    if (url.pathname === "/api/video/generate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try { return await videoCreateRoute(request, env); }
      catch (error) { console.error("Video create error", { message: error instanceof Error ? error.message : String(error) }); return json({ error: "Video generation failed. You can try again.", status: "FAILED" }, 502); }
    }
    if (url.pathname === "/api/video/task") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try { return await videoTaskRoute(request, env, url); }
      catch (error) { console.error("Video task error", { message: error instanceof Error ? error.message : String(error) }); return json({ error: "The video task could not be checked.", status: "FAILED" }, 502); }
    }
    if (url.pathname === "/api/presentation/generate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try { return await presentationRoute(request, env); }
      catch (error) { console.error("Presentation request error", { message: error instanceof Error ? error.message : String(error) }); return json({ error: "Presentation service is temporarily unavailable." }, 502); }
    }
    if (url.pathname === "/api/writing/generate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try { return await writingRoute(request, env); }
      catch (error) { console.error("Writing request error", { message: error instanceof Error ? error.message : String(error) }); return json({ error: "Writing service is temporarily unavailable." }, 502); }
    }
    if (url.pathname === "/api/visual/generate") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try { return await visualRoute(request, env); }
      catch (error) { console.error("Bailian image request error", { message: error instanceof Error ? error.message : String(error) }); return visualError("zh", "Image service is temporarily unavailable."); }
    }
    return env.ASSETS.fetch(request);
  }
};
