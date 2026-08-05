import puppeteer from '@cloudflare/puppeteer';

const CANVA_HOST = /(^|\.)canva\.com$/i;
const CANVA_SHORT_HOST = /(^|\.)canva\.link$/i;
const CANVA_MEDIA_HOST = /(^|\.)canva\.com$/i;
const MAX_REDIRECTS = 6;
const MAX_HTML_LENGTH = 5 * 1024 * 1024;
const MAX_BROWSER_PAGES = 40;
const BROWSER_WAIT_MS = 720;
const BROWSER_HEADERS = {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Sec-CH-UA': '"Chromium";v="151", "Not A(Brand";v="24"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'
};

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

function errorMessage(error, fallback = 'Canva 解析失敗') {
    return error instanceof Error && error.message ? error.message : fallback;
}

function isAllowedCanvaUrl(value) {
    try {
        const url = value instanceof URL ? value : new URL(value);
        return url.protocol === 'https:' && (CANVA_HOST.test(url.hostname) || CANVA_SHORT_HOST.test(url.hostname));
    } catch {
        return false;
    }
}

function normalizeDesignViewUrl(value) {
    const url = value instanceof URL ? new URL(value) : new URL(value);
    if (!CANVA_HOST.test(url.hostname)) return url;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'design' && parts.length >= 3) {
        parts[3] = 'view';
        url.pathname = `/${parts.slice(0, 4).join('/')}`;
        url.hash = '';
    }
    return url;
}

async function requestCanvaDocument(url) {
    const options = {
        method: 'GET',
        redirect: 'manual',
        headers: BROWSER_HEADERS,
        cf: {
            cacheEverything: true,
            cacheTtlByStatus: { '200-299': 180, '300-399': 60, '400-599': 0 }
        }
    };
    let response = await fetch(url.toString(), options);
    if (response.status !== 403 || !CANVA_HOST.test(url.hostname)) return response;

    await response.body?.cancel();
    response = await fetch(url.toString(), {
        ...options,
        headers: {
            ...BROWSER_HEADERS,
            Referer: 'https://www.canva.com/',
            'Sec-Fetch-Site': 'same-origin'
        }
    });
    return response;
}

async function fetchCanvaPage(inputUrl) {
    let current = new URL(inputUrl);
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
        if (!isAllowedCanvaUrl(current)) throw new Error('只允許公開的 Canva 網址');
        if (CANVA_HOST.test(current.hostname)) current = normalizeDesignViewUrl(current);
        const response = await requestCanvaDocument(current);

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
    const pages = new Map();
    for (const [setName, value] of Object.entries(imageSets)) {
        if (!value || typeof value !== 'object' || !Array.isArray(value.images)) continue;
        value.images.forEach((image, index) => {
            if (!image?.url) return;
            const page = Number(image.page) || index + 1;
            const area = (Number(image.width) || Number(value.width) || 0) * (Number(image.height) || Number(value.height) || 0);
            const previous = pages.get(page);
            if (!previous || area > previous.area) {
                pages.set(page, {
                    ...image,
                    width: Number(image.width) || Number(value.width) || null,
                    height: Number(image.height) || Number(value.height) || null,
                    sourceSet: setName,
                    area
                });
            }
        });
    }
    return [...pages.values()].sort((left, right) => (Number(left.page) || 0) - (Number(right.page) || 0));
}

export function extractPages(html) {
    const marker = '"imageSets"';
    let cursor = 0;
    let best = [];
    let bestScore = 0;
    while (cursor < html.length) {
        const markerIndex = html.indexOf(marker, cursor);
        if (markerIndex < 0) break;
        const colonIndex = html.indexOf(':', markerIndex + marker.length);
        if (colonIndex < 0) break;
        const rawObject = extractBalancedObject(html, colonIndex + 1);
        if (rawObject) {
            try {
                const images = findPreviewImages(JSON.parse(rawObject));
                const score = images.length * 1_000_000_000 + images.reduce((sum, image) => sum + (image.area || 0), 0);
                if (score > bestScore) {
                    best = images;
                    bestScore = score;
                }
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
        height: Number(image.height) || null,
        quality: image.sourceSet === 'preview' ? 'preview' : 'thumbnail'
    })).filter(image => {
        try {
            const url = new URL(image.url);
            return url.protocol === 'https:' && CANVA_MEDIA_HOST.test(url.hostname);
        } catch {
            return false;
        }
    }).sort((left, right) => left.page - right.page);
}

