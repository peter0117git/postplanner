import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { extractPageCount, extractPages } from '../src/index.js';

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

test('preview 只有第一頁時，以 thumbnail 補齊其他頁', () => {
    const imageSets = {
        preview: {
            images: [{ page: 1, url: 'https://media.canva.com/preview-1.png', width: 1024, height: 1024 }]
        },
        thumbnail: {
            images: [1, 2, 3, 4, 5].map(page => ({
                page,
                url: `https://media.canva.com/thumbnail-${page}.png`,
                width: 447,
                height: 447
            }))
        }
    };
    const html = `<script>window.data={"pageCount":5,"imageSets":${JSON.stringify(imageSets)}};</script>`;
    const pages = extractPages(html);
    assert.equal(pages.length, 5);
    assert.equal(pages[0].quality, 'preview');
    assert.equal(pages[1].quality, 'thumbnail');
    assert.equal(extractPageCount(html), 5);
});

test('Worker health 與無效網址回應 JSON', async () => {
    const health = await worker.fetch(new Request('https://worker.test/health'), { ALLOWED_ORIGIN: '*' });
    assert.equal(health.status, 200);
    const healthResult = await health.json();
    assert.equal(healthResult.ok, true);
    assert.equal(healthResult.version, '1.2.0');
    assert.equal(healthResult.previewOnly, true);

    const invalid = await worker.fetch(new Request('https://worker.test/preview?url=https%3A%2F%2Fexample.com'), { ALLOWED_ORIGIN: '*' });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Canva/);
});

test('Worker 回傳標準公開預覽', async () => {
    const originalFetch = globalThis.fetch;
    const imageSets = {
        preview: {
            images: [{ page: 1, url: 'https://media.canva.com/page-1.png', width: 1024, height: 1024 }]
        }
    };
    globalThis.fetch = async () => new Response(`<script>{"pageCount":1,"imageSets":${JSON.stringify(imageSets)}}</script>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
    });
    try {
        const request = new Request('https://worker.test/preview?url=https%3A%2F%2Fwww.canva.com%2Fdesign%2FDESIGN%2FTOKEN%2Fview');
        const response = await worker.fetch(request, { ALLOWED_ORIGIN: '*' });
        const result = await response.json();
        assert.equal(response.status, 200);
        assert.equal(result.pages.length, 1);
        assert.equal(result.pages[0].quality, 'preview');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
