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

            if (CANVA_SHORT_HOST.test(host)) {
                url.hash = '';
                return { kind: 'short', sourceUrl: url.toString() };
            }
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
        const publicUrl = parsePublicUrl(value);
        if (!publicUrl) return null;
        if (publicUrl.kind === 'short') {
            return { ...publicUrl, embedUrl: '' };
        }

        const designId = encodeURIComponent(publicUrl.designId);
        const shareToken = encodeURIComponent(publicUrl.shareToken);
        const pageHash = publicUrl.requestedPage > 1 ? `#${publicUrl.requestedPage}` : '';
        const embedUrl = `https://www.canva.com/design/${designId}/${shareToken}/view?embed${pageHash}`;

        return {
            ...publicUrl,
            embedUrl
        };
    }

    global.CanvaService = Object.freeze({
        parsePublicUrl,
        parseEmbedUrl
    });
})(window);
