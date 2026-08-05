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

    function parseEmbedUrl(value) {
        const info = parsePublicUrl(value);
        if (!info) return null;
        if (info.kind === 'short') return { kind: 'short', embedUrl: null, page: null };
        try {
            const url = new URL(info.sourceUrl);
            const pageMatch = url.hash.match(/^#(\d+)$/);
            const page = pageMatch ? pageMatch[1] : null;
            url.hash = '';
            if (!url.searchParams.has('embed')) url.searchParams.set('embed', '');
            const embedUrl = url.toString().replace(/embed=$/, 'embed');
            return { kind: 'long', embedUrl: page ? `${embedUrl}#${page}` : embedUrl, page };
        } catch {
            return null;
        }
    }

    function firstPagePreview(value) {
        const info = parsePublicUrl(value);
        if (!info || info.kind === 'short' || !info.designId || !info.shareToken) return info;
        return {
            ...info,
            screenUrl: `https://www.canva.com/design/${encodeURIComponent(info.designId)}/${encodeURIComponent(info.shareToken)}/screen`
        };
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
        if (!service) throw new Error('請先設定有效的 Canva 多頁服務網址');
        if (!parsePublicUrl(canvaUrl)) throw new Error('請先貼上有效的 Canva 公開分享連結');

        const response = await fetch(`${service}/preview?url=${encodeURIComponent(canvaUrl)}`, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Canva 多頁解析失敗（HTTP ${response.status}）`);
        if (!Array.isArray(result.pages) || result.pages.length === 0) throw new Error('此 Canva 連結未找到可下載的公開預覽頁面');
        return {
            title: String(result.title || 'Canva預覽'),
            designId: String(result.designId || ''),
            sourceUrl: String(result.sourceUrl || canvaUrl),
            pageCount: Number(result.pageCount) || result.pages.length,
            previewCount: Number(result.previewCount) || 0,
            pages: result.pages.map((page, index) => ({
                page: Number(page.page) || index + 1,
                url: String(page.url || ''),
                width: Number(page.width) || null,
                height: Number(page.height) || null,
                quality: page.quality === 'preview' ? 'preview' : 'thumbnail'
            })).filter(page => /^https:\/\//i.test(page.url))
        };
    }

    function safeFilename(value) {
        return String(value || '')
            .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 70) || 'Canva預覽';
    }

    function triggerDownload(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
    }

    async function loadImageBlob(url) {
        const response = await fetch(url, {
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer'
        });
        if (!response.ok) throw new Error(`圖片下載失敗（HTTP ${response.status}）`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Canva 未回傳圖片格式');
        return blob;
    }

    async function downloadImage(url, filename) {
        const blob = await loadImageBlob(url);
        triggerDownload(blob, filename);
    }

    global.CanvaService = Object.freeze({
        parsePublicUrl,
        parseEmbedUrl,
        firstPagePreview,
        normalizeWorkerUrl,
        resolvePages,
        safeFilename,
        triggerDownload,
        loadImageBlob,
        downloadImage
    });
})(window);
