import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 3000);
const keyCardName = '把百炼_API_Key_粘贴到这里.txt';
const baseUrl = (process.env.BAILIAN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '');
const model = process.env.BAILIAN_MODEL || 'qwen3.8-flash';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 12_000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('无效请求')); } });
    req.on('error', reject);
  });
}

function clean(value) { return String(value || '').trim().slice(0, 240); }

async function getApiKey() {
  if (process.env.BAILIAN_API_KEY) return process.env.BAILIAN_API_KEY;
  try {
    const savedKey = (await readFile(join(process.cwd(), keyCardName), 'utf8')).trim();
    return savedKey.startsWith('请将') ? '' : savedKey;
  } catch { return ''; }
}

async function createPlan(data) {
  const business = clean(data.business), product = clean(data.product), channel = clean(data.channel), tone = clean(data.tone);
  if (!business || !product) throw new Error('请填写业务名称和推广内容。');
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('服务端尚未配置百炼 API Key。');
  const language = data.language === 'en' ? 'English' : '简体中文';
  const prompt = `你是资深营销内容策划。请为以下内容生成可直接使用的 ${language} 营销方案：品牌/业务：${business}；推广对象：${product}；渠道：${channel}；语气：${tone}。严格只返回 JSON，不要 Markdown。结构必须为 {"title":"","headline":"","caption":"","visual":""}。caption 不超过 120 字，visual 是给设计师或图像生成器的明确视觉说明。`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: 'You return valid JSON only.' }, { role: 'user', content: prompt }], temperature: 0.75, max_tokens: 700, response_format: { type: 'json_object' } })
  });
  if (!response.ok) throw new Error(`百炼请求失败（${response.status}）。请检查 API Key、业务空间地址和模型权限。`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  try { return JSON.parse(text); } catch { throw new Error('百炼返回的内容格式异常，请重试。'); }
}

http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/marketing-plan') return send(res, 200, await createPlan(await readBody(req)));
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const requested = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0]);
    if (requested === '/.env' || requested === `/${keyCardName}`) return send(res, 403, 'Forbidden', 'text/plain');
    const file = normalize(join(process.cwd(), requested));
    if (!file.startsWith(process.cwd())) return send(res, 403, 'Forbidden', 'text/plain');
    const content = await readFile(file);
    return send(res, 200, content, mime[extname(file)] || 'application/octet-stream');
  } catch (error) {
    return send(res, error.message?.includes('请填写') ? 400 : 500, { error: error.message || '服务暂时不可用，请稍后重试。' });
  }
}).listen(port, () => console.log(`AI SuperMall running at http://localhost:${port}`));
