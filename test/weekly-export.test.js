const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WeeklyExportService = require('../assets/js/services/weekly-export.js');

const htmlSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '../assets/css/app.css'), 'utf8');

const database = {
    '2026-10-19': [
        { _id: 'late', time: '20:00', theme: '晚上多讀一點點', title: '外面是夏天' },
        { _id: 'early', time: '08:00', theme: '早上只讀一點點', title: '一次又一次又一次地重新開始' },
        { _id: 'middle', time: '18:00', theme: '圖文時間', title: '幸福就是吃飯睡覺等待 vol.4' }
    ],
    '2026-10-21': [
        { _id: 'caption-only', time: '09:00', caption: '<div>舊資料的第一行</div><div>正文</div>' }
    ]
};

test('任一天都換算成該週星期一至星期日', () => {
    assert.equal(WeeklyExportService.getWeekStart('2026-10-19'), '2026-10-19');
    assert.equal(WeeklyExportService.getWeekStart('2026-10-25'), '2026-10-19');
    const result = WeeklyExportService.buildWeek(database, '2026-10-22');
    assert.equal(result.startDate, '2026-10-19');
    assert.equal(result.endDate, '2026-10-25');
    assert.equal(result.days.length, 7);
});

test('依發布時間排序並輸出結構化主題與書名', () => {
    const result = WeeklyExportService.buildWeek(database, '2026-10-19');
    const monday = result.days[0].lines;
    assert.deepEqual(monday, [
        '【早上只讀一點點】 《一次又一次又一次地重新開始》',
        '【圖文時間】 《幸福就是吃飯睡覺等待 vol.4》',
        '【晚上多讀一點點】 《外面是夏天》'
    ]);
    assert.ok(result.text.indexOf(monday[0]) < result.text.indexOf(monday[2]));
});

test('輸出包含七個星期標題及無貼文標記', () => {
    const result = WeeklyExportService.buildWeek(database, '2026-10-19');
    for (const weekday of WeeklyExportService.WEEKDAY_NAMES) assert.match(result.text, new RegExp(weekday));
    assert.match(result.text, /星期二\n（無貼文）/);
    assert.equal(result.postCount, 4);
    assert.equal(result.filename, '排版桌_週貼文_2026-10-19_至_2026-10-25.txt');
});

test('舊貼文缺少結構化欄位時使用第一行文字', () => {
    const result = WeeklyExportService.buildWeek(database, '2026-10-21', {
        getPlainText: html => html.replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '')
    });
    assert.equal(result.days[2].lines[0], '舊資料的第一行');
});

test('介面提供週切換、複製及 TXT 下載', () => {
    assert.match(htmlSource, /id="weekly-export-btn"[^>]+onclick="openWeeklyExport\(\)"/);
    assert.match(htmlSource, /id="weekly-export-output"[^>]+readonly/);
    assert.match(htmlSource, /onclick="changeWeeklyExportWeek\(-1\)"/);
    assert.match(htmlSource, /onclick="changeWeeklyExportWeek\(1\)"/);
    assert.match(htmlSource, /onclick="copyWeeklyExport\(\)"/);
    assert.match(htmlSource, /onclick="downloadWeeklyExport\(\)"/);
    assert.match(appSource, /WeeklyExportService\.buildWeek\(db, weeklyExportAnchorDate/);
    assert.match(appSource, /new Blob\(\[`\\uFEFF\$\{currentWeeklyExport\.text\}`\]/);
    assert.match(cssSource, /\.weekly-export-modal/);
});

test('老闆預覽不顯示匯出管理功能', () => {
    assert.match(cssSource, /body\.boss-preview \.weekly-export-entry/);
    assert.match(appSource, /function openWeeklyExport\(\) \{\n\s+if \(IS_BOSS_PREVIEW\) return/);
});
