/* =============================================================
   狀態
============================================================= */
let db = {};
let dbMeta = { schemaVersion: 2, updatedAt: null, tombstones: {} };
let selectedDateStr = null;
let currentId = null;
let isIGExpanded = false;
let isFBExpanded = false;
let saveStatusTimer;
let localSaveTimer;
let dayRenderTimer;
let previewRenderTimer;
let lastRenderedMediaKeys = { instagram: null, facebook: null };
let storageWriteChain = Promise.resolve();
let storageErrorShown = false;
let pendingConfirmResolve = null;
let dataRevision = 0;
let persistedRevision = 0;
let metadataIndexDirty = true;
let metadataIndexCache = { themes: [], books: [] };
let calYear, calMonth;     // 日曆浮動視窗的當前年月
const DB_SCHEMA_VERSION = 2;
const APP_VERSION = '8.4.3';
const PAGE_PARAMS = new URLSearchParams(location.search);
const IS_BOSS_PREVIEW = PAGE_PARAMS.get('preview') === 'boss';
const PERSIST_DEBOUNCE_MS = 550;
const DAY_RENDER_DEBOUNCE_MS = 320;
const PREVIEW_RENDER_DEBOUNCE_MS = 80;
const TEXT_INPUT_FIELDS = new Set(['caption', 'theme', 'title', 'canvaUrl']);
const VALID_RATIOS = new Set(['1-1', '4-5', '16-9']);
const VALID_STATUSES = new Set(['draft', 'ready', 'published']);
const STATUS_LABELS = { draft: '草稿', ready: '已完成', published: '已發布' };

/* =============================================================
   Toast / Modal
============================================================= */
function showToast(msg, dur = 2200) {
    const el = document.getElementById('toast-msg');
    el.innerText = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), dur);
}
function showConfirm(msg) {
    return new Promise(resolve => {
        pendingConfirmResolve = resolve;
        document.getElementById('confirm-modal-text').innerText = msg;
        document.getElementById('confirm-modal').classList.add('show');
    });
}
function closeConfirmModal(result) {
    document.getElementById('confirm-modal').classList.remove('show');
    if (pendingConfirmResolve) { pendingConfirmResolve(result); pendingConfirmResolve = null; }
}

/* =============================================================
   存檔
============================================================= */
function markSaved() {
    const el = document.getElementById('save-status');
    el.innerText = '✓ 已儲存'; el.classList.add('saved');
    clearTimeout(saveStatusTimer);
    saveStatusTimer = setTimeout(() => { el.innerText = '自動存本機'; el.classList.remove('saved'); }, 2000);
}
function markDataDirty({ metadata = false } = {}) {
    dataRevision += 1;
    if (metadata) metadataIndexDirty = true;
}
function persistLocal({ force = false } = {}) {
    clearTimeout(localSaveTimer); localSaveTimer = null;
    storageWriteChain = storageWriteChain.catch(() => {}).then(async () => {
        if (!force && persistedRevision >= dataRevision) return true;
        const revisionToWrite = dataRevision;
        // IndexedDB 的 put() 會自行做 structured clone，不必先複製整座資料庫。
        const snapshot = { db, meta: dbMeta, savedAt: new Date().toISOString() };
        try {
            await PlannerStorage.writeState(snapshot);
            persistedRevision = Math.max(persistedRevision, revisionToWrite);
            // IndexedDB 儲存成功後移除舊的大型副本，立即釋放 localStorage 容量。
            localStorage.removeItem('planner_db');
            localStorage.removeItem('planner_meta');
            storageErrorShown = false;
            markSaved();
            if (dataRevision > persistedRevision) void persistLocal();
            return true;
        } catch (indexedError) {
            console.error('IndexedDB save failed:', indexedError);
            try {
                localStorage.setItem('planner_db', JSON.stringify(snapshot.db));
                localStorage.setItem('planner_meta', JSON.stringify(snapshot.meta));
                persistedRevision = Math.max(persistedRevision, revisionToWrite);
                markSaved();
                if (dataRevision > persistedRevision) void persistLocal();
                return true;
            } catch (localError) {
                console.error('localStorage fallback failed:', localError);
                const el = document.getElementById('save-status');
                el.innerText = '儲存失敗'; el.classList.remove('saved');
                if (!storageErrorShown) {
                    storageErrorShown = true;
                    showToast('本機儲存失敗，請先匯出備份並重新整理', 4200);
                }
                return false;
            }
        }
    });
    return storageWriteChain;
}
function saveLocal({ debounce = false, touchDatabase = true, metadata = false } = {}) {
    if (touchDatabase) {
        dbMeta.updatedAt = new Date().toISOString();
        markDataDirty({ metadata });
    }
    if (!debounce) { persistLocal(); return; }
    const el = document.getElementById('save-status');
    el.innerText = '儲存中…'; el.classList.remove('saved');
    clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(persistLocal, PERSIST_DEBOUNCE_MS);
}
function scheduleDayRender() {
    clearTimeout(dayRenderTimer);
    dayRenderTimer = setTimeout(renderDay, DAY_RENDER_DEBOUNCE_MS);
}
function schedulePreviewRender(delay = PREVIEW_RENDER_DEBOUNCE_MS) {
    clearTimeout(previewRenderTimer);
    previewRenderTimer = setTimeout(updatePreview, delay);
}

/* =============================================================
   浮動視窗：日曆
============================================================= */
function toggleCalOverlay() {
    const overlay = document.getElementById('cal-overlay');
    if (overlay.classList.contains('open')) { closeCalOverlay(); return; }
    // 初始化到「選定日期」所在月份
    if (selectedDateStr) {
        const d = new Date(selectedDateStr + 'T00:00:00');
        calYear = d.getFullYear(); calMonth = d.getMonth();
    } else {
        const now = new Date();
        calYear = now.getFullYear(); calMonth = now.getMonth();
    }
    renderCalPopup();
    overlay.classList.add('open');
}
function closeCalOverlay() {
    document.getElementById('cal-overlay').classList.remove('open');
}
function changeCalMonth(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalPopup();
}
function goToToday() {
    const today = new Date();
    const todayStr = fmtDate(today);
    selectDate(todayStr);
    closeCalOverlay();
}
function renderCalPopup() {
    document.getElementById('cal-popup-title').innerText = `${calYear} 年 ${String(calMonth + 1).padStart(2, '0')} 月`;
    const container = document.getElementById('cal-popup-days');
    container.innerHTML = '';
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = fmtDate(today);

    for (let i = 0; i < firstDay; i++) container.appendChild(document.createElement('div'));
    for (let d = 1; d <= totalDays; d++) {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const div = document.createElement('div');
        div.className = 'cal-day';
        div.tabIndex = 0; div.setAttribute('role', 'button'); div.setAttribute('aria-label', `${calMonth + 1} 月 ${d} 日`);
        if (dateStr === selectedDateStr) div.classList.add('selected');
        if (dateStr === todayStr) div.classList.add('today');
        const numSpan = document.createElement('span');
        numSpan.className = 'cal-day-num'; numSpan.innerText = d;
        div.appendChild(numSpan);
        if (db[dateStr]?.length > 0) {
            const badge = document.createElement('span');
            badge.className = 'cal-badge'; badge.innerText = db[dateStr].length;
            div.appendChild(badge);
        }
        div.onclick = () => { selectDate(dateStr); closeCalOverlay(); };
        div.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); div.click(); } };
        container.appendChild(div);
    }
}

