const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCanvaService() {
    const window = {};
    const context = vm.createContext({ window, URL, console });
    const source = fs.readFileSync(path.join(__dirname, '../assets/js/services/canva.js'), 'utf8');
    vm.runInContext(source, context);
    return window.CanvaService;
}

test('辨識 Canva 長網址、短網址並拒絕其他網域', () => {
    const service = loadCanvaService();
    assert.equal(service.parsePublicUrl('https://canva.link/abc123').kind, 'short');
    assert.equal(service.parsePublicUrl('https://www.canva.com/design/DESIGN/TOKEN/view').kind, 'long');
    assert.equal(service.parsePublicUrl('https://example.com/design/a/b'), null);
    assert.equal(service.parsePublicUrl('http://www.canva.com/design/a/b/view'), null);
});

test('完整分享網址會轉成乾淨的 Canva 官方 embed 網址', () => {
    const service = loadCanvaService();
    const suppliedPublicUrl = 'https://www.canva.com/design/DAHQGHvfi-A/aKa_FAH8l28FL0kYu5d3QA/view?utm_content=DAHQGHvfi-A&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=h3c68affc26';
    const result = service.parseEmbedUrl(suppliedPublicUrl);
    assert.equal(result.designId, 'DAHQGHvfi-A');
    assert.equal(result.embedUrl, 'https://www.canva.com/design/DAHQGHvfi-A/aKa_FAH8l28FL0kYu5d3QA/view?embed');
});

test('頁碼 hash 會保留，短網址不會被假裝成可嵌入網址', () => {
    const service = loadCanvaService();
    assert.equal(
        service.parseEmbedUrl('https://www.canva.com/design/DESIGN/TOKEN/view#4').embedUrl,
        'https://www.canva.com/design/DESIGN/TOKEN/view?embed#4'
    );
    assert.equal(service.parseEmbedUrl('https://canva.link/abc123').embedUrl, '');
});

test('左側使用可互動 iframe，且沒有 Worker 或操作鎖定', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
    const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert.equal(appSource.includes("createElement('iframe')"), true);
    assert.equal(appSource.includes('toggleCanvaInteraction'), false);
    assert.equal(appSource.includes('resolveCanvaPages'), false);
    assert.equal(appSource.includes('canva_worker_url'), false);
    assert.equal(htmlSource.includes('操作 Canva'), false);
    assert.equal(htmlSource.includes('Cloudflare Worker'), false);
});
