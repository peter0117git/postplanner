(function performanceService(global) {
    'use strict';

    function fingerprintText(text) {
        const source = String(text || '');
        let hash = 2166136261;
        for (let index = 0; index < source.length; index += 1) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return `${source.length}:${(hash >>> 0).toString(36)}`;
    }

    function collectMetadata(database, {
        defaultThemes = [],
        storedThemes = [],
        storedBooks = [],
        getPlainText = value => String(value || '')
    } = {}) {
        const themes = new Set([...defaultThemes, ...storedThemes]);
        const books = new Set(storedBooks);
        let captionParses = 0;

        Object.values(database || {}).forEach(list => {
            (Array.isArray(list) ? list : []).forEach(post => {
                if (post?.theme) themes.add(String(post.theme).trim());
                if (post?.title) books.add(String(post.title).trim());
                if (!post?.theme || !post?.title) {
                    captionParses += 1;
                    const plain = getPlainText(post?.caption || '');
                    if (!post?.theme) {
                        for (const match of plain.matchAll(/【([^】]+)】/g)) if (match[1].trim()) themes.add(match[1].trim());
                    }
                    if (!post?.title) {
                        for (const match of plain.matchAll(/《([^》]+)》/g)) if (match[1].trim()) books.add(match[1].trim());
                    }
                }
            });
        });

        return {
            themes: Array.from(themes).filter(Boolean),
            books: Array.from(books).filter(Boolean).sort(),
            captionParses
        };
    }

    const service = Object.freeze({ fingerprintText, collectMetadata });
    global.PlannerPerformance = service;
    if (typeof module !== 'undefined' && module.exports) module.exports = service;
})(typeof window !== 'undefined' ? window : globalThis);