/* =============================================================
   浮動視窗：GitHub
============================================================= */
function toggleGhOverlay() {
    const overlay = document.getElementById('gh-overlay');
    overlay.classList.toggle('open');
}
function closeGhOverlay() {
    document.getElementById('gh-overlay').classList.remove('open');
}
function toggleTokenVisibility() {
    const inp = document.getElementById('gh-token');
    const btn = document.getElementById('token-toggle');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.innerText = inp.type === 'password' ? '👁' : '🙈';
}
function saveGitConfig() {
    localStorage.setItem('gh_token', document.getElementById('gh-token').value.trim());
    localStorage.setItem('gh_repo', document.getElementById('gh-repo').value.trim());
}
async function syncToGitHub() {
    if (IS_BOSS_PREVIEW) { showToast('老闆預覽為唯讀模式'); return; }
    const token = localStorage.getItem('gh_token');
    const repo = localStorage.getItem('gh_repo');
    const btn = document.getElementById('sync-btn');
    if (!token || !repo) { showToast('請先填寫完整 GitHub 設定'); return; }
    await persistLocal();
    btn.disabled = true; btn.innerText = '同步中…'; btn.style.backgroundColor = 'var(--amber-flag)';
    try {
        let completed = false;
        for (let attempt = 0; attempt < 2 && !completed; attempt++) {
            const remote = await fetchGitDatabase(repo, token);
            const merged = mergeDatabases(db, remote.db, dbMeta, remote.meta);
            db = merged.db; dbMeta = merged.meta;
            dbMeta.updatedAt = new Date().toISOString();
            markDataDirty({ metadata: true });
            let result;
            try {
                result = await GitHubService.writeFile({
                    repo,
                    token,
                    path: 'database.js',
                    text: serializeDatabaseScript(db, dbMeta),
                    sha: remote.sha,
                    message: `排版更新: ${new Date().toLocaleString()}`
                });
            } catch (error) {
                if ((error.status === 409 || error.status === 422) && attempt === 0) continue;
                throw error;
            }
            if (result.content?.sha) localStorage.setItem('gh_last_sync_sha', result.content.sha);
            localStorage.setItem('planner_db_saved_at', new Date().toISOString());
            await persistLocal(); renderDay();
            if (currentId && getPostById(currentId)) loadPost(currentId);
            completed = true;
        }
        btn.style.backgroundColor = 'var(--green-stamp)'; btn.innerText = '✓ 合併並同步成功！';
        setTimeout(() => { btn.disabled = false; btn.style.backgroundColor = 'var(--ink)'; btn.innerText = '儲存並同步到 GitHub'; }, 1500);
    } catch (err) {
        showToast('同步失敗：' + (err.message || '請確認設定'));
        btn.disabled = false; btn.style.backgroundColor = 'var(--ink)'; btn.innerText = '儲存並同步到 GitHub';
    }
}

/* =============================================================
   簡報模式
============================================================= */
function togglePresenting() {
    if (document.body.classList.contains('editor-focused')) toggleEditorFocus(false);
    document.body.classList.toggle('presenting');
    let isPresenting = document.body.classList.contains('presenting');
    if (isPresenting && getSortedDayPosts().length === 0) {
        document.body.classList.remove('presenting');
        isPresenting = false;
        showToast('這一天尚無貼文可供簡報');
    }
    document.getElementById('present-btn').innerText = isPresenting ? '✕ 結束簡報' : '🖥 簡報';
    if (isPresenting && currentId === null && selectedDateStr) {
        const list = getSortedDayPosts();
        if (list.length > 0) loadPost(list[0]._id);
    }
    if (isPresenting && isMobile()) mobileShowPanel('preview');
    updatePresentationNav();
}
function getSortedDayPosts() {
    return [...(selectedDateStr ? db[selectedDateStr] || [] : [])]
        .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
}
function updatePresentationNav() {
    const list = getSortedDayPosts();
    const index = list.findIndex(p => p._id === currentId);
    document.getElementById('present-nav-label').innerText = list.length ? `${Math.max(index, 0) + 1} / ${list.length}` : '0 / 0';
    document.getElementById('present-prev').disabled = index <= 0;
    document.getElementById('present-next').disabled = index < 0 || index >= list.length - 1;
}
function changePresentationPost(dir) {
    const list = getSortedDayPosts();
    const index = list.findIndex(p => p._id === currentId);
    const next = list[index + dir];
    if (next) loadPost(next._id);
}

