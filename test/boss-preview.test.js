const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '../assets/css/app.css'), 'utf8');

test('一般介面提供老闆預覽入口', () => {
    assert.match(htmlSource, /id="boss-preview-btn"/);
    assert.match(htmlSource, /onclick="openBossPreview\(\)"/);
    assert.match(appSource, /searchParams\.set\('preview', 'boss'\)/);
    assert.match(appSource, /searchParams\.set\('date', dateStr\)/);
    assert.match(appSource, /searchParams\.set\('post', postId\)/);
});

test('老闆網址會啟用唯讀模式並同步目前日期與貼文', () => {
    assert.match(appSource, /PAGE_PARAMS\.get\('preview'\) === 'boss'/);
    assert.match(appSource, /document\.body\.classList\.add\('boss-preview'\)/);
    assert.match(appSource, /history\.replaceState\(null, '', buildBossPreviewUrl/);
    assert.match(appSource, /PAGE_PARAMS\.get\('date'\)/);
    assert.match(appSource, /PAGE_PARAMS\.get\('post'\)/);
});

test('老闆模式隱藏修改與同步入口', () => {
    for (const selector of ['.ghost-github', '.present-btn', '.day-col-add', '#editor-ui', '#quickadd-overlay', '#publish-overlay', '#canva-tool-overlay']) {
        assert.ok(cssSource.includes(`body.boss-preview ${selector}`), `缺少唯讀隱藏規則：${selector}`);
    }
    assert.match(appSource, /async function syncToGitHub\(\) \{\n\s+if \(IS_BOSS_PREVIEW\)/);
    assert.match(appSource, /function updateCurrentPost\(field, value\) \{\n\s+if \(IS_BOSS_PREVIEW\) return/);
    assert.match(appSource, /function createNewPost\(\) \{\n\s+if \(IS_BOSS_PREVIEW\) return/);
});

test('老闆模式保留日期、貼文切換及雙平台 Canva 預覽', () => {
    assert.match(cssSource, /body\.boss-preview \.present-nav \{ display: flex/);
    assert.match(htmlSource, /class="dual-platform-preview"/);
    assert.match(htmlSource, /class="platform-preview-panel instagram-preview-panel"/);
    assert.match(htmlSource, /class="platform-preview-panel facebook-preview-panel"/);
    assert.match(htmlSource, /id="day-range-btn"/);
    assert.match(htmlSource, /id="prev-ig-media"/);
    assert.match(htmlSource, /id="prev-fb-media"/);
});

test('Instagram 與 Facebook 使用明顯不同的區域色彩', () => {
    assert.match(cssSource, /\.instagram-preview-panel \{ border-color: #DD6B92; background: #FFF1F5; \}/);
    assert.match(cssSource, /\.facebook-preview-panel \{ border-color: #1877F2; background: #EEF5FF; \}/);
    assert.match(cssSource, /\.instagram-heading \{ background: linear-gradient/);
    assert.match(cssSource, /\.facebook-heading \{ background: #1877F2; \}/);
});

test('Facebook 一般貼文鎖定第一張，圖文時間才保留完整圖組', () => {
    assert.match(appSource, /=== '圖文時間'/);
    assert.match(appSource, /firstCardOnly: !isFacebookGallery/);
    assert.match(appSource, /canvaSlideUrl\(embedUrl, 1\)/);
    assert.match(appSource, /實際發文僅使用第一張字卡/);
    assert.match(appSource, /「圖文時間」使用完整圖組/);
});
