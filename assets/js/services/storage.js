(function storageService(global) {
    'use strict';

    const DB_NAME = 'ig_post_planner';
    const STORE_NAME = 'state';
    const STATE_KEY = 'current';
    let databasePromise = null;

    function openDatabase() {
        if (databasePromise) return databasePromise;
        databasePromise = new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('此瀏覽器不支援 IndexedDB'));
                return;
            }

            const request = global.indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('無法開啟瀏覽器資料庫'));
            request.onblocked = () => reject(new Error('瀏覽器資料庫正在被其他分頁使用'));
        });
        return databasePromise;
    }

    async function readState() {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('無法讀取瀏覽器資料庫'));
        });
    }

    async function writeState(state) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).put(state, STATE_KEY);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('無法寫入瀏覽器資料庫'));
            transaction.onabort = () => reject(transaction.error || new Error('瀏覽器資料庫寫入已中止'));
        });
    }

    global.PlannerStorage = Object.freeze({ readState, writeState });
})(window);