/* =============================================================
   備份
============================================================= */
async function exportBackup() {
    await persistLocal();
    const payload = {
        app: '排版桌', appVersion: APP_VERSION, schemaVersion: DB_SCHEMA_VERSION, exportedAt: new Date().toISOString(),
        db, meta: dbMeta
    };
    const backupUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), {
        href: backupUrl,
        download: `planner-backup-${new Date().toISOString().slice(0, 10)}.json`
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(backupUrl), 1000);
    showToast('已匯出備份'); closeGhOverlay();
}
function importBackup(event) {
    if (IS_BOSS_PREVIEW) { event.target.value = ''; return; }
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            const incomingDb = normalizeDatabase(parsed?.db && typeof parsed.db === 'object' ? parsed.db : parsed, { strict: true });
            const incomingMeta = normalizeMeta(parsed?.meta || {});
            const ok = await showConfirm('匯入備份將覆蓋目前所有本機資料，確定繼續嗎？');
            if (!ok) { event.target.value = ''; return; }
            db = incomingDb; dbMeta = incomingMeta; dbMeta.updatedAt = new Date().toISOString();
            saveLocal({ metadata: true }); renderDay();
            if (selectedDateStr) selectDate(selectedDateStr);
            showToast('備份已匯入');
        } catch (err) { console.error(err); showToast('匯入失敗：格式不正確，原資料未變更'); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

/* =============================================================
   資料庫
============================================================= */
function newPostId() { return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
function validIso(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null; }
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
function isCurrentStoredDatabase(state) {
    const value = state?.db;
    if (Number(state?.meta?.schemaVersion || 0) < DB_SCHEMA_VERSION) return false;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(([dateStr, list]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(dateStr) &&
        Array.isArray(list) &&
        list.every(post => post && typeof post === 'object' && !Array.isArray(post) && typeof post._id === 'string')
    );
}
function normalizeMeta(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const tombstones = {};
    if (raw.tombstones && typeof raw.tombstones === 'object' && !Array.isArray(raw.tombstones)) {
        Object.entries(raw.tombstones).forEach(([id, time]) => {
            const validTime = validIso(time);
            if (id && validTime) tombstones[id] = validTime;
        });
    }
    return {
        schemaVersion: DB_SCHEMA_VERSION,
        updatedAt: validIso(raw.updatedAt),
        tombstones
    };
}
function normalizeDatabase(value, { strict = true } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        if (strict) throw new Error('資料庫必須是以日期分類的物件');
        return {};
    }
    const normalized = {};
    Object.entries(value).forEach(([dateStr, list]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Array.isArray(list)) {
            if (strict) throw new Error(`日期 ${dateStr} 的格式不正確`);
            return;
        }
        normalized[dateStr] = list.filter(p => p && typeof p === 'object' && !Array.isArray(p)).map(p => ({ ...cloneJson(p) }));
    });
    migrateIds(normalized);
    return normalized;
}
function migrateIds(target = db) {
    const seenIds = new Set();
    Object.values(target).forEach(arr => {
        if (!Array.isArray(arr)) return;
        arr.forEach(p => {
            if (!p._id || seenIds.has(p._id)) p._id = newPostId();
            seenIds.add(p._id);
            if (!p.canvaUrl) p.canvaUrl = Array.isArray(p.img) && p.img.length > 0 ? p.img[0] : '';
            p.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || '') ? p.time : '09:00';
            p.ratio = VALID_RATIOS.has(p.ratio) ? p.ratio : '1-1';
            p.status = VALID_STATUSES.has(p.status) ? p.status : 'draft';
            p.caption = sanitizeCaptionHtml(p.caption || '');
            const plain = getPlainText(p.caption);
            const themeMatch = plain.match(/【([^】]+)】/);
            const titleMatch = plain.match(/《([^》]+)》/);
            if (typeof p.theme !== 'string') p.theme = themeMatch ? themeMatch[1].trim() : '';
            if (typeof p.title !== 'string') p.title = titleMatch ? titleMatch[1].trim() : '';
            p.createdAt = validIso(p.createdAt);
            p.updatedAt = validIso(p.updatedAt);
        });
    });
}
function serializeDatabaseScript(database = db, meta = dbMeta) {
    return 'var externalDB = ' + JSON.stringify(database, null, 2) + ';\n' +
        'var externalDBMeta = ' + JSON.stringify(meta, null, 2) + ';';
}
function parseJsonSafely(text, label) {
    try { return JSON.parse(text); }
    catch (err) {
        const message = err instanceof SyntaxError ? `${label}內容不完整或格式不正確` : err.message;
        const wrapped = new Error(message); wrapped.cause = err; throw wrapped;
    }
}
function parseDatabaseScript(raw) {
    const text = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!text) return { db: {}, meta: normalizeMeta({}) };

    // 同時相容純 JSON 備份、舊版 externalDB，以及新版 externalDB + externalDBMeta。
    if (text.startsWith('{')) {
        const parsed = parseJsonSafely(text, 'GitHub database.js ');
        if (parsed.db && typeof parsed.db === 'object') {
            return { db: normalizeDatabase(parsed.db, { strict: true }), meta: normalizeMeta(parsed.meta || {}) };
        }
        return { db: normalizeDatabase(parsed, { strict: true }), meta: normalizeMeta({}) };
    }

    const metaMarker = text.match(/\r?\n(?:var|let|const)\s+externalDBMeta\s*=\s*/);
    const markerIndex = metaMarker?.index ?? -1;
    let dbText = markerIndex >= 0 ? text.slice(0, markerIndex) : text;
    let metaText = markerIndex >= 0 ? text.slice(markerIndex + metaMarker[0].length) : '';
    const assignmentPattern = /^(?:var|let|const)\s+externalDB\s*=\s*/;
    if (!assignmentPattern.test(dbText)) throw new Error('GitHub database.js 不是可辨識的排版桌資料格式');
    dbText = dbText.replace(assignmentPattern, '').replace(/;\s*$/, '').trim();
    metaText = metaText.replace(/;\s*$/, '').trim();
    return {
        db: normalizeDatabase(parseJsonSafely(dbText, 'GitHub database.js '), { strict: true }),
        meta: metaText ? normalizeMeta(parseJsonSafely(metaText, 'GitHub 同步資訊 ')) : normalizeMeta({})
    };
}
function timestampOf(post) { return Date.parse(post?.updatedAt || post?.createdAt || '') || 0; }
function mergeDatabases(localDb, remoteDb, localMeta, remoteMeta) {
    const records = new Map();
    const stats = { localOnly: 0, remoteOnly: 0, remoteNewer: 0, localNewer: 0 };
    // 兩端資料在載入時已完成 normalize；合併階段不再重複清理、複製整座資料庫。
    const add = (source, sourceDb) => Object.entries(sourceDb || {}).forEach(([dateStr, list]) => {
        if (!Array.isArray(list)) return;
        list.forEach(post => {
            if (!post?._id) return;
            const existing = records.get(post._id);
            if (!existing) {
                records.set(post._id, { dateStr, post, source });
                stats[source === 'local' ? 'localOnly' : 'remoteOnly']++;
                return;
            }
            if (source === 'remote') {
                stats.localOnly = Math.max(0, stats.localOnly - 1);
                const localTime = timestampOf(existing.post);
                const remoteTime = timestampOf(post);
                // 時間相同時也採用遠端版本，避免舊瀏覽器資料遮住已發布內容。
                if (remoteTime >= localTime) {
                    records.set(post._id, { dateStr, post, source });
                    stats.remoteNewer++;
                } else {
                    stats.localNewer++;
                }
            }
        });
    });
    add('local', localDb);
    add('remote', remoteDb);

    const mergedMeta = normalizeMeta(localMeta);
    const remoteNormalizedMeta = normalizeMeta(remoteMeta);
    Object.entries(remoteNormalizedMeta.tombstones).forEach(([id, time]) => {
        if (!mergedMeta.tombstones[id] || Date.parse(time) > Date.parse(mergedMeta.tombstones[id])) mergedMeta.tombstones[id] = time;
    });
    records.forEach((record, id) => {
        const deletedAt = Date.parse(mergedMeta.tombstones[id] || '') || 0;
        if (deletedAt && deletedAt >= timestampOf(record.post)) records.delete(id);
        else if (deletedAt) delete mergedMeta.tombstones[id];
    });

    const mergedDb = {};
    records.forEach(({ dateStr, post }) => {
        if (!mergedDb[dateStr]) mergedDb[dateStr] = [];
        mergedDb[dateStr].push(post);
    });
    const latestMetaTime = Math.max(Date.parse(localMeta?.updatedAt || '') || 0, Date.parse(remoteMeta?.updatedAt || '') || 0);
    mergedMeta.updatedAt = latestMetaTime ? new Date(latestMetaTime).toISOString() : null;
    return { db: mergedDb, meta: mergedMeta, stats };
}
async function fetchGitDatabase(repo, token) {
    const file = await GitHubService.readFile(repo, token, 'database.js');
    if (!file.text) return { sha: file.sha, db: {}, meta: normalizeMeta({}) };
    return { sha: file.sha, ...parseDatabaseScript(file.text) };
}
async function fetchPublishedDatabase({ allowNotModified = true } = {}) {
    if (location.protocol === 'file:') return null;
    const url = new URL('database.js', location.href);
    url.search = '';
    url.hash = '';
    const cachedEtag = allowNotModified ? localStorage.getItem('planner_public_etag') : '';
    const headers = { Accept: 'text/javascript, application/javascript, text/plain;q=0.9' };
    if (cachedEtag) headers['If-None-Match'] = cachedEtag;
    const response = await fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers
    });
    if (response.status === 304) return { notModified: true };
    if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`公開資料讀取失敗（HTTP ${response.status}）`);
    }
    const text = await response.text();
    if (!text.trim()) return null;
    const fingerprint = PlannerPerformance.fingerprintText(text);
    if (allowNotModified && fingerprint === localStorage.getItem('planner_public_fingerprint')) {
        const etag = response.headers.get('etag');
        if (etag) localStorage.setItem('planner_public_etag', etag);
        return { notModified: true };
    }
    const parsed = parseDatabaseScript(text);
    const etag = response.headers.get('etag');
    return { ...parsed, notModified: false, fingerprint, etag };
}
function getPostById(id) {
    if (!selectedDateStr || id === null) return null;
    return (db[selectedDateStr] || []).find(p => p._id === id) || null;
}
async function initDatabase() {
    const local = localStorage.getItem('planner_db');
    const localMeta = localStorage.getItem('planner_meta');
    let indexedState = null;
    let loadedLegacyStorage = false;
    let publishedAvailable = false;
    let pendingPublishedFingerprint = '';
    let pendingPublishedEtag = '';
    try { indexedState = await PlannerStorage.readState(); }
    catch (err) { console.warn('IndexedDB read unavailable, using fallback:', err); }

    if (indexedState?.db) {
        try {
            // 自己先前寫入且 schema 未變的 IndexedDB 已是乾淨資料，直接採用即可。
            db = isCurrentStoredDatabase(indexedState)
                ? indexedState.db
                : normalizeDatabase(indexedState.db, { strict: true });
        }
        catch { db = {}; showToast('本機資料格式異常，已先開啟空白資料'); }
    } else if (local) {
        try { db = normalizeDatabase(JSON.parse(local), { strict: true }); }
        catch { db = {}; showToast('本機資料格式異常，已先開啟空白資料'); }
        loadedLegacyStorage = true;
    } else if (typeof externalDB !== 'undefined') {
        db = normalizeDatabase(externalDB, { strict: false });
    }
    try {
        if (indexedState?.meta) dbMeta = normalizeMeta(indexedState.meta);
        else dbMeta = normalizeMeta(localMeta ? JSON.parse(localMeta) : (typeof externalDBMeta !== 'undefined' ? externalDBMeta : {}));
    } catch { dbMeta = normalizeMeta({}); }

    let sourceSchemaVersion = Number(indexedState?.meta?.schemaVersion || 0);
    if (!sourceSchemaVersion && localMeta) {
        try { sourceSchemaVersion = Number(JSON.parse(localMeta)?.schemaVersion || 0); }
        catch { sourceSchemaVersion = 0; }
    }
    if (loadedLegacyStorage || sourceSchemaVersion < DB_SCHEMA_VERSION) markDataDirty({ metadata: true });

    // 每次啟動都向網站重新驗證 database.js；內容未變時不解析、不合併、不寫入。
    // 因此僅需查看資料的同事不必設定 GitHub Token，也不必使用無痕模式。
    try {
        const published = await fetchPublishedDatabase({ allowNotModified: Boolean(indexedState?.db || local) });
        publishedAvailable = Boolean(published);
        if (published && !published.notModified) {
            const merged = mergeDatabases(db, published.db, dbMeta, published.meta);
            db = merged.db;
            dbMeta = merged.meta;
            markDataDirty({ metadata: true });
            pendingPublishedFingerprint = published.fingerprint || '';
            pendingPublishedEtag = published.etag || '';
        }
    } catch (err) {
        console.warn('Published database unavailable, using local data:', err);
        showToast('最新公開資料暫時無法讀取，已使用本機資料');
    }

    // 公開版本可用時不再為有 Token 的電腦重複下載同一份 GitHub 內容。
    // 只有公開檔案無法取得時，才以 GitHub API 作為備援。
    const token = localStorage.getItem('gh_token');
    const repo = localStorage.getItem('gh_repo');
    if (!publishedAvailable && token && repo) {
        try {
            const remote = await fetchGitDatabase(repo, token);
            const merged = mergeDatabases(db, remote.db, dbMeta, remote.meta);
            db = merged.db; dbMeta = merged.meta;
            markDataDirty({ metadata: true });
            if (remote.sha) localStorage.setItem('gh_last_sync_sha', remote.sha);
            showToast(merged.stats.remoteOnly + merged.stats.remoteNewer > 0 ? '已合併 GitHub 的新資料' : '已核對 GitHub 資料');
        } catch (e) {
            console.error(e);
            showToast(e.status === 401 || e.status === 403 ? 'GitHub Token 無效，已改用本機' : '連線 GitHub 失敗，已改用本機');
        }
    }
    if (dataRevision > persistedRevision) {
        const saved = await persistLocal();
        if (saved && pendingPublishedFingerprint) {
            localStorage.setItem('planner_public_fingerprint', pendingPublishedFingerprint);
            if (pendingPublishedEtag) localStorage.setItem('planner_public_etag', pendingPublishedEtag);
        }
    }
}

