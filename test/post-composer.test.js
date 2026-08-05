const test = require('node:test');
const assert = require('node:assert/strict');
const PostComposerService = require('../assets/js/services/post-composer.js');

const post = {
    theme: '晚上多讀一點點',
    title: '上帝不眨眼：50堂百萬人瘋傳的人生智慧'
};

const completeCaption = `【晚上多讀一點點】 《上帝不眨眼：50堂百萬人瘋傳的人生智慧》
生命沒有美麗包裝，但仍是一個禮物
生命是個禮物，每天都是。
擷取自p288~290
#大田出版 #人生 #及時行樂 #嘗試`;

test('已有完整首行時不重複加入主題與書名', () => {
    const result = PostComposerService.compose(post, completeCaption);
    assert.equal(result.text, completeCaption);
    assert.equal(result.text.match(/【晚上多讀一點點】/g).length, 1);
    assert.equal(result.text.match(/《上帝不眨眼：50堂百萬人瘋傳的人生智慧》/g).length, 1);
});

test('正文沒有首行時自動組合完整發布文案', () => {
    const body = `生命沒有美麗包裝，但仍是一個禮物
擷取自p288~290
#大田出版 #人生`;
    const result = PostComposerService.compose(post, body);
    assert.equal(result.text, `${PostComposerService.buildHeader(post.theme, post.title)}\n${body}`);
});

test('統計標籤、頁碼、行數與字數', () => {
    const result = PostComposerService.compose(post, completeCaption);
    assert.deepEqual(result.hashtags, ['#大田出版', '#人生', '#及時行樂', '#嘗試']);
    assert.deepEqual(result.sourceLines, ['擷取自p288~290']);
    assert.equal(result.lineCount, 5);
    assert.ok(result.characterCount > 50);
});

test('第一行有結構符號與其他文字時保留其餘文字', () => {
    const result = PostComposerService.compose(post, '【舊主題】 《舊書名》 副標\n正文');
    assert.equal(result.text, `${PostComposerService.buildHeader(post.theme, post.title)}\n副標\n正文`);
});