export function extractPageCount(html) {
    let maximum = 0;
    for (const match of html.matchAll(/"pageCount"\s*:\s*(\d+)/g)) {
        maximum = Math.max(maximum, Number(match[1]) || 0);
    }
    return maximum;
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

export function parseDocumentImageUrl(value) {
    try {
        const url = new URL(String(value || ''));
        if (url.protocol !== 'https:' || !CANVA_MEDIA_HOST.test(url.hostname)) return null;
        if (!/\/document-image\//i.test(url.pathname)) return null;
        const width = Number(url.pathname.match(/\/width:(\d+)/i)?.[1] || url.searchParams.get('width')) || null;
        const height = Number(url.pathname.match(/\/height:(\d+)/i)?.[1] || url.searchParams.get('height')) || null;
        const page = Number(url.searchParams.get('page')) || null;
        if (!page) return null;
        return { url: url.toString(), page, width, height };
    } catch {
        return null;
    }
}

function candidateArea(candidate) {
    return (Number(candidate?.width) || 0) * (Number(candidate?.height) || 0);
}

/**
 * 將 Browser Run 捕捉到的 document-image 與一般解析結果合併。
 * 每一頁只保留面積最大的瀏覽器候選，找不到時才退回公開 preview/thumbnail。
 */
export function selectBrowserPages(candidates, fallbackPages = [], declaredPageCount = 0) {
    const browserByPage = new Map();
    for (const rawCandidate of candidates || []) {
        const parsed = parseDocumentImageUrl(rawCandidate?.url || rawCandidate);
        if (!parsed) continue;
        const candidate = {
            ...parsed,
            width: Number(rawCandidate?.width) || parsed.width,
            height: Number(rawCandidate?.height) || parsed.height,
            quality: 'browser'
        };
        const previous = browserByPage.get(candidate.page);
        if (!previous || candidateArea(candidate) > candidateArea(previous)) browserByPage.set(candidate.page, candidate);
    }

    const fallbackByPage = new Map((fallbackPages || []).map(page => [Number(page.page), page]));
    const highestBrowserPage = Math.max(0, ...browserByPage.keys());
    const highestFallbackPage = Math.max(0, ...fallbackByPage.keys());
    const pageCount = Math.min(MAX_BROWSER_PAGES, Math.max(Number(declaredPageCount) || 0, highestBrowserPage, highestFallbackPage));
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const browserPage = browserByPage.get(pageNumber);
        const fallbackPage = fallbackByPage.get(pageNumber);
        const browserLongEdge = Math.max(Number(browserPage?.width) || 0, Number(browserPage?.height) || 0);
        const meaningfullyLarger = candidateArea(browserPage) > candidateArea(fallbackPage) * 1.2;
        if (browserPage && (browserLongEdge >= 900 || meaningfullyLarger)) {
            pages.push(browserPage);
        } else if (fallbackPage) {
            pages.push({ ...fallbackPage, quality: fallbackPage.quality || 'thumbnail' });
        } else if (browserPage) {
            pages.push({ ...browserPage, quality: 'thumbnail' });
        }
    }
    return pages;
}

function addBrowserCandidate(candidateMap, rawUrl, dimensions = {}) {
    const parsed = parseDocumentImageUrl(rawUrl);
    if (!parsed) return;
    const candidate = {
        ...parsed,
        width: Number(dimensions.width) || parsed.width,
        height: Number(dimensions.height) || parsed.height
    };
    const key = candidate.url;
    const previous = candidateMap.get(key);
    if (!previous || candidateArea(candidate) > candidateArea(previous)) candidateMap.set(key, candidate);
}

async function collectDomImageCandidates(page, candidateMap) {
    const domImages = await page.evaluate(() => {
        const candidates = [];
        for (const image of document.images) {
            candidates.push({
                url: image.currentSrc || image.src || '',
                width: image.naturalWidth || 0,
                height: image.naturalHeight || 0
            });
            const srcset = image.getAttribute('srcset') || '';
            for (const entry of srcset.split(',')) {
                const url = entry.trim().split(/\s+/)[0];
                if (url) candidates.push({ url, width: 0, height: 0 });
            }
        }
        return candidates;
    });
    for (const candidate of domImages) addBrowserCandidate(candidateMap, candidate.url, candidate);
}

async function waitForBrowserActivity(page, timeout = BROWSER_WAIT_MS) {
    if (typeof page.waitForNetworkIdle === 'function') {
        try {
            await page.waitForNetworkIdle({ idleTime: 250, timeout: Math.max(500, timeout) });
        } catch {
            // timeout 本身已完成等待；Canva 的背景連線可能不會完全 idle。
        }
        return;
    }
    await new Promise(resolve => setTimeout(resolve, timeout));
}

async function collectHighQualityPages(env, finalUrl, fallbackPages, declaredPageCount) {
    if (!env?.BROWSER) {
        const error = new Error('此 Worker 尚未啟用 Browser Run 綁定，請重新部署 V8.3 的 canva-worker');
        error.code = 'BROWSER_NOT_CONFIGURED';
        throw error;
    }
    const pageCount = Math.max(Number(declaredPageCount) || 0, fallbackPages.length, 1);
    if (pageCount > MAX_BROWSER_PAGES) throw new Error(`此設計超過 Browser Run 單次上限（${MAX_BROWSER_PAGES} 頁）`);

    const browser = await puppeteer.launch(env.BROWSER);
    const candidateMap = new Map();
    const startedAt = Date.now();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1800, deviceScaleFactor: 1 });
        page.on('request', request => addBrowserCandidate(candidateMap, request.url()));
        page.on('response', response => addBrowserCandidate(candidateMap, response.url()));
        await page.goto(normalizeDesignViewUrl(finalUrl).toString(), {
            waitUntil: 'domcontentloaded',
            timeout: 25_000
        });
        await waitForBrowserActivity(page, 1_400);
        await collectDomImageCandidates(page, candidateMap);

        // Canva 的公開檢視器會在切頁時載入較清晰的 document-image。
        // 鍵盤切頁不依賴 Canva 經常變動的 CSS class／按鈕 selector。
        for (let index = 1; index < pageCount; index += 1) {
            await page.keyboard.press('ArrowRight');
            await waitForBrowserActivity(page);
            await collectDomImageCandidates(page, candidateMap);
        }

        const pages = selectBrowserPages([...candidateMap.values()], fallbackPages, pageCount);
        const browserPreviewCount = pages.filter(pageInfo => pageInfo.quality === 'browser').length;
        if (!browserPreviewCount) {
            throw new Error('Browser Run 已開啟 Canva，但沒有取得較高畫質頁面；請確認連結可由未登入訪客查看');
        }
        return {
            pages,
            browserPreviewCount,
            fallbackCount: pages.length - browserPreviewCount,
            browserMs: Date.now() - startedAt
        };
    } finally {
        await browser.close();
    }
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
        if (request.method !== 'GET') return jsonResponse(request, env, { error: '只支援 GET' }, 405);

        const requestUrl = new URL(request.url);
        if (requestUrl.pathname === '/health') {
            return jsonResponse(request, env, {
                ok: true,
                service: 'canva-preview',
                version: '1.1.0',
                browserRun: Boolean(env?.BROWSER)
            });
        }
        if (requestUrl.pathname !== '/preview') return jsonResponse(request, env, { error: '找不到此路徑' }, 404);

        const source = requestUrl.searchParams.get('url') || '';
        if (!source || source.length > 3000 || !isAllowedCanvaUrl(source)) {
            return jsonResponse(request, env, { error: '請提供有效的 Canva 公開連結' }, 400);
        }
        const mode = requestUrl.searchParams.get('mode') === 'browser' ? 'browser' : 'standard';
        if (mode === 'browser' && !env?.BROWSER) {
            return jsonResponse(request, env, {
                error: '此 Worker 尚未啟用 Browser Run 綁定，請重新部署 V8.3 的 canva-worker',
                code: 'BROWSER_NOT_CONFIGURED'
            }, 503);
        }

        try {
            const { html, finalUrl } = await fetchCanvaPage(source);
            const ordinaryPages = extractPages(html);
            const declaredPageCount = extractPageCount(html);
            if (!ordinaryPages.length) {
                return jsonResponse(request, env, {
                    error: '未找到公開預覽圖片。請確認連結權限為「知道連結的任何人可查看」。'
                }, 422);
            }
            if (mode === 'browser') {
                try {
                    const browserResult = await collectHighQualityPages(env, finalUrl, ordinaryPages, declaredPageCount);
                    return jsonResponse(request, env, {
                        title: extractTitle(html),
                        designId: extractDesignId(finalUrl),
                        sourceUrl: finalUrl,
                        pageCount: Math.max(declaredPageCount, browserResult.pages.length),
                        previewCount: browserResult.browserPreviewCount,
                        mode,
                        ...browserResult
                    });
                } catch (error) {
                    const code = error?.code || 'BROWSER_RUN_FAILED';
                    const status = code === 'BROWSER_NOT_CONFIGURED' ? 503 : (/limit|quota|rate/i.test(errorMessage(error)) ? 429 : 502);
                    return jsonResponse(request, env, { error: errorMessage(error, 'Browser Run 解析失敗'), code }, status);
                }
            }
            return jsonResponse(request, env, {
                title: extractTitle(html),
                designId: extractDesignId(finalUrl),
                sourceUrl: finalUrl,
                pageCount: Math.max(declaredPageCount, ordinaryPages.length),
                previewCount: ordinaryPages.filter(page => page.quality === 'preview').length,
                mode,
                pages: ordinaryPages
            });
        } catch (error) {
            return jsonResponse(request, env, { error: errorMessage(error) }, 502);
        }
    }
};