/* =============================================================
   日期工具
============================================================= */
function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const DOW_LABELS = ['日','一','二','三','四','五','六'];

function isValidDateParam(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}
function buildBossPreviewUrl(dateStr = selectedDateStr, postId = currentId) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('preview', 'boss');
    if (isValidDateParam(dateStr)) url.searchParams.set('date', dateStr);
    if (postId) url.searchParams.set('post', postId);
    return url.toString();
}
function openBossPreview() {
    const opened = window.open(buildBossPreviewUrl(), '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
}
function syncBossPreviewUrl() {
    if (!IS_BOSS_PREVIEW) return;
    history.replaceState(null, '', buildBossPreviewUrl(selectedDateStr, currentId));
}
function enableBossPreviewMode() {
    if (!IS_BOSS_PREVIEW) return;
    document.body.classList.add('boss-preview');
    document.title = '大田出版｜貼文預覽';
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = 'BOSS PREVIEW · 唯讀';
    const empty = document.getElementById('empty-state-msg');
    if (empty) empty.innerHTML = '這一天尚無可預覽的貼文';
}

/* =============================================================
   日視圖
============================================================= */
function renderDay() {
    if (!selectedDateStr) return;
    const date = new Date(selectedDateStr + 'T00:00:00');
    const dStr = selectedDateStr;
    const todayStr = fmtDate(new Date());
    const isToday = dStr === todayStr;
    const posts = getSortedDayPosts();

    // topbar 日期標籤
    document.getElementById('day-range-label').innerText =
        `${date.getMonth()+1}/${date.getDate()}（${DOW_LABELS[date.getDay()]}）`;

    // 欄標頭
    document.getElementById('day-col-dow').innerText = DOW_LABELS[date.getDay()];
    document.getElementById('day-col-date').innerText = `${date.getMonth()+1} / ${date.getDate()}`;
    document.getElementById('day-col-count').innerText = posts.length > 0 ? `共 ${posts.length} 則` : '';
    document.getElementById('day-col-header').classList.toggle('is-today-date', isToday);

    const container = document.getElementById('day-list');
    container.innerHTML = '';

    if (posts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'day-list-empty';
        empty.innerHTML = '本日尚無貼文<br>點擊右上角「＋」新增';
        container.appendChild(empty);
    } else {
        posts.forEach(post => {
            const plain = getPlainText(post.caption || '');
            const hasCanva = !!(post.canvaUrl);
            const ratio = post.ratio || '1-1';

            const pc = document.createElement('div');
            pc.className = 'post-card' + (post._id === currentId ? ' active' : '');
            pc.dataset.postId = post._id;
            pc.tabIndex = 0; pc.setAttribute('role', 'button');
            pc.onclick = () => loadPost(post._id);
            pc.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pc.click(); } };

            const timeEl = document.createElement('div');
            timeEl.className = 'post-card-time'; timeEl.innerText = post.time || '??:??';

            const bodyEl = document.createElement('div');
            bodyEl.className = 'post-card-body';

            const titleEl = document.createElement('div');
            titleEl.className = 'post-card-title';
            const structuredTitle = [post.theme ? `【${post.theme}】` : '', post.title ? `《${post.title}》` : ''].filter(Boolean).join(' ');
            titleEl.innerText = structuredTitle || plain.slice(0, 30) || '（無內文）';

            const previewEl = document.createElement('div');
            previewEl.className = 'post-card-preview';
            previewEl.innerText = structuredTitle ? plain.slice(0, 100) : (plain.length > 30 ? plain.slice(30, 100) : '');

            const metaEl = document.createElement('div');
            metaEl.className = 'post-card-meta';

            const ratioTag = document.createElement('span');
            ratioTag.className = 'post-card-tag';
            ratioTag.innerText = ratio === '1-1' ? '1:1' : ratio === '4-5' ? '4:5' : '16:9';
            metaEl.appendChild(ratioTag);

            const statusTag = document.createElement('span');
            statusTag.className = 'post-card-tag' + (post.status === 'ready' ? ' status-ready' : post.status === 'published' ? ' status-published' : '');
            statusTag.innerText = STATUS_LABELS[post.status] || STATUS_LABELS.draft;
            metaEl.appendChild(statusTag);

            if (hasCanva) {
                const canvaTag = document.createElement('span');
                canvaTag.className = 'post-card-tag has-canva';
                canvaTag.innerText = 'Canva';
                metaEl.appendChild(canvaTag);
            }

            bodyEl.appendChild(titleEl);
            if (previewEl.innerText) bodyEl.appendChild(previewEl);
            bodyEl.appendChild(metaEl);

            pc.appendChild(timeEl); pc.appendChild(bodyEl);
            container.appendChild(pc);
        });
    }

    // 同步更新日曆浮動視窗（如果開著）
    if (document.getElementById('cal-overlay').classList.contains('open')) renderCalPopup();
    updatePresentationNav();
}

