from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse, quote
from html import escape
import json
import mimetypes
import os

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / '.env'
PORT = 3001

def settings():
    saved = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                saved[key.strip()] = value.strip()
    return saved

def save_key(key):
    data = settings()
    data['BAILIAN_API_KEY'] = key
    data.setdefault('BAILIAN_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1')
    data.setdefault('BAILIAN_MODEL', 'qwen3.8-flash')
    data.setdefault('PORT', '3000')
    ENV_FILE.write_text('\n'.join(f'{name}={value}' for name, value in data.items()) + '\n', encoding='utf-8')

class App(BaseHTTPRequestHandler):
    def answer(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:3000')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        count = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(min(count, 12000)).decode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:3000')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            data = self.read_json()
            if self.path == '/api/setup':
                key = str(data.get('apiKey', '')).strip()
                if len(key) < 10:
                    return self.answer(400, {'error': '请粘贴完整的百炼 API Key。'})
                save_key(key)
                return self.answer(200, {'ok': True})
            if self.path == '/api/recommend':
                query = str(data.get('query', '')).strip()[:500]
                config = settings()
                key = config.get('BAILIAN_API_KEY', '')
                if not query:
                    return self.answer(400, {'error': '请先说说你想完成什么。'})
                if not key or key.startswith('请把'):
                    return self.answer(400, {'error': 'AI 服务尚未连接。'})
                language = 'English' if data.get('language') == 'en' else '简体中文'
                prompt = (f'你是 AI SuperMall 的推荐顾问。用户说：{query}。请用 {language} 回答。'
                          '目标是帮助用户马上完成事情。严格只返回 JSON，不要 Markdown。'
                          '结构必须为 {"title":"","answer":"","recommendation":"","action":"marketing"或"explore"}。'
                          'answer 不超过80字，recommendation 不超过45字。只有明确涉及营销、推广、社交媒体文案、品牌宣传时 action 才使用 marketing。')
                base = config.get('BAILIAN_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').rstrip('/')
                request = Request(base + '/chat/completions', data=json.dumps({
                    'model': config.get('BAILIAN_MODEL', 'qwen3.8-flash'),
                    'messages': [{'role': 'system', 'content': 'You return valid JSON only.'}, {'role': 'user', 'content': prompt}],
                    'temperature': 0.45, 'max_tokens': 420, 'response_format': {'type': 'json_object'}
                }).encode('utf-8'), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
                try:
                    with urlopen(request, timeout=60) as response:
                        result = json.loads(response.read().decode('utf-8'))
                    return self.answer(200, json.loads(result['choices'][0]['message']['content']))
                except HTTPError as error:
                    detail = error.read().decode('utf-8', errors='replace')[:1000]
                    print(f'Bailian recommendation error {error.code}: {detail}', flush=True)
                    return self.answer(502, {'error': f'百炼请求失败（{error.code}）。请稍后重试。'})
            if self.path == '/api/marketing-plan':
                config = settings()
                key = config.get('BAILIAN_API_KEY', '')
                if not key or key.startswith('请把'):
                    return self.answer(400, {'error': '请先打开“连接百炼”页面并粘贴 API Key。'})
                business = str(data.get('business', '')).strip()[:240]
                product = str(data.get('product', '')).strip()[:240]
                if not business or not product:
                    return self.answer(400, {'error': '请填写业务名称和推广内容。'})
                language = 'English' if data.get('language') == 'en' else '简体中文'
                prompt = (f'你是资深营销内容策划。请为以下内容生成可直接使用的 {language} 营销方案：'
                          f'品牌/业务：{business}；推广对象：{data.get("product", "")}；'
                          f'渠道：{data.get("channel", "")}；语气：{data.get("tone", "")}。'
                          '严格只返回 JSON，不要 Markdown。结构必须为 '
                          '{"title":"","headline":"","caption":"","visual":""}。caption 不超过 120 字。')
                base = config.get('BAILIAN_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').rstrip('/')
                request = Request(base + '/chat/completions', data=json.dumps({
                    'model': config.get('BAILIAN_MODEL', 'qwen3.8-flash'),
                    'messages': [{'role': 'system', 'content': 'You return valid JSON only.'}, {'role': 'user', 'content': prompt}],
                    'temperature': 0.75, 'max_tokens': 700, 'response_format': {'type': 'json_object'}
                }).encode('utf-8'), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
                try:
                    with urlopen(request, timeout=60) as response:
                        result = json.loads(response.read().decode('utf-8'))
                except HTTPError as error:
                    detail = error.read().decode('utf-8', errors='replace')[:1000]
                    print(f'Bailian error {error.code}: {detail}', flush=True)
                    return self.answer(502, {'error': f'百炼请求失败（{error.code}）。请检查 API Key 或模型权限。'})
                return self.answer(200, json.loads(result['choices'][0]['message']['content']))
            return self.answer(404, {'error': 'Not found'})
        except Exception as error:
            return self.answer(500, {'error': str(error) or '服务暂时不可用，请稍后重试。'})

    def do_GET(self):
        if self.path.startswith('/search'):
            query = parse_qs(urlparse(self.path).query).get('q', [''])[0].strip()[:500]
            context = parse_qs(urlparse(self.path).query).get('context', [''])[0].strip()[-1400:]
            config = settings()
            key = config.get('BAILIAN_API_KEY', '')
            if not query:
                return self.search_page('请先输入你想完成的事情。', '', '')
            if not key or key.startswith('请把'):
                return self.search_page('AI 服务尚未连接。', '', '')
            catalog = json.loads((ROOT / 'ai-catalog.json').read_text(encoding='utf-8'))
            choices = '；'.join(f"{item['id']}={item['name']}（{','.join(item['skills'])}）" for item in catalog)
            prompt = (f'你是 AI SuperMall 的推荐顾问。此前对话：{context or "无"}。用户现在说：{query}。请用简体中文回答。'
                      f'你只能从以下工具中选择一个：{choices}。先给用户一个有帮助的初步答案。严格只返回 JSON，不要 Markdown。结构必须为 '
                      '{"title":"","answer":"","tool_id":"","category":"daily|creation|work|research|sensitive","resolved":true,"needs_live_data":false,"needs_specialist":false,"follow_up":"","reason":""}。answer 不超过120字，reason 不超过45字。'
                      '日常生活、做饭、健康常识、药物基础信息、股票基础知识、财报解读和投资分析框架等问题必须选择 qwen 或 deepseek，留在本站回答；药物回答须提醒用户遵医嘱或咨询药师，股票回答须说明不构成投资建议。')
            base = config.get('BAILIAN_BASE_URL', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1').rstrip('/')
            request = Request(base + '/chat/completions', data=json.dumps({
                'model': config.get('BAILIAN_MODEL', 'qwen3.8-flash'),
                'messages': [{'role': 'system', 'content': 'You return valid JSON only.'}, {'role': 'user', 'content': prompt}],
                'temperature': 0.45, 'max_tokens': 420, 'response_format': {'type': 'json_object'}
            }).encode('utf-8'), headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, method='POST')
            try:
                with urlopen(request, timeout=60) as response:
                    result = json.loads(response.read().decode('utf-8'))
                answer = json.loads(result['choices'][0]['message']['content'])
                selected = next((item for item in catalog if item['id'] == answer.get('tool_id')), next(item for item in catalog if item['id'] == 'qwen'))
                category_names = {'daily':'日常生活与普通问答','creation':'创作与营销','work':'工作与学习','research':'实时研究与资料核查','sensitive':'专业与高风险问题'}
                category = answer.get('category', 'daily')
                target = 'index.html?v=search-ready'
                if selected.get('internal'):
                    target = selected['url'] + '?task=' + quote(query)
                    label = '在本站开始制作 →'
                    recommendation = f"已识别为：{category_names.get(category, category_names['daily'])}。我们将为你在本站完成。"
                elif selected['id'] in ('qwen', 'deepseek'):
                    target = "javascript:document.getElementById('followup').scrollIntoView({behavior:'smooth'});document.querySelector('#followup input').focus();void(0)"
                    label = '继续追问 →'
                    recommendation = f"已识别为：{category_names.get(category, category_names['daily'])}。AI SuperMall 正在本站处理。"
                else:
                    label = '继续在 AI SuperMall 处理 →'
                    recommendation = f"已识别为：{category_names.get(category, category_names['daily'])}。我们正在为此任务准备合适的专业能力。"
                if answer.get('follow_up'):
                    recommendation += f" 下一步：{answer['follow_up']}"
                next_context = (context + '\n用户：' + query + '\n回答：' + answer.get('answer', ''))[-1400:]
                return self.search_page(answer.get('title', '为你找到下一步'), answer.get('answer', ''), recommendation, target, label, query, next_context)
            except Exception:
                return self.search_page('暂时无法生成建议，请稍后重试。', '', '')
        route = self.path.split('?', 1)[0]
        page = 'index.html' if route in ('/', '') else route.lstrip('/')
        if page in ('.env', '把百炼_API_Key_粘贴到这里.txt'):
            self.send_error(403); return
        path = (ROOT / page).resolve()
        if ROOT not in path.parents and path != ROOT:
            self.send_error(403); return
        if not path.is_file():
            self.send_error(404); return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def search_page(self, title, answer, recommendation, target='index.html', label='返回首页', query='', context=''):
        body = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 推荐 · AI SuperMall</title><style>body{{margin:0;background:#f7f7f3;color:#161615;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;display:grid;min-height:100vh;place-items:center}}main{{width:min(620px,calc(100% - 40px));background:#fff;border:1px solid #deded7;border-radius:24px;padding:44px;box-shadow:0 24px 60px #1a1a1015}}.mark{{color:#ff5c4d;font-size:13px;letter-spacing:1px}}.question{{margin:14px 0 0;padding:10px 12px;background:#f5f5f1;border-radius:10px;color:#4f4f4a;font-size:14px;line-height:1.5}}h1{{font-size:38px;letter-spacing:-1.7px;margin:18px 0 13px}}p{{font-size:17px;line-height:1.75;color:#595954}}strong{{display:block;margin:25px 0;color:#161615;font-size:15px}}a{{display:inline-block;margin-top:8px;background:#ff5c4d;color:#fff;border-radius:13px;text-decoration:none;padding:14px 19px;font-weight:600}}.back{{background:transparent;color:#666;margin-left:8px}}</style><main><div class="mark">✦ AI SUPERMALL · RECOMMENDATION</div><div class="question">你的问题：{escape(str(query))}</div><h1>{escape(str(title))}</h1><p>{escape(str(answer))}</p><strong>{escape(str(recommendation))}</strong><a href="{escape(target)}">{escape(label)}</a><a class="back" href="index.html">重新搜索</a></main></html>'''.encode('utf-8')
        follow = f'''<form id="followup" action="/search" method="get" onsubmit="this.querySelector('button[type=submit]').textContent='正在回答…';this.querySelector('button[type=submit]').disabled=true" style="margin:25px 0 20px;padding:18px;background:#f5f5f1;border-radius:14px"><label style="display:block;font-weight:700;margin-bottom:9px">继续和 AI SuperMall 对话</label><div style="display:flex;gap:8px"><input id="followupInput" name="q" required placeholder="输入或说出你的下一句问题…" style="flex:1;padding:15px;border:1px solid #cfcfc8;border-radius:10px;font-size:15px"><button type="button" onclick="var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return alert('此浏览器暂不支持语音输入');var r=new R();r.lang=navigator.language.startsWith('zh')?'zh-CN':'en-US';r.onresult=function(e){{document.getElementById('followupInput').value=e.results[0][0].transcript}};r.start()" style="border:0;border-radius:10px;padding:13px;background:#fff;font-size:18px">◉</button><input type="hidden" name="context" value="{escape(context, quote=True)}"><button type="submit" style="border:0;border-radius:10px;padding:13px 18px;background:#171716;color:white;font-weight:700">发送</button></div></form>'''.encode('utf-8')
        body = body.replace(b'<strong>', follow + b'<strong>')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

print(f'AI SuperMall is ready: http://127.0.0.1:{PORT}/setup.html')
ThreadingHTTPServer(('127.0.0.1', PORT), App).serve_forever()
