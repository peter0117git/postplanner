(function (global) {
    'use strict';

    function normalizeText(value) {
        return String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
    }

    function buildHeader(theme, title) {
        return [theme ? `【${String(theme).trim()}】` : '', title ? `《${String(title).trim()}》` : '']
            .filter(Boolean)
            .join(' ');
    }

    function stripExistingHeader(text) {
        const lines = normalizeText(text).split('\n');
        if (!lines.length) return '';
        const first = lines[0].trim();
        if (!/【[^】]+】|《[^》]+》/.test(first)) return lines.join('\n').trim();
        const remainder = first.replace(/【[^】]+】/g, '').replace(/《[^》]+》/g, '').trim();
        if (remainder) lines[0] = remainder;
        else lines.shift();
        while (lines[0] === '') lines.shift();
        return lines.join('\n').trim();
    }

    function inspect(text) {
        const normalized = normalizeText(text);
        const hashtags = Array.from(new Set(normalized.match(/#[^\s#，。、！？；：「」,.!?;:()\[\]《》]+/g) || []));
        const sourceLines = normalized.split('\n').map(line => line.trim()).filter(line =>
            /^(?:擷取|摘錄|節錄)自\s*[pPＰ]?\s*\d/i.test(line) || /^p(?:age)?\.?\s*\d/i.test(line)
        );
        return {
            characterCount: Array.from(normalized).length,
            lineCount: normalized ? normalized.split('\n').length : 0,
            hashtags,
            sourceLines
        };
    }

    function compose(post, captionText) {
        const header = buildHeader(post?.theme, post?.title);
        const original = normalizeText(captionText);
        const body = header ? stripExistingHeader(original) : original;
        const text = [header, body].filter(Boolean).join('\n');
        return { text, header, body, ...inspect(text) };
    }

    const api = Object.freeze({ normalizeText, buildHeader, stripExistingHeader, inspect, compose });
    global.PostComposerService = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