function changeDay(dir) {
    const base = selectedDateStr ? new Date(selectedDateStr + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + dir);
    selectDate(fmtDate(base));
}

/* =============================================================
   日期選取
============================================================= */
function selectDate(dateStr) {
    selectedDateStr = dateStr;
    currentId = null;
    showEditor(false);
    renderDay();
    // 自動選第一則貼文
    const list = [...(db[dateStr] || [])].sort((a, b) => (a.time||'00:00').localeCompare(b.time||'00:00'));
    if (list.length > 0) loadPost(list[0]._id);
    else {
        syncBossPreviewUrl();
        if (document.body.classList.contains('presenting')) togglePresenting();
    }
    if (isMobile()) mobileShowPanel('day');
}

const _scratch = document.createElement('div');
function getPlainText(html) { _scratch.innerHTML = sanitizeCaptionHtml(html); return _scratch.innerText || ''; }

/* =============================================================
   編輯器開關
============================================================= */
function showEditor(visible) {
    if (!visible && document.body.classList.contains('editor-focused')) toggleEditorFocus(false);
    document.body.classList.toggle('has-preview', visible);
    document.getElementById('empty-state-msg').style.display = visible ? 'none' : 'flex';
    document.getElementById('editor-ui').style.display = visible && !IS_BOSS_PREVIEW ? 'flex' : 'none';
    document.getElementById('preview-ui').style.display = visible ? 'flex' : 'none';
}

function setActivePostCard(id) {
    document.querySelectorAll('.post-card.active').forEach(card => card.classList.remove('active'));
    const card = [...document.querySelectorAll('.post-card')].find(item => item.dataset.postId === String(id));
    card?.classList.add('active');
    updatePresentationNav();
}

function toggleEditorFocus(force) {
    if (isMobile()) return;
    const next = typeof force === 'boolean' ? force : !document.body.classList.contains('editor-focused');
    document.body.classList.toggle('editor-focused', next);
    const btn = document.getElementById('editor-focus-btn');
    btn.innerText = next ? '✕ 結束專注' : '⛶ 專注編輯';
    btn.setAttribute('aria-pressed', String(next));
    if (next) setTimeout(() => document.getElementById('edit-caption').focus(), 50);
}

/* =============================================================
   載入 / 更新貼文
============================================================= */
function loadPost(id) {
    currentId = id; isIGExpanded = false; isFBExpanded = false;
    const post = getPostById(id);
    if (!post) return;
    document.getElementById('edit-time').value = post.time || '09:00';
    document.getElementById('edit-ratio').value = post.ratio || '1-1';
    document.getElementById('edit-theme').value = post.theme || '';
    document.getElementById('edit-title').value = post.title || '';
    document.getElementById('edit-status').value = post.status || 'draft';
    document.getElementById('canva-url-input').value = post.canvaUrl || '';
    document.getElementById('edit-caption').innerHTML = post.caption || '';
    updateCanvaLauncherState(post);
    showEditor(true);
    lastRenderedMediaKeys = { instagram: null, facebook: null };
    updatePreview();
    updateToolbarState();
    setActivePostCard(id);
    syncBossPreviewUrl();
    if (isMobile()) setTimeout(() => mobileShowPanel('preview'), 50);
}
function updateCurrentPost(field, value) {
    if (IS_BOSS_PREVIEW) return;
    if (currentId === null) return;
    const post = getPostById(currentId);
    if (!post) return;
    if (field === 'caption') value = sanitizeCaptionHtml(value);
    if (field === 'ratio' && !VALID_RATIOS.has(value)) return;
    if (field === 'status' && !VALID_STATUSES.has(value)) return;
    if (post[field] === value) return;
    post[field] = value;
    const now = new Date().toISOString();
    post.createdAt = post.createdAt || now;
    post.updatedAt = now;
    if (field === 'canvaUrl') updateCanvaLauncherState(post);
    const isTextInput = TEXT_INPUT_FIELDS.has(field);
    const affectsMetadata = field === 'caption' || field === 'theme' || field === 'title';
    saveLocal({ debounce: isTextInput, metadata: affectsMetadata });

    if (field === 'caption') schedulePreviewRender();
    else if (field === 'canvaUrl') schedulePreviewRender(360);
    else if (field === 'theme') schedulePreviewRender(240);
    else if (field === 'time' || field === 'ratio') updatePreview();

    if (isTextInput) scheduleDayRender();
    else renderDay();
}

/* =============================================================
   新增 / 刪除
============================================================= */
function createNewPost() {
    if (IS_BOSS_PREVIEW) return;
    if (!selectedDateStr) return;
    if (!db[selectedDateStr]) db[selectedDateStr] = [];
    const newId = newPostId();
    const now = new Date().toISOString();
    db[selectedDateStr].push({ _id: newId, caption: '', time: '09:00', canvaUrl: '', ratio: '1-1', theme: '', title: '', status: 'draft', createdAt: now, updatedAt: now });
    saveLocal({ metadata: true }); renderDay(); loadPost(newId);
}
async function deletePost() {
    if (IS_BOSS_PREVIEW) return;
    const ok = await showConfirm('確定刪除此貼文？此動作無法復原。');
    if (!ok) return;
    dbMeta.tombstones[currentId] = new Date().toISOString();
    db[selectedDateStr] = db[selectedDateStr].filter(p => p._id !== currentId);
    currentId = null; saveLocal({ metadata: true }); renderDay();
    const remaining = getSortedDayPosts();
    if (remaining.length) loadPost(remaining[0]._id);
    else showEditor(false);
}

/* =============================================================
   快速新增貼文（模板化小視窗）
============================================================= */
const QA_DEFAULT_THEMES = ['早上只讀一點點', '晚上多讀一點點', '圖文時間', '編輯內心戲'];
const QA_DEFAULT_TIMES = ['08:00', '20:00', '23:00'];

function qaEscapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function qaGetStored(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function qaAddStored(key, value) {
    if (!value) return;
    const list = qaGetStored(key);
    if (!list.includes(value)) {
        list.push(value);
        localStorage.setItem(key, JSON.stringify(list));
        metadataIndexDirty = true;
    }
}
function getMetadataIndex() {
    if (!metadataIndexDirty) return metadataIndexCache;
    metadataIndexCache = PlannerPerformance.collectMetadata(db, {
        defaultThemes: QA_DEFAULT_THEMES,
        storedThemes: qaGetStored('qa_themes'),
        storedBooks: qaGetStored('qa_books'),
        getPlainText
    });
    metadataIndexDirty = false;
    return metadataIndexCache;
}
function fillMetadataDatalist(id, values) {
    const datalist = document.getElementById(id);
    if (!datalist) return;
    const uniqueValues = Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean)));
    datalist.replaceChildren(...uniqueValues.map(value => {
        const option = document.createElement('option');
        option.value = value;
        return option;
    }));
}
function refreshMetadataDatalists() {
    const index = getMetadataIndex();
    fillMetadataDatalist('theme-options', index.themes);
    fillMetadataDatalist('book-options', index.books);
}
function commitMetadataOption(field, value) {
    const cleaned = String(value || '').trim();
    const input = document.getElementById(field === 'theme' ? 'edit-theme' : 'edit-title');
    if (input && input.value !== cleaned) input.value = cleaned;
    if (!cleaned) return;
    qaAddStored(field === 'theme' ? 'qa_themes' : 'qa_books', cleaned);
    updateCurrentPost(field, cleaned);
    refreshMetadataDatalists();
}
function qaLoadCanvaHistory() {
    const items = [];
    const seenUrls = new Set();
    Object.keys(db).sort().reverse().forEach(dateStr => {
        (db[dateStr] || []).forEach(p => {
            if (!p.canvaUrl || seenUrls.has(p.canvaUrl)) return;
            seenUrls.add(p.canvaUrl);
            const plain = getPlainText(p.caption || '');
            const themeM = p.theme ? [null, p.theme] : plain.match(/【([^】]+)】/);
            const titleM = p.title ? [null, p.title] : plain.match(/《([^》]+)》/);
            let label = dateStr.slice(5).replace('-', '/') + ' ';
            if (themeM) label += `【${themeM[1]}】`;
            if (titleM) label += `《${titleM[1]}》`;
            if (!themeM && !titleM) label += (plain.slice(0, 16) || '（無內文）');
            items.push({ url: p.canvaUrl, label });
        });
    });
    return items.slice(0, 80);
}

