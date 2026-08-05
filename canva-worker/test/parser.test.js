import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { extractPages } from '../src/index.js';

test('extractPages 取出並排序 Canva 預覽頁面', () => {
    const imageSets = {
        preview: {
            images: [
                { page: 2, url: 'https://media.canva.com/page-2.png', width: 1024, height: 1024 },
                { page: 1, url: 'https://media.canva.com/page-1.png', width: 1024, height: 1024 }
            ]
        }
    };
    const html = `<script>window.data={"imageSets":${JSON.stringify(imageSets)}};</script>`;
    assert.deepEqual(extractPages(html).map(page => page.page), [1, 2]);
});

test('extractPages 排除非 Canva 圖片網址', () => {
    const html = '<script>{"imageSets":{"preview":{"images":[{"page":1,"url":"https://example.com/a.png"}]}}}</script>';
    assert.deepEqual(extractPages(html), []);
});

test('extractPages 從多組候選中選擇頁數最多的一組', () => {
    const one = { preview: { images: [{ page: 1, url: 'https://media.canva.com/old.png' }] } };
    const four = { preview: { images: [1, 2, 3, 4].map(page => ({
        page,
        url: `https://media.canva.com/page-${page}.png`
    })) } };
    const html = `<script>var a={"imageSets":${JSON.stringify(one)}};var b={"imageSets":${JSON.stringify(four)}};</script>`;
    assert.equal(extractPages(html).length, 4);
});

test('Worker health 與無效網址回應 JSON', async () => {
    const health = await worker.fetch(new Request('https://worker.test/health'), { ALLOWED_ORIGIN: '*' });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const invalid = await worker.fetch(new Request('https://worker.test/preview?url=https%3A%2F%2Fexample.com'), { ALLOWED_ORIGIN: '*' });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Canva/);
});
