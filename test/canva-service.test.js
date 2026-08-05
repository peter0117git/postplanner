const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCanvaService(fetchImpl) {
    const window = {};
    const context = vm.createContext({
        window,
        URL,
        fetch: fetchImpl,
        setTimeout,
        Blob,
        console
    });
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/services/canva.js'), 'utf8');
    vm.runInContext(source, context);
    return window.CanvaService;
}

test('高清解析只有明確指定時才加入 mode=browser', async () => {
    let requestedUrl = '';
    const service = loadCanvaService(async url => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            mode: 'browser',
            browserPreviewCount: 2,
            browserMs: 1234,
            pages: [
                { page: 1, url: 'https://media.canva.com/one.png', quality: 'browser', width: 1080, height: 1350 },
                { page: 2, url: 'https://media.canva.com/two.png', quality: 'browser', width: 1080, height: 1350 }
            ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const result = await service.resolvePages(
        'https://worker.example.com/',
        'https://www.canva.com/design/DESIGN/TOKEN/view',
        { mode: 'browser' }
    );
    const parsed = new URL(requestedUrl);
    assert.equal(parsed.searchParams.get('mode'), 'browser');
    assert.equal(result.pages[0].quality, 'browser');
    assert.equal(result.browserPreviewCount, 2);
    assert.equal(result.browserMs, 1234);
});

test('一般解析不加入 Browser Run 參數', async () => {
    let requestedUrl = '';
    const service = loadCanvaService(async url => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
            pages: [{ page: 1, url: 'https://media.canva.com/one.png', quality: 'preview' }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await service.resolvePages('https://worker.example.com', 'https://canva.link/abc123');
    assert.equal(new URL(requestedUrl).searchParams.has('mode'), false);
});
