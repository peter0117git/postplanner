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

test('雙平台使用接近實際動態消息的固定尺寸', () => {
    assert.match(cssSource, /grid-template-columns: minmax\(0, 420px\) minmax\(0, 500px\)/);
    assert.match(cssSource, /\.instagram-preview-panel \{ width: 420px; max-width: 100%; \}/);
    assert.match(cssSource, /\.facebook-preview-panel \{ width: 500px; max-width: 100%; \}/);
});

test('Facebook 長文預設收起並提供顯示更多', () => {
    assert.match(htmlSource, /id="fb-more-trigger"[^>]+onclick="toggleFBExpand\(\)"/);
    assert.match(appSource, /let isFBExpanded = false/);
    assert.match(appSource, /plain\.slice\(0, 180\)/);
    assert.match(appSource, /fbMoreBtn\.innerText = '顯示更多'/);
    assert.match(appSource, /fbMoreBtn\.innerText = '收合'/);
    assert.match(appSource, /function toggleFBExpand\(\)/);
});

test('Facebook 一般貼文鎖定第一張，圖文時間由使用者設定張數', () => {
    assert.match(appSource, /=== '圖文時間'/);
    assert.match(appSource, /firstCardOnly: !isFacebookGallery/);
    assert.match(htmlSource, /id="edit-fb-image-count"[^>]+min="1" max="20"/);
    assert.match(appSource, /function getFBImageCount\(post\)/);
    assert.match(appSource, /facebookImageCount: fbImageCount/);
    assert.match(appSource, /const visibleCount = Math\.min\(collageCount, 5\)/);
    assert.match(appSource, /實際發文僅使用第一張字卡/);
    assert.match(appSource, /frame\.classList\.add\('fb-static-frame'\)/);
    assert.match(cssSource, /height: calc\(100% \+ 220px\); transform: translateY\(-50%\)/);
});

test('Facebook 依 2、3、4、5 張使用不同拼圖版型', () => {
    assert.match(appSource, /count === 2\) return '雙圖平分'/);
    assert.match(appSource, /count === 3\) return '一大兩小'/);
    assert.match(appSource, /count === 4\) return '四格網格'/);
    assert.match(appSource, /count === 5\) return '兩大三小'/);
    assert.match(cssSource, /\.fb-collage\.fb-count-2:not\(\.fb-ratio-16-9\)/);
    assert.match(cssSource, /\.fb-collage\.fb-count-2\.fb-ratio-16-9/);
    assert.match(cssSource, /\.fb-collage\.fb-count-3:not\(\.fb-ratio-16-9\) \.fb-tile-1/);
    assert.match(cssSource, /\.fb-collage\.fb-count-3\.fb-ratio-16-9 \.fb-tile-1/);
    assert.match(cssSource, /\.fb-collage\.fb-count-4/);
    assert.match(cssSource, /\.fb-collage\.fb-count-5/);
});

test('Facebook 超過五張時在第五格顯示剩餘張數', () => {
    assert.match(appSource, /collageCount > visibleCount/);
    assert.match(appSource, /overflow\.className = 'fb-overflow-count'/);
    assert.match(appSource, /overflow\.textContent = `\+\$\{collageCount - visibleCount\}`/);
    assert.match(cssSource, /\.fb-overflow-count/);
});

test('老闆預覽的 Canva 圖面不攔截垂直滾動且保留底部翻頁區', () => {
    assert.match(appSource, /function appendIGScrollShield\(container\)/);
    assert.match(appSource, /shield\.className = 'ig-scroll-shield'/);
    assert.match(cssSource, /\.ig-scroll-shield \{ display: none; position: absolute; inset: 0 0 76px/);
    assert.match(cssSource, /body\.boss-preview \.ig-scroll-shield \{ display: block; \}/);
});

test('預覽捲動採用合成與分批載入降低重繪', () => {
    assert.match(cssSource, /contain: layout paint style; content-visibility: auto/);
    assert.match(cssSource, /body\.boss-preview \.preview-pane[\s\S]+background-image: none/);
    assert.match(cssSource, /body\.preview-scrolling \.platform-preview-panel/);
    assert.match(appSource, /function setupPreviewScrollPerformance\(\)/);
    assert.match(appSource, /\{ passive: true \}/);
    assert.match(appSource, /requestIdleCallback\(load/);
    assert.match(appSource, /deferMs: pageNumber === 1 \? 0 : 300/);
});
