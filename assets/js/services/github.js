(function githubService(global) {
    'use strict';

    const API_ROOT = 'https://api.github.com';
    const DEFAULT_PATH = 'database.js';

    function authHeaders(token, withBody = false) {
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (withBody) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function assertRepo(repo) {
        const value = String(repo || '').trim();
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
            throw new Error('儲存庫格式應為「使用者名稱/儲存庫名稱」');
        }
        return value;
    }

    function decodeContent(content) {
        const binary = atob(String(content || '').replace(/\s/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new TextDecoder().decode(bytes);
    }

    function encodeContent(content) {
        const bytes = new TextEncoder().encode(String(content || ''));
        const chunkSize = 0x8000;
        let binary = '';
        for (let index = 0; index < bytes.length; index += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
        }
        return btoa(binary);
    }

    async function readBlob(repo, sha, token) {
        const response = await fetch(`${API_ROOT}/repos/${assertRepo(repo)}/git/blobs/${encodeURIComponent(sha)}`, {
            headers: authHeaders(token),
            cache: 'no-store'
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const error = new Error(body.message || `無法讀取 GitHub 資料（HTTP ${response.status}）`);
            error.status = response.status;
            throw error;
        }
        const blob = await response.json();
        if (blob.encoding !== 'base64' || !blob.content) {
            throw new Error('GitHub 未回傳完整的 database.js 內容');
        }
        return decodeContent(blob.content);
    }

    async function readFile(repo, token, path = DEFAULT_PATH) {
        const safeRepo = assertRepo(repo);
        const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
        const response = await fetch(`${API_ROOT}/repos/${safeRepo}/contents/${encodedPath}?nocache=${Date.now()}`, {
            headers: authHeaders(token),
            cache: 'no-store'
        });
        if (response.status === 404) return { sha: null, text: '' };
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const error = new Error(body.message || `GitHub 讀取失敗（HTTP ${response.status}）`);
            error.status = response.status;
            throw error;
        }

        const file = await response.json();
        let text = '';
        if (file.encoding === 'base64' && file.content) text = decodeContent(file.content);
        else if ((file.size || 0) > 0 && file.sha) text = await readBlob(safeRepo, file.sha, token);
        return { sha: file.sha || null, text };
    }

    async function writeFile({ repo, token, path = DEFAULT_PATH, text, sha = null, message }) {
        const safeRepo = assertRepo(repo);
        const encodedPath = String(path).split('/').map(encodeURIComponent).join('/');
        const body = {
            message: message || `排版更新: ${new Date().toLocaleString()}`,
            content: encodeContent(text)
        };
        if (sha) body.sha = sha;

        const response = await fetch(`${API_ROOT}/repos/${safeRepo}/contents/${encodedPath}`, {
            method: 'PUT',
            headers: authHeaders(token, true),
            body: JSON.stringify(body)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(result.message || `GitHub 寫入失敗（HTTP ${response.status}）`);
            error.status = response.status;
            throw error;
        }
        return result;
    }

    global.GitHubService = Object.freeze({ assertRepo, readFile, writeFile });
})(window);
