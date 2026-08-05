const CANVA_HOST = /(^|\.)canva\.com$/i;
const CANVA_SHORT_HOST = /(^|\.)canva\.link$/i;
const CANVA_MEDIA_HOST = /(^|\.)canva\.com$/i;
const MAX_REDIRECTS = 6;
const MAX_HTML_LENGTH = 5 * 1024 * 1024;

function corsHeaders(request, env) {
    const configured = String(env?.ALLOWED_ORIGIN || '*').trim() || '*';
    const requestOrigin = request.headers.get('Origin') || '';
    const origin = configured === '*' ? '*' : (requestOrigin === configured ? configured : 'null');
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Accept, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    };
}

function jsonResponse(request, env, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(request, env),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

function isAllowedCanvaUrl(value) {
    try {
        const url = value instanceof URL ? value : new URL(value);
        return url.protocol === 'https:' && (CANVA_HOST.test(url.hostname) || CANVA_SHORT_HOST.test(url.hostname));
    } catch {
        return false;
    }
}

async function fetchCanvaPage(inputUrl) {
    let current = new URL(inputUrl);
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
        if (!isAllowedCanvaUrl(current)) throw new Error('只允許公開的 Canva 網址');
        const response = await fetch(current.toString(), {
            method: 'GET',
            redirect: 'manual',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
            }
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('Location');
            await response.body?.cancel();
            if (!location) throw new Error('Canva 重新導向缺少目標網址');
            current = new URL(location, current);
            continue;
        }

        if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`Canva 回應錯誤（HTTP ${response.status}）`);
        }
        if (!CANVA_HOST.test(current.hostname)) {
            await response.body?.cancel();
            throw new Error('短網址沒有導向 Canva 設計頁');
        }

        const length = Number(response.headers.get('Content-Length') || 0);
        if (length > MAX_HTML_LENGTH) {
            await response.body?.cancel();
            throw new Error('Canva 頁面過大，無法安全解析');
        }
        const html = await response.text();
        if (html.length > MAX_HTML_LENGTH) throw new Error('Canva 頁面過大，無法安全解析');
        return { html, finalUrl: current.toString() };
    }
    throw new Error('Canva 重新導向次數過多');
}

function extractBalancedObject(text, startIndex) {
    const openIndex = text.indexOf('{', startIndex);
    if (openIndex < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = openIndex; index < text.length; index += 1) {
        const character = text[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
        else if (character === '{') depth += 1;
        else if (character === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(openIndex, index + 1);
        }
    }
    return null;
}

function findPreviewImages(imageSets) {
    if (!imageSets || typeof imageSets !== 'object') return [];
    const direct = imageSets.preview?.images;
    if (Array.isArray(direct)) return direct;
    for (const value of Object.values(imageSets)) {
        if (!value || typeof value !== 'object') continue;
        if (Array.isArray(value.images) && value.images.some(item => item?.url)) return value.images;
    }
    return [];
}

export function extractPages(html) {
    const marker = '"imageSets"';
    let cursor = 0;
    let best = [];
    while (cursor < html.length) {
        const markerIndex = html.indexOf(marker, cursor);
        if (markerIndex < 0) break;
        const colonIndex = html.indexOf(':', markerIndex + marker.length);
        if (colonIndex < 0) break;
        const rawObject = extractBalancedObject(html, colonIndex + 1);
        if (rawObject) {
            try {
                const images = findPreviewImages(JSON.parse(rawObject));
                if (images.length > best.length) best = images;
            } catch {
                // Canva 頁面可能出現多組 imageSets；略過不是 JSON 的候選。
            }
        }
        cursor = markerIndex + marker.length;
    }

    return best.map((image, index) => ({
        page: Number(image.page) || index + 1,
        url: String(image.url || ''),
        width: Number(image.width) || null,
        height: Number(image.height) || null
    })).filter(image => {
        try {
            const url = new URL(image.url);
            return url.protocol === 'https:' && CANVA_MEDIA_HOST.test(url.hostname);
        } catch {
            return false;
        }
    }).sort((left, right) => left.page - right.page);
}

function decodeHtmlEntities(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&#x27;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function extractTitle(html) {
    const patterns = [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["'][^>]*>/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["'][^>]*>/i,
        /<title[^>]*>([^<]*)<\/title>/i
    ];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return decodeHtmlEntities(match[1]).trim().slice(0, 180);
    }
    return 'Canva 預覽';
}

function extractDesignId(finalUrl) {
    try {
        const parts = new URL(finalUrl).pathname.split('/').filter(Boolean);
        return parts[0] === 'design' ? String(parts[1] || '') : '';
    } catch {
        return '';
    }
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        if (request.method !== 'GET') return jsonResponse(request, env, { error: '只支援 GET' }, 405);

        const requestUrl = new URL(request.url);
        if (requestUrl.pathname === '/health') return jsonResponse(request, env, { ok: true, service: 'canva-preview' });
        if (requestUrl.pathname !== '/preview') return jsonResponse(request, env, { error: '找不到此路徑' }, 404);

        const source = requestUrl.searchParams.get('url') || '';
        if (!source || source.length > 3000 || !isAllowedCanvaUrl(source)) {
            return jsonResponse(request, env, { error: '請提供有效的 Canva 公開連結' }, 400);
        }

        try {
            const { html, finalUrl } = await fetchCanvaPage(source);
            const pages = extractPages(html);
            if (!pages.length) {
                return jsonResponse(request, env, {
                    error: '未找到公開預覽圖片。請確認連結權限為「知道連結的任何人可查看」。'
                }, 422);
            }
            return jsonResponse(request, env, {
                title: extractTitle(html),
                designId: extractDesignId(finalUrl),
                sourceUrl: finalUrl,
                pageCount: pages.length,
                pages
            });
        } catch (error) {
            return jsonResponse(request, env, { error: error instanceof Error ? error.message : 'Canva 解析失敗' }, 502);
        }
    }
};
