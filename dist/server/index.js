const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/recommend") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        const { query = "", language = "zh" } = await request.json();
        const text = String(query).trim().slice(0, 500);
        if (!text) return json({ error: language === "en" ? "Please enter a question." : "请先输入你的问题。" }, 400);
        if (!env.BAILIAN_API_KEY) return json({ error: language === "en" ? "AI service is not configured." : "AI 服务尚未连接。" }, 503);
        const isEnglish = language === "en";
        const prompt = isEnglish
          ? `You are the helpful AI assistant inside AI SuperMall. Answer the user's question in English. Give a direct, practical first response. For medical, legal, or investment decisions, include a brief safety note. Return JSON only: {"title":"","answer":"","recommendation":""}. Keep answer under 90 words. User: ${text}`
          : `你是 AI SuperMall 里的贴心 AI 助手。请用简体中文直接、实用地回答用户的问题。涉及医疗、法律或投资决策时，附上简短风险提示。严格只返回 JSON：{"title":"","answer":"","recommendation":""}。answer 不超过90字。用户：${text}`;
        const base = (env.BAILIAN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
        const upstream = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.BAILIAN_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: env.BAILIAN_MODEL || "qwen3.8-flash", messages: [{ role: "system", content: "You return valid JSON only." }, { role: "user", content: prompt }], temperature: 0.35, max_tokens: 260, response_format: { type: "json_object" } })
        });
        if (!upstream.ok) return json({ error: isEnglish ? "AI service is temporarily unavailable." : "AI 服务暂时不可用，请稍后重试。" }, 502);
        const payload = await upstream.json();
        const result = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
        return json(result);
      } catch (error) {
        return json({ error: "AI service is temporarily unavailable." }, 502);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
