const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

test('啟動時以 no-store 讀取公開 database.js', () => {
    assert.match(appSource, /new URL\('database\.js', location\.href\)/);
    assert.match(appSource, /cache:\s*'no-store'/);
    assert.match(appSource, /searchParams\.set\('_fresh'/);
});

test('公開資料更新在 GitHub Token 檢查之前執行', () => {
    const initStart = appSource.indexOf('async function initDatabase()');
    const publicFetch = appSource.indexOf('await fetchPublishedDatabase()', initStart);
    const tokenRead = appSource.indexOf("localStorage.getItem('gh_token')", initStart);
    assert.ok(initStart >= 0 && publicFetch > initStart);
    assert.ok(tokenRead > publicFetch);
});

test('時間相同時以已發布版本為準', () => {
    assert.match(appSource, /if \(remoteTime >= localTime\)/);
});