function openQuickAdd() {
    if (IS_BOSS_PREVIEW) return;
    if (!selectedDateStr) return;
    refreshMetadataDatalists();
    document.getElementById('qa-theme-input').value = '';
    document.getElementById('qa-title-input').value = '';

    const timeSel = document.getElementById('qa-time-select');
    timeSel.innerHTML = '<option value="">— 常用時間 —</option>' +
        QA_DEFAULT_TIMES.map(t => `<option value="${t}">${t}</option>`).join('');
    document.getElementById('qa-time-input').value = '09:00';

    const canvaSel = document.getElementById('qa-canva-select');
    const history = qaLoadCanvaHistory();
    canvaSel.innerHTML = '<option value="">— 選擇之前用過的連結 —</option>' +
        history.map(h => `<option value="${qaEscapeHtml(h.url)}">${qaEscapeHtml(h.label)}</option>`).join('');
    document.getElementById('qa-canva-input').value = '';

    document.getElementById('qa-ratio-select').value = '4-5';
    document.getElementById('quickadd-overlay').classList.add('open');
}
function closeQuickAdd() { document.getElementById('quickadd-overlay').classList.remove('open'); }
function onQaTimeSelect(v) { if (v) document.getElementById('qa-time-input').value = v; }
function onQaCanvaSelect(v) { if (v) document.getElementById('qa-canva-input').value = v; }

function skipQuickAdd() { closeQuickAdd(); createNewPost(); }

/* =============================================================
   發布文案：組合結構化欄位並複製到其他平台
============================================================= */
function getPublishComposition() {
    const post = getPostById(currentId);
    if (!post) return null;
    return PostComposerService.compose(post, getPlainText(post.caption || ''));
}

function openPublishComposer() {
    if (!getPostById(currentId)) {
        showToast('請先選擇一篇貼文');
        return;
    }
    resetPublishComposer();
    document.getElementById('publish-overlay').classList.add('open');
    setTimeout(() => document.getElementById('publish-output')?.focus(), 50);
}

function closePublishComposer() {
    document.getElementById('publish-overlay').classList.remove('open');
}

function resetPublishComposer() {
    const post = getPostById(currentId);
    const composition = getPublishComposition();
    if (!post || !composition) return;
    document.getElementById('publish-output').value = composition.text;
    document.getElementById('publish-theme-value').textContent = post.theme || '未設定';
    document.getElementById('publish-title-value').textContent = post.title || '未設定';
    updatePublishComposerStats();
}

function updatePublishComposerStats() {
    const post = getPostById(currentId);
    const output = document.getElementById('publish-output');
    if (!post || !output) return;
    const stats = PostComposerService.inspect(output.value);
    document.getElementById('publish-char-count').textContent = String(stats.characterCount);
    document.getElementById('publish-line-count').textContent = String(stats.lineCount);
    document.getElementById('publish-tag-count').textContent = String(stats.hashtags.length);
    document.getElementById('publish-source-value').textContent = stats.sourceLines.join('、') || '未偵測';
    document.getElementById('publish-hashtag-value').textContent = stats.hashtags.join(' ') || '未偵測';
    const missing = [];
    if (!post.theme) missing.push('主題');
    if (!post.title) missing.push('書名');
    if (!stats.sourceLines.length) missing.push('頁碼');
    if (!stats.hashtags.length) missing.push('Hashtag');
    const check = document.getElementById('publish-check');
    check.className = `publish-check ${missing.length ? 'warning' : 'complete'}`;
    check.textContent = missing.length
        ? `複製前請確認：尚未偵測到${missing.join('、')}。`
        : '✓ 主題、書名、頁碼與標籤皆已包含。';
}

async function writeClipboardText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('瀏覽器拒絕存取剪貼簿');
}

async function copyPublishText(mode = 'full') {
    const output = document.getElementById('publish-output');
    if (!output) return;
    const fullText = PostComposerService.normalizeText(output.value);
    const text = mode === 'body' ? PostComposerService.stripExistingHeader(fullText) : fullText;
    if (!text) {
        showToast('目前沒有可複製的內容');
        return;
    }
    try {
        await writeClipboardText(text);
        showToast(mode === 'body' ? '已複製貼文內文' : `已複製完整貼文，共 ${Array.from(text).length} 字`);
    } catch (error) {
        console.error('Copy failed:', error);
        output.focus(); output.select();
        showToast('自動複製失敗，已選取文字，請按 Ctrl+C', 4200);
    }
}

function submitQuickAdd() {
    if (IS_BOSS_PREVIEW) return;
    if (!selectedDateStr) return;
    const theme = document.getElementById('qa-theme-input').value.trim();
    const title = document.getElementById('qa-title-input').value.trim();
    const time = document.getElementById('qa-time-input').value || '09:00';
    const canvaUrl = document.getElementById('qa-canva-input').value.trim();
    const ratio = document.getElementById('qa-ratio-select').value || '4-5';

    let opening = '';
    if (theme) opening += `【${theme}】`;
    if (title) opening += (theme ? ' ' : '') + `《${title}》`;
    const caption = opening
        ? `<div>${qaEscapeHtml(opening)}</div><div><br></div>`
        : '';

    if (!db[selectedDateStr]) db[selectedDateStr] = [];
    const newId = newPostId();
    const now = new Date().toISOString();
    db[selectedDateStr].push({ _id: newId, caption, time, canvaUrl, ratio, theme, title, status: 'draft', createdAt: now, updatedAt: now });

    qaAddStored('qa_themes', theme);
    qaAddStored('qa_books', title);

    saveLocal({ metadata: true }); renderDay(); loadPost(newId);
    closeQuickAdd();
}

/* =============================================================
   IG 預覽
============================================================= */
function updateCanvaLauncherState(post = getPostById(currentId)) {
    const launcher = document.querySelector('.canva-launcher');
    const state = document.getElementById('canva-launcher-state');
    const linked = Boolean(post?.canvaUrl?.trim());
    launcher?.classList.toggle('linked', linked);
    const embed = CanvaService.parseEmbedUrl(post?.canvaUrl || '');
    if (state) {
        state.textContent = embed?.embedUrl
            ? '已連結，使用官方預覽'
            : (linked ? '請改貼完整分享連結' : '尚未連結');
    }
    const footer = document.getElementById('canva-footer-status');
    if (footer) {
        footer.textContent = embed?.embedUrl
            ? '已使用 Canva 官方內嵌檢視器'
            : (linked ? '短網址無法直接嵌入，請貼上完整分享連結' : '貼上完整分享連結後即可預覽');
    }
}

function openCanvaTool() {
    const post = getPostById(currentId);
    if (!post) {
        showToast('請先選擇一篇貼文');
        return;
    }
    document.getElementById('canva-url-input').value = post.canvaUrl || '';
    updateCanvaLauncherState(post);
    document.getElementById('canva-tool-overlay').classList.add('open');
    if (!post.canvaUrl) setTimeout(() => document.getElementById('canva-url-input')?.focus(), 50);
}

