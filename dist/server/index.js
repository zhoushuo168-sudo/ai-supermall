const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

const accountRegionFor = (request, url) => {
  const requested = url.searchParams.get("region");
  if (requested === "cn" || requested === "global") return requested;
  return request.headers.get("cf-ipcountry") === "CN" ? "cn" : "global";
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/account/bootstrap") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const region = accountRegionFor(request, url);
      const globalReady = Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
      const chinaReady = Boolean(env.CN_AUTH_URL && env.CN_AUTH_PUBLISHABLE_KEY);
      return json({ region, ready: region === "cn" ? chinaReady : globalReady });
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
