const test = require('node:test');
const assert = require('node:assert/strict');
const PlannerPerformance = require('../assets/js/services/performance.js');

function buildLargeDatabase() {
    const database = {};
    const base = new Date('2024-01-01T00:00:00Z');
    for (let day = 0; day < 800; day += 1) {
        const date = new Date(base);
        date.setUTCDate(base.getUTCDate() + day);
        const dateStr = date.toISOString().slice(0, 10);
        database[dateStr] = [];
        for (let index = 0; index < 5; index += 1) {
            database[dateStr].push({
                _id: `large-${day}-${index}`,
                time: `${String(8 + index * 3).padStart(2, '0')}:00`,
                ratio: '4-5',
                status: index % 3 === 0 ? 'published' : 'ready',
                theme: `主題 ${index}`,
                title: `效能測試書籍 ${day}-${index}`,
                canvaUrl: '',
                caption: `<div>【主題 ${index}】《效能測試書籍 ${day}-${index}》</div><div>${'這是一段測試貼文內容。'.repeat(18)}</div>`,
                createdAt: '2026-08-01T00:00:00.000Z',
                updatedAt: '2026-08-01T00:00:00.000Z'
            });
        }
    }
    return database;
}

test('4,000 則貼文可用內容指紋快速辨識未變更資料', t => {
    const database = buildLargeDatabase();
    const script = `var externalDB = ${JSON.stringify(database)};`;
    const start = performance.now();
    const first = PlannerPerformance.fingerprintText(script);
    const second = PlannerPerformance.fingerprintText(script);
    const duration = performance.now() - start;
    assert.equal(first, second);
    assert.notEqual(first, PlannerPerformance.fingerprintText(script + ' '));
    t.diagnostic(`約 ${(script.length / 1024 / 1024).toFixed(2)} MiB 資料完成兩次指紋檢查：${duration.toFixed(1)}ms`);
});

test('結構化資料建立選單時不重複解析 4,000 篇 HTML 內文', t => {
    const database = buildLargeDatabase();
    let parserCalls = 0;
    const start = performance.now();
    const index = PlannerPerformance.collectMetadata(database, {
        defaultThemes: ['預設主題'],
        getPlainText: html => { parserCalls += 1; return html.replace(/<[^>]+>/g, ''); }
    });
    const duration = performance.now() - start;
    assert.equal(parserCalls, 0);
    assert.equal(index.captionParses, 0);
    assert.equal(index.themes.length, 6);
    assert.equal(index.books.length, 4000);
    t.diagnostic(`4,000 則貼文完成單次索引：${duration.toFixed(1)}ms，HTML 解析 0 次`);
});

test('只有缺少結構化欄位的舊資料才回頭解析內文', () => {
    const database = buildLargeDatabase();
    database['2024-01-01'][0].theme = '';
    database['2024-01-01'][1].title = '';
    let parserCalls = 0;
    const index = PlannerPerformance.collectMetadata(database, {
        getPlainText: html => { parserCalls += 1; return html.replace(/<[^>]+>/g, ''); }
    });
    assert.equal(parserCalls, 2);
    assert.equal(index.captionParses, 2);
});
