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
    const response = await fetch(`${base}/auth/v1/signup`, {
      method: "POST", headers: supabaseHeaders(env),
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword, email_redirect_to: `${url.origin}/account.html` })
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
  if (path === "/api/account/confirm-session" && request.method === "POST") {
    const token = bearerToken(request);
    const user = await supabaseUser(env, token);
    if (!user) return json({ error: "The confirmation link is invalid or has expired. Please sign in with your email and password." }, 401);
    return sessionResponse({ signedIn: true, email: user.email || "" }, token);
  }
  if (path === "/api/account/me" && request.method === "GET") {
    const user = await supabaseUser(env, bearerToken(request));
    if (!user) return json({ signedIn: false }, 401);
    return json({ signedIn: true, email: user.email || "" });
  }
  if (path === "/api/account/logout" && request.method === "POST") {
    return sessionResponse({ signedIn: false }, "", 0);
  }
  if (path === "/api/member/projects") {
    const token = bearerToken(request), user = await supabaseUser(env, token);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    if (request.method === "GET") {
      const response = await fetch(`${base}/rest/v1/projects?select=id,title,locale,conversation,updated_at&order=updated_at.desc`, { headers: supabaseHeaders(env, token) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project loading"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      return json(body, response.status);
    }
    if (request.method === "POST") {
      const { title, locale = "zh", conversation = [] } = await request.json();
      const cleanTitle = String(title || "Untitled project").trim().slice(0, 120) || "Untitled project";
      const safeConversation = Array.isArray(conversation) ? conversation.slice(-30).map(item => ({ question: String(item?.question || "").slice(0, 1000), answer: String(item?.answer || "").slice(0, 2000) })) : [];
      const response = await fetch(`${base}/rest/v1/projects`, { method: "POST", headers: { ...supabaseHeaders(env, token), "Prefer": "return=representation" }, body: JSON.stringify({ owner_id: user.id, title: cleanTitle, locale: locale === "en" ? "en" : "zh", conversation: safeConversation }) });
      const body = await response.json();
      if (!response.ok) return json({ error: supabaseError(body, response.status, "project saving"), providerCode: String(body?.code || body?.error_code || response.status) }, response.status);
      return json(body, response.status);
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
    if (url.pathname.startsWith("/api/account/") || url.pathname === "/api/member/projects") {
      try { return await accountRoute(request, env, url); }
      catch { return json({ error: "The account service is temporarily unavailable." }, 502); }
    }
    if (url.pathname === "/api/recommend") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const { query = "", language = "zh", context = [] } = await request.json();
        const text = String(query).trim().slice(0, 500);
        if (!text) return json({ error: language === "en" ? "Please enter a question." : "请先输入你的问题。" }, 400);
        if (!env.BAILIAN_API_KEY) return json({ error: language === "en" ? "AI service is not configured." : "AI 服务尚未连接。" }, 503);
        const isEnglish = language === "en";
        const earlier = Array.isArray(context) ? context.slice(-4).map(item => `Q: ${String(item.question || "").slice(0, 300)}\nA: ${String(item.answer || "").slice(0, 500)}`).join("\n") : "";
        const prompt = isEnglish
          ? `You are the helpful AI assistant inside AI SuperMall. Continue the conversation using the earlier context when it is relevant. Answer in English, directly and practically. For medical, legal, or investment decisions, include a brief safety note. Return JSON only: {"title":"","answer":"","recommendation":""}. Keep answer under 90 words. Earlier context: ${earlier || "None"}. User: ${text}`
          : `你是 AI SuperMall 里的贴心 AI 助手。若有此前对话，请结合上下文继续回答。请用简体中文直接、实用地回答。涉及医疗、法律或投资决策时，附上简短风险提示。严格只返回 JSON：{"title":"","answer":"","recommendation":""}。answer 不超过90字。此前对话：${earlier || "无"}。用户：${text}`;
        const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: env.BAILIAN_MODEL || "qwen3.8-flash", messages: [{ role: "system", content: "You return valid JSON only." }, { role: "user", content: prompt }], temperature: 0.35, max_tokens: 260, response_format: { type: "json_object" } })
        });
        if (!upstream.ok) return json({ error: isEnglish ? "AI service is temporarily unavailable." : "AI 服务暂时不可用，请稍后重试。" }, 502);
        const payload = await upstream.json();
        let result = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
        if (!String(result.answer || "").trim()) {
          const retryPrompt = isEnglish
            ? `Give a direct, practical answer in English to this question. Use the earlier context when helpful. Do not use JSON or headings. Keep it under 90 words. Earlier context: ${earlier || "None"}. Question: ${text}`
            : `请直接、实用地用简体中文回答这个问题。需要时结合此前对话。不要输出 JSON 或标题。回答不超过90字。此前对话：${earlier || "无"}。问题：${text}`;
          const retry = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: env.BAILIAN_MODEL || "qwen3.8-flash", messages: [{ role: "system", content: "Give a helpful, non-empty answer." }, { role: "user", content: retryPrompt }], temperature: 0.35, max_tokens: 260 })
          });
          if (retry.ok) {
            const retryPayload = await retry.json();
            const answer = String(retryPayload.choices?.[0]?.message?.content || "").trim();
            if (answer) result = { title: result.title || text, answer, recommendation: result.recommendation || "" };
          }
        }
        return json(result);
      } catch (error) {
        return json({ error: "AI service is temporarily unavailable." }, 502);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
