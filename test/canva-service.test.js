const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCanvaService(fetchImpl = async () => new Response('{}')) {
    const window = {};
    const context = vm.createContext({ window, URL, fetch: fetchImpl, console });
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/services/canva.js'), 'utf8');
    vm.runInContext(source, context);
    return window.CanvaService;
}

test('辨識 Canva 長網址與短網址', () => {
    const service = loadCanvaService();
    assert.equal(service.parsePublicUrl('https://canva.link/abc123').kind, 'short');
    assert.equal(service.parsePublicUrl('https://www.canva.com/design/DESIGN/TOKEN/view').kind, 'long');
    assert.equal(service.parsePublicUrl('https://example.com/design/a/b'), null);
});

test('預覽解析只呼叫標準 preview 端點', async () => {
    let requestedUrl = '';
    const service = loadCanvaService(async url => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            previewCount: 1,
            pages: [
                { page: 1, url: 'https://media.canva.com/one.png', quality: 'preview', width: 1024, height: 1024 },
                { page: 2, url: 'https://media.canva.com/two.png', quality: 'thumbnail', width: 447, height: 447 }
            ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const result = await service.resolvePages('https://worker.example.com/', 'https://canva.link/abc123');
    const parsed = new URL(requestedUrl);
    assert.equal(parsed.pathname, '/preview');
    assert.equal(parsed.searchParams.get('url'), 'https://canva.link/abc123');
    assert.equal(parsed.searchParams.has('mode'), false);
    assert.equal(result.pages.length, 2);
    assert.equal(result.pages[0].quality, 'preview');
});

test('服務錯誤會顯示 Worker 提供的訊息', async () => {
    const service = loadCanvaService(async () => new Response(JSON.stringify({ error: '連結不可見' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' }
    }));
    await assert.rejects(
        service.resolvePages('https://worker.example.com', 'https://canva.link/abc123'),
        /連結不可見/
    );
});
