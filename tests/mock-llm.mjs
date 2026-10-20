/*
 * 本地 mock OpenAI 兼容服务：用于端到端验证扩展的 LLM 链路（流式 + 非流式）。
 */
import http from 'node:http';

const PACK = {
  title: '雨夜霓虹剑士',
  positive:
    '1girl, solo, silver hair, long hair, red eyes, sword, black coat, standing, rain, neon lights, night city, cinematic lighting, backlighting, cowboy shot, artist:wlop',
  negative: 'lowres, bad hands, extra fingers',
  characters: ['1girl, silver hair, red eyes, black coat'],
  notes: 'mock 服务返回的示例方案。'
};

const SSE_TEXT =
  '```json\n' + JSON.stringify(PACK, null, 2) + '\n```\n\n这是 mock 服务返回的方案：雨夜霓虹下的银发剑士，冷色逆光。';

function start(port = 8124) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, OPTIONS'
      });
      res.end();
      return;
    }
    if (!req.url || !req.url.includes('/chat/completions')) {
      res.writeHead(404).end('not found');
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload = {};
    try {
      payload = JSON.parse(body || '{}');
    } catch (e) {
      res.writeHead(400).end('bad json');
      return;
    }
    if (!payload.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'pong' } }]
        })
      );
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });
    const pieces = SSE_TEXT.match(/[\s\S]{1,12}/g) || [];
    for (const piece of pieces) {
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: piece } }] }) + '\n\n');
      await new Promise((r) => setTimeout(r, 8));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port }));
  });
}

export { start };

if (import.meta.url === `file://${process.argv[1]}`) {
  start(Number(process.argv[2]) || 8124).then(({ port }) => {
    console.log('mock llm listening on http://127.0.0.1:' + port);
  });
}