function closeCanvaTool() {
    document.getElementById('canva-tool-overlay').classList.remove('open');
}

function openCanvaWindow(url) {
    if (!CanvaService.parsePublicUrl(url || '')) {
        showToast('請先輸入有效的 Canva 公開連結');
        return false;
    }
    const opened = window.open(url.trim(), '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
    return Boolean(opened);
}
function openCurrentCanva() {
    const post = getPostById(currentId);
    if (post) openCanvaWindow(post.canvaUrl);
}
function isSafeColor(value) {
    return typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value.trim());
}
function sanitizeCaptionHtml(html) {
    const source = document.createElement('div');
    source.innerHTML = String(html || '');
    const allowed = new Set(['DIV', 'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'FONT']);
    const forbidden = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO', 'AUDIO', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON']);
    const cleanNode = node => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        if (forbidden.has(node.tagName)) return document.createDocumentFragment();
        if (!allowed.has(node.tagName)) {
            const fragment = document.createDocumentFragment();
            [...node.childNodes].forEach(child => fragment.appendChild(cleanNode(child)));
            return fragment;
        }
        const clean = document.createElement(node.tagName === 'P' ? 'div' : node.tagName.toLowerCase());
        if (node.tagName === 'DIV' && ['h1', 'h2', 'quote'].includes(node.getAttribute('data-block'))) {
            clean.setAttribute('data-block', node.getAttribute('data-block'));
        }
        if (node.tagName === 'FONT' && isSafeColor(node.getAttribute('color'))) clean.setAttribute('color', node.getAttribute('color'));
        if (node.tagName === 'SPAN') {
            const safeStyles = [];
            if (isSafeColor(node.style.color)) safeStyles.push(`color:${node.style.color}`);
            if (isSafeColor(node.style.backgroundColor)) safeStyles.push(`background-color:${node.style.backgroundColor}`);
            if (/^(normal|italic)$/.test(node.style.fontStyle)) safeStyles.push(`font-style:${node.style.fontStyle}`);
            if (/^(normal|bold|[1-9]00)$/.test(node.style.fontWeight)) safeStyles.push(`font-weight:${node.style.fontWeight}`);
            if (/^(none|underline|line-through)(\s+(underline|line-through))?$/.test(node.style.textDecorationLine)) safeStyles.push(`text-decoration-line:${node.style.textDecorationLine}`);
            if (safeStyles.length) clean.setAttribute('style', safeStyles.join(';'));
        }
        [...node.childNodes].forEach(child => clean.appendChild(cleanNode(child)));
        return clean;
    };
    const output = document.createElement('div');
    [...source.childNodes].forEach(node => output.appendChild(cleanNode(node)));
    return output.innerHTML;
}
function decorateHashtags(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    const pattern = /#([^\s<>&"'，。、！？；：「」,.!?;:()\[\]《》]+)/g;
    textNodes.forEach(node => {
        const text = node.nodeValue || '';
        pattern.lastIndex = 0;
        if (!pattern.test(text)) return;
        pattern.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let cursor = 0; let match;
        while ((match = pattern.exec(text))) {
            fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            const span = document.createElement('span'); span.className = 'hashtag-link'; span.textContent = match[0];
            fragment.appendChild(span); cursor = match.index + match[0].length;
        }
        fragment.appendChild(document.createTextNode(text.slice(cursor)));
        node.replaceWith(fragment);
    });
}
function renderCaptionHtml(container, html) {
    const safeRoot = document.createElement('span');
    safeRoot.innerHTML = sanitizeCaptionHtml(html);
    decorateHashtags(safeRoot);
    container.replaceChildren(...safeRoot.childNodes);
}
function renderCaptionText(container, text) {
    const root = document.createElement('span'); root.textContent = text;
    decorateHashtags(root);
    container.replaceChildren(...root.childNodes);
}
function canvaSlideUrl(embedUrl, pageNumber) {
    const url = new URL(embedUrl);
    url.hash = String(pageNumber);
    return url.toString();
}
function createCanvaFrame(embedUrl, title, { pageNumber = null, staticPreview = false } = {}) {
    const frame = document.createElement('iframe');
    frame.className = 'canva-frame';
    frame.src = pageNumber ? canvaSlideUrl(embedUrl, pageNumber) : embedUrl;
    frame.title = title;
    frame.loading = 'lazy';
    frame.allow = 'fullscreen';
    frame.setAttribute('allowfullscreen', '');
    if (staticPreview) {
        frame.classList.add('fb-static-frame');
        frame.style.pointerEvents = 'none';
        frame.tabIndex = -1;
    }
    return frame;
}
function appendStaticShield(container) {
    const shield = document.createElement('div');
    shield.className = 'fb-media-shield';
    shield.setAttribute('aria-hidden', 'true');
    container.appendChild(shield);
}
function renderCanvaMedia(container, { ratio, embedUrl, publicCanva, sourceUrl, title, firstCardOnly = false, facebookGallery = false }) {
    const baseClass = container.id === 'prev-fb-media' ? 'fb-media' : 'ig-media';
    container.className = facebookGallery ? 'fb-media fb-gallery-grid' : `${baseClass} r-${ratio}`;
    container.replaceChildren();
    if (embedUrl) {
        if (facebookGallery) {
            for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
                const tile = document.createElement('div');
                tile.className = 'fb-gallery-tile';
                tile.appendChild(createCanvaFrame(embedUrl, `${title}｜第 ${pageNumber} 張`, { pageNumber, staticPreview: true }));
                appendStaticShield(tile);
                container.appendChild(tile);
            }
            return;
        }
        const frame = createCanvaFrame(embedUrl, title, { pageNumber: firstCardOnly ? 1 : null, staticPreview: firstCardOnly });
        container.appendChild(frame);
        if (firstCardOnly) appendStaticShield(container);
        return;
    }
    const empty = document.createElement('div');
    empty.className = 'ig-media-empty';
    if (publicCanva?.kind === 'short') {
        empty.innerText = 'Canva 短網址無法直接嵌入。請改貼完整的 /design/…/view 分享連結。';
    } else {
        empty.innerText = sourceUrl ? 'Canva 連結格式不正確' : '尚未設定 Canva 連結';
    }
    container.appendChild(empty);
}
function updatePreview() {
    const post = getPostById(currentId);
    if (!post) return;
    document.getElementById('prev-ig-time').innerText = post.time || '09:00';
    document.getElementById('prev-ig-time-label').innerText = formatTimeLabel(post.time);
    document.getElementById('prev-fb-time').innerText = `${formatTimeLabel(post.time)} · 🌐`;
    const publicCanva = CanvaService.parsePublicUrl(post.canvaUrl || '');
    const canvaEmbed = CanvaService.parseEmbedUrl(post.canvaUrl || '');
    const ratio = post.ratio || '1-1';
    const isFacebookGallery = String(post.theme || '').trim() === '圖文時間';
    const baseMediaKey = `${ratio}|${canvaEmbed?.embedUrl || publicCanva?.sourceUrl || ''}`;
    const instagramKey = `instagram|${baseMediaKey}`;
    const facebookKey = `facebook|${baseMediaKey}|${isFacebookGallery ? 'gallery' : 'first'}`;
    if (instagramKey !== lastRenderedMediaKeys.instagram) {
        lastRenderedMediaKeys.instagram = instagramKey;
        renderCanvaMedia(document.getElementById('prev-ig-media'), {
            ratio,
            embedUrl: canvaEmbed?.embedUrl,
            publicCanva,
            sourceUrl: post.canvaUrl,
            title: 'Instagram Canva 完整輪播預覽'
        });
    }
    if (facebookKey !== lastRenderedMediaKeys.facebook) {
        lastRenderedMediaKeys.facebook = facebookKey;
        renderCanvaMedia(document.getElementById('prev-fb-media'), {
            ratio,
            embedUrl: canvaEmbed?.embedUrl,
            publicCanva,
            sourceUrl: post.canvaUrl,
            title: isFacebookGallery ? 'Facebook 圖文時間完整圖組預覽' : 'Facebook 第一張字卡預覽',
            firstCardOnly: !isFacebookGallery,
            facebookGallery: isFacebookGallery
        });
    }
    document.getElementById('fb-media-rule').innerText = isFacebookGallery
        ? 'Facebook 預覽｜「圖文時間」使用四圖排列'
        : 'Facebook 預覽｜實際發文僅使用第一張字卡';
    document.getElementById('facebook-preview-summary').innerText = isFacebookGallery
        ? '圖文時間 · 四圖排列'
        : '一般貼文 · 僅第一張字卡';
    const raw = post.caption || '';
    const plain = getPlainText(raw);
    const captionEl = document.getElementById('prev-ig-caption');
    const moreBtn = document.getElementById('ig-more-trigger');
    if (!isIGExpanded && (plain.length > 80 || raw.includes('\n') || raw.includes('<br'))) {
        renderCaptionText(captionEl, plain.slice(0, 75) + '…');
        moreBtn.innerText = '更多'; moreBtn.style.display = 'inline';
    } else if (isIGExpanded) {
        renderCaptionHtml(captionEl, raw); moreBtn.innerText = '收起'; moreBtn.style.display = 'inline';
    } else {
        renderCaptionHtml(captionEl, raw); moreBtn.style.display = 'none';
    }
    const fbCaptionEl = document.getElementById('prev-fb-caption');
    const fbMoreBtn = document.getElementById('fb-more-trigger');
    const shouldCollapseFB = plain.length > 180 || plain.split(/\r?\n/).length > 6;
    if (!isFBExpanded && shouldCollapseFB) {
        renderCaptionText(fbCaptionEl, plain.slice(0, 180).trimEnd() + '…');
        fbMoreBtn.innerText = '顯示更多'; fbMoreBtn.style.display = 'inline';
    } else if (isFBExpanded && shouldCollapseFB) {
        renderCaptionHtml(fbCaptionEl, raw);
        fbMoreBtn.innerText = '收合'; fbMoreBtn.style.display = 'inline';
    } else {
        renderCaptionHtml(fbCaptionEl, raw); fbMoreBtn.style.display = 'none';
    }
}
function toggleIGExpand() { isIGExpanded = !isIGExpanded; updatePreview(); }
function toggleFBExpand() { isFBExpanded = !isFBExpanded; updatePreview(); }
function formatTimeLabel(time) {
    if (!time) return '剛剛';
    const [h, m] = time.split(':').map(Number);
    const ampm = h < 12 ? '上午' : '下午';
    return `預計 ${ampm} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}

/* =============================================================
   文字編輯器
============================================================= */
function applyBlock(type) {
    const editor = document.getElementById('edit-caption'); editor.focus();
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    if (type === 'p') {
        document.execCommand('formatBlock', false, 'div');
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== editor) { if (node.nodeType === 1 && node.hasAttribute?.('data-block')) { node.removeAttribute('data-block'); node.className = ''; } node = node.parentNode; }
    } else {
        document.execCommand('formatBlock', false, 'div');
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== editor) { if (node.nodeType === 1 && node.tagName === 'DIV') { node.setAttribute('data-block', type); break; } node = node.parentNode; }
    }
    onCaptionInput();
}
function applyInline(command) { const e = document.getElementById('edit-caption'); e.focus(); document.execCommand(command, false, null); onCaptionInput(); updateToolbarState(); }
function applyHighlight() { document.getElementById('edit-caption').focus(); document.execCommand('backColor', false, 'rgba(232,196,84,0.5)'); onCaptionInput(); }
function applyColor(hex) { document.getElementById('edit-caption').focus(); document.execCommand('foreColor', false, hex); onCaptionInput(); }
function clearFormat() {
    const editor = document.getElementById('edit-caption'); editor.focus();
    const sel = window.getSelection();
    if (sel.rangeCount) {
        document.execCommand('removeFormat', false, null);
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node !== editor) { if (node.nodeType === 1 && node.hasAttribute?.('data-block')) node.removeAttribute('data-block'); node = node.parentNode; }
    }
    onCaptionInput();
}
function insertLineBreak() {
    const editor = document.getElementById('edit-caption'); editor.focus();
    const sel = window.getSelection(); if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0); range.deleteContents();
    const br = document.createElement('br'); range.insertNode(br);
    const after = document.createRange(); after.setStartAfter(br); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    onCaptionInput();
}
function onCaptionKeydown(e) { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); insertLineBreak(); } }
function onCaptionInput() { updateCurrentPost('caption', document.getElementById('edit-caption').innerHTML); }
function updateToolbarState() {
    if (typeof document.queryCommandState !== 'function') return;
    ['bold','italic','underline','strikeThrough'].forEach((cmd, i) => {
        document.getElementById(['tb-bold','tb-italic','tb-underline','tb-strike'][i]).classList.toggle('active-fmt', document.queryCommandState(cmd));
    });
}

/* =============================================================
   手機版
============================================================= */
function isMobile() { return window.innerWidth <= 767; }
let mobileCurrentPanel = 'day';
function mobileShowPanel(panel) {
    if (!isMobile()) return;
    mobileCurrentPanel = panel;
    document.getElementById('day-col').classList.toggle('mobile-visible', panel === 'day');
    document.getElementById('main-content-area').classList.toggle('mobile-visible', panel === 'preview');
    ['day','preview'].forEach(k => document.getElementById('mnav-' + k)?.classList.remove('active'));
    document.getElementById('mnav-' + panel)?.classList.add('active');
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (document.body.classList.contains('editor-focused')) toggleEditorFocus(false);
        else if (document.getElementById('confirm-modal').classList.contains('show')) closeConfirmModal(false);
        else if (document.getElementById('publish-overlay').classList.contains('open')) closePublishComposer();
        else if (document.getElementById('canva-tool-overlay').classList.contains('open')) closeCanvaTool();
        else if (document.getElementById('quickadd-overlay').classList.contains('open')) closeQuickAdd();
        else if (document.getElementById('cal-overlay').classList.contains('open')) closeCalOverlay();
        else if (document.getElementById('gh-overlay').classList.contains('open')) closeGhOverlay();
        else if (document.body.classList.contains('presenting')) togglePresenting();
        return;
    }
    if (!document.body.classList.contains('presenting')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); changePresentationPost(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); changePresentationPost(1); }
});
window.addEventListener('beforeunload', () => { if (localSaveTimer) persistLocal(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && localSaveTimer) persistLocal(); });

/* =============================================================
   啟動
============================================================= */
window.addEventListener('DOMContentLoaded', async () => {
    enableBossPreviewMode();
    document.getElementById('gh-token').value = localStorage.getItem('gh_token') || '';
    document.getElementById('gh-repo').value = localStorage.getItem('gh_repo') || '';
    await initDatabase();
    refreshMetadataDatalists();
    // 跳到今天並選取
    const today = new Date();
    const todayStr = fmtDate(today);
    const requestedDate = isValidDateParam(PAGE_PARAMS.get('date')) ? PAGE_PARAMS.get('date') : todayStr;
    const requestedPost = PAGE_PARAMS.get('post');
    selectDate(requestedDate);
    if (requestedPost && (db[requestedDate] || []).some(post => post._id === requestedPost)) loadPost(requestedPost);
    if (isMobile()) { document.getElementById('day-col').classList.add('mobile-visible'); }
});
