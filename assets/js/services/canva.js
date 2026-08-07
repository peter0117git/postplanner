(function canvaService(global) {
    'use strict';

    const CANVA_HOST = /(^|\.)canva\.com$/i;
    const CANVA_SHORT_HOST = /(^|\.)canva\.link$/i;

    function parsePublicUrl(value) {
        if (!value) return null;
        try {
            const url = new URL(String(value).trim());
            if (url.protocol !== 'https:') return null;
            const host = url.hostname.toLowerCase();
            if (CANVA_SHORT_HOST.test(host)) return { kind: 'short', sourceUrl: url.toString() };
            if (!CANVA_HOST.test(host)) return null;

            const parts = url.pathname.split('/').filter(Boolean);
            if (parts[0] !== 'design' || parts.length < 3) return null;
            const pageMatch = url.hash.match(/^#(\d+)$/);
            return {
                kind: 'long',
                sourceUrl: url.toString(),
                designId: parts[1] || '',
                shareToken: parts[2] || '',
                action: parts[3] || '',
                requestedPage: pageMatch ? Number(pageMatch[1]) : 1
            };
        } catch {
            return null;
        }
    }

    function normalizeWorkerUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(String(value).trim());
            if (url.protocol !== 'https:' && url.hostname !== 'localhost') return '';
            url.pathname = url.pathname.replace(/\/+$/, '');
            url.search = '';
            url.hash = '';
            return url.toString().replace(/\/$/, '');
        } catch {
            return '';
        }
    }

    async function resolvePages(workerUrl, canvaUrl) {
        const service = normalizeWorkerUrl(workerUrl);
        if (!service) throw new Error('請先設定有效的 Canva 預覽服務網址');
        if (!parsePublicUrl(canvaUrl)) throw new Error('請先貼上有效的 Canva 公開分享連結');

        const endpoint = new URL(`${service}/preview`);
        endpoint.searchParams.set('url', canvaUrl);
        const response = await fetch(endpoint.toString(), {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(result.error || `Canva 預覽解析失敗（HTTP ${response.status}）`);
            error.code = String(result.code || 'CANVA_RESOLVE_FAILED');
            throw error;
        }
        if (!Array.isArray(result.pages) || result.pages.length === 0) {
            throw new Error('此 Canva 連結未找到可顯示的公開預覽頁面');
        }
        return {
            title: String(result.title || 'Canva 預覽'),
            designId: String(result.designId || ''),
            sourceUrl: String(result.sourceUrl || canvaUrl),
            pageCount: Number(result.pageCount) || result.pages.length,
            previewCount: Number(result.previewCount) || 0,
            pages: result.pages.map((pageInfo, index) => ({
                page: Number(pageInfo.page) || index + 1,
                url: String(pageInfo.url || ''),
                width: Number(pageInfo.width) || null,
                height: Number(pageInfo.height) || null,
                quality: pageInfo.quality === 'preview' ? 'preview' : 'thumbnail'
            })).filter(pageInfo => /^https:\/\//i.test(pageInfo.url))
        };
    }

    global.CanvaService = Object.freeze({
        parsePublicUrl,
        normalizeWorkerUrl,
        resolvePages
    });
})(window);
