// 備課小幫手 Service Worker
// 26-a40dbcdc33251cdce6a34448da603ba0d2f6984e 於 build 時由 vite.config.js 換成「CI run number-commit hash」，
// 每個新 commit 都會讓 sw.js 內容改變，瀏覽器才偵測得到新版。
const VERSION = '26-a40dbcdc33251cdce6a34448da603ba0d2f6984e';
const CACHE_PREFIX = 'prepare-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

// ⚠️ 不預快取 index.html：舊 HTML 會指向已刪除的 hashed 檔案。HTML 一律走網路優先。
const PRECACHE = ['./manifest.webmanifest', './favicon.ico', './icon-192.png'];

self.addEventListener('install', (event) => {
    // 不呼叫 skipWaiting：保留 waiting 狀態，讓頁面提示使用者「有新版」
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const type = event.data?.type;
    if (type === 'GET_VERSION') {
        event.ports[0]?.postMessage({ version: VERSION });
    } else if (type === 'SKIP_WAITING') {
        event.waitUntil(self.skipWaiting());
    }
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE);
    try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) cache.put(request, response.clone());
        return response;
    } catch (error) {
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        throw error;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    // 只處理同網域；教案 API、Cloudflare 驗證等外部請求直接放行
    if (url.origin !== self.location.origin) return;
    if (url.pathname.endsWith('/sw.js')) return;

    // /assets/ 底下是 Vite 帶 hash 的檔名，內容不會變，可放心快取優先
    if (url.pathname.includes('/assets/')) {
        event.respondWith(cacheFirst(request));
        return;
    }
    event.respondWith(networkFirst(request));
});
