const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

test('啟動時只由程式重新驗證一次公開 database.js', () => {
    assert.match(appSource, /new URL\('database\.js', location\.href\)/);
    assert.match(appSource, /cache:\s*'no-store'/);
    assert.match(appSource, /If-None-Match/);
    assert.match(appSource, /planner_public_fingerprint/);
    assert.doesNotMatch(appSource, /searchParams\.set\('_fresh'/);
    assert.doesNotMatch(htmlSource, /<script\s+src=["']database\.js/);
});

test('公開資料更新在 GitHub Token 檢查之前執行', () => {
    const initStart = appSource.indexOf('async function initDatabase()');
    const publicFetch = appSource.indexOf('await fetchPublishedDatabase(', initStart);
    const tokenRead = appSource.indexOf("localStorage.getItem('gh_token')", initStart);
    assert.ok(initStart >= 0 && publicFetch > initStart);
    assert.ok(tokenRead > publicFetch);
});

test('公開資料可用時不會再透過 GitHub API 重複下載', () => {
    const initStart = appSource.indexOf('async function initDatabase()');
    const initEnd = appSource.indexOf('\n/* =============================================================\n   日期工具', initStart);
    const initSource = appSource.slice(initStart, initEnd);
    assert.match(initSource, /if \(!publishedAvailable && token && repo\)/);
});

test('沒有本機資料時不接受 304，避免只剩空白資料庫', () => {
    assert.match(appSource, /allowNotModified: Boolean\(indexedState\?\.db \|\| local\)/);
    assert.match(appSource, /const cachedEtag = allowNotModified/);
});

test('沒有資料變更時不寫入 IndexedDB', () => {
    assert.match(appSource, /persistedRevision >= dataRevision/);
    assert.doesNotMatch(appSource, /cloneJson\(db\)/);
    assert.match(appSource, /PERSIST_DEBOUNCE_MS = 550/);
});

test('文字輸入採合併存檔與延遲重畫', () => {
    assert.match(appSource, /TEXT_INPUT_FIELDS\.has\(field\)/);
    assert.match(appSource, /saveLocal\(\{ debounce: isTextInput/);
    assert.match(appSource, /if \(isTextInput\) scheduleDayRender\(\)/);
});

test('時間相同時以已發布版本為準', () => {
    assert.match(appSource, /if \(remoteTime >= localTime\)/);
});
