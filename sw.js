// =============================================
// sw.js - Service Worker
// =============================================
// ✅ عند كل تحديث: غيّر رقم الإصدار في سطر CACHE_NAME بس (watch-cache.sh بيراقب السطر ده)
const CACHE_FAMILY = 'semester-1';                  // ثابت — أي كاش بيبدأ بـ 'semester-1-' بتاعنا وبيتنضف تلقائيًا
const CACHE_NAME = CACHE_FAMILY + '-cache-v30';
const CONTENT_CACHE = CACHE_FAMILY + '-content';

const RAW_HOST = 'raw.githubusercontent.com';    
const CDN_HOST = 'cdnjs.cloudflare.com';         
const API_HOST = 'api.github.com';               
const WARM_HOSTS = [RAW_HOST, CDN_HOST, API_HOST];

const NETWORK_TIMEOUT_MS = 600;                 
const MAX_CONTENT_ENTRIES = 150;                 
const MAX_CONTENT_BYTES = 80 * 1024 * 1024;      
const TRIM_EVERY = 10;                           

const urlsToCache = [
   './',
   './index.html',
   './style.css',
   './tracker.js',
   './script.js',
   './javascript/core/config.js',
   './javascript/core/utils.js',
   './javascript/core/navigation.js',
   './javascript/core/group-loader.js',
   './javascript/core/state.js',
   './javascript/core/svg-generator.js',
   './javascript/core/update-checker.js',
   './javascript/groups-data.js',
   './javascript/ui/pdf-viewer.js',
   './javascript/ui/wood-interface.js',
   './javascript/ui/search-and-eye.js',
   './javascript/ui/ui-controls.js',
   './javascript/ui/scroll-system.js',
   './javascript/features/leaderboard-core.js',
   './javascript/features/mini-game.js',
   './javascript/features/leaderboard-ui.js',
   './javascript/features/preload-game.js',
   './javascript/features/preload.js',
   './javascript/features/svg-processor.js',
   './javascript/features/sync-local.js',
   './image/0.webp',
   './image/wood.webp',
];

const OFFLINE_HTML = `<!DOCTYPE html>
                        <html dir="rtl" lang="ar">
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <title>وضع Offline</title>
                            <style>
                                body {
                                    font-family: Arial, sans-serif;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    height: 100vh;
                                    margin: 0;
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    text-align: center;
                                }
                                .container { max-width: 500px; padding: 40px; }
                                h1 { font-size: 48px; margin: 0; }
                                p { font-size: 18px; margin: 20px 0; }
                                button {
                                    background: white;
                                    color: #667eea;
                                    border: none;
                                    padding: 15px 30px;
                                    font-size: 16px;
                                    border-radius: 8px;
                                    cursor: pointer;
                                    margin-top: 20px;
                                }
                                button:hover { background: #f0f0f0; }
                            </style>
                        </head>
                        <body>
                            <div class="container">
                                <h1>🔌 وضع Offline</h1>
                                <p>لا يوجد اتصال بالإنترنت</p>
                                <p>تأكد من اتصالك بالشبكة ثم حاول مرة أخرى</p>
                                <button onclick="location.reload()">🔄 إعادة المحاولة</button>
                            </div>
                        </body>
                        </html>`;

const isOurCache = (key) => key.startsWith(CACHE_FAMILY + '-');

function keepAlive(event, promise) {
    try { event.waitUntil(promise); } catch (e) { /* الحدث خلص */ }
    return promise;
}

async function broadcast(message) {
    try {
        const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        windows.forEach(client => client.postMessage(message));
    } catch (e) { /* مفيش صفحات مفتوحة */ }
}

function canCacheShell(response) {
    return !!response && (response.type === 'basic' || response.type === 'cors') && response.ok;
}

function shouldCacheShell(url) {
    try {
        const pathname = new URL(url).pathname;
        if (pathname.includes('sw.js')) return false;
        if (pathname.includes('/javascript/')) return true;
        if (pathname.includes('/image/')) return true;
        return /\.(html|css|js|webp|png|jpg|jpeg|svg|pdf|json)$/.test(pathname);
    } catch (e) {
        return false;
    }
}

function offlineResponse(request) {
    if (request.destination === 'document') {
        return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }
        });
    }
    return new Response('Offline', { status: 503 });
}

let putsSinceTrim = 0;

async function trimContentCache() {
    const cache = await caches.open(CONTENT_CACHE);
    const keys = await cache.keys();
    if (keys.length === 0) return;

    const sizes = await Promise.all(keys.map(async request => {
        const response = await cache.match(request);
        return Number(response && response.headers.get('content-length')) || 0;
    }));

    let count = keys.length;
    let bytes = sizes.reduce((sum, size) => sum + size, 0);
    for (let i = 0; i < keys.length && (count > MAX_CONTENT_ENTRIES || bytes > MAX_CONTENT_BYTES); i++) {
        await cache.delete(keys[i]);
        count--;
        bytes -= sizes[i];
    }
}

async function saveContent(request, response) {
    try {
        const cache = await caches.open(CONTENT_CACHE);
        await cache.put(request, response);
        if (++putsSinceTrim >= TRIM_EVERY) {
            putsSinceTrim = 0;
            await trimContentCache();
        }
    } catch (e) { /* مساحة ممتلئة */ }
}

let precacheRun = null;

function precacheAll() {
    if (precacheRun) return precacheRun;

    precacheRun = (async () => {
        const cache = await caches.open(CACHE_NAME);
        const total = urlsToCache.length;
        const failed = [];
        let done = 0;

        await Promise.all(urlsToCache.map(async url => {
            const fileName = url.split('/').pop() || 'index.html';
            try {
                // ✅ استخدام cache: 'reload' يتجاوز كاش المتصفح (HTTP Cache) ويجلب أحدث نسخة قسراً
                const request = new Request(url, { cache: 'reload' });
                const response = await fetch(request);
                
                if (response.ok) {
                    await cache.put(request, response);
                } else {
                    failed.push(url);
                }
            } catch (err) {
                failed.push(url);
                console.warn(`⚠️ فشل تخزين: ${url}`);
            }
            done++;
            broadcast({ type: 'PRECACHE_PROGRESS', done, total, file: fileName });
        }));

        await broadcast({ type: 'PRECACHE_DONE', total, failed });
    })().finally(() => { precacheRun = null; });

    return precacheRun;
}

async function warmUrls(urls) {
    if (!Array.isArray(urls)) return;
    await Promise.all(urls.map(async raw => {
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || !WARM_HOSTS.includes(url.hostname)) return;
            const response = await fetch(new Request(url.href, { mode: 'cors', credentials: 'omit', cache: 'no-store' }));
            if (response.ok) await saveContent(url.href, response);
        } catch (e) {
            console.warn('⚠️ تعذر تسخين:', raw);
        }
    }));
}

self.addEventListener('install', event => {
    console.log('🔧 Service Worker: تثبيت الإصدار', CACHE_NAME);
    event.waitUntil(
        precacheAll().then(() => {
            console.log('✅ Service Worker: تم التثبيت بنجاح');
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker: تفعيل الإصدار', CACHE_NAME);
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => isOurCache(key) && key !== CACHE_NAME && key !== CONTENT_CACHE)
            .map(key => {
                console.log(`🗑️ حذف كاش قديم: ${key}`);
                return caches.delete(key);
            }));
        await trimContentCache();
        console.log('✅ Service Worker: تم التفعيل');
        await self.clients.claim();
    })());
});

async function staleWhileRevalidate(event) {
    const request = event.request;
    const cached = await caches.match(request);

    const update = fetch(request).then(response => {
        if (shouldCacheShell(request.url) && canCacheShell(response)) {
            const copy = response.clone();
            keepAlive(event, caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
        }
        return response;
    });

    if (cached) {
        keepAlive(event, update.catch(() => {}));
        return cached;
    }
    return update.catch(() => offlineResponse(request));
}

async function cacheFirst(event) {
    const request = event.request;
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const upgraded = request.mode === 'no-cors'
            ? new Request(request.url, { mode: 'cors', credentials: 'omit' })
            : request;

        const response = await fetch(upgraded);
        if (response.ok && response.type === 'cors') {
            keepAlive(event, saveContent(request, response.clone()));
        }
        return response;
    } catch (err) {
        if (request.mode === 'no-cors') {
            try { return await fetch(request); } catch (e) { /* أوفلاين */ }
        }
        return offlineResponse(request);
    }
}

async function networkFirst(event) {
    const request = event.request;
    const attempt = fetch(request).then(response => ({ response }), () => ({ response: null }));
    const timeout = new Promise(resolve => setTimeout(() => resolve({ timedOut: true }), NETWORK_TIMEOUT_MS));
    const first = await Promise.race([attempt, timeout]);

    if (first.response && first.response.ok) {
        keepAlive(event, saveContent(request, first.response.clone()));
        return first.response;
    }

    const cached = await caches.match(request);
    if (cached) {
        if (first.timedOut) {
            keepAlive(event, attempt.then(({ response }) => (response && response.ok) ? saveContent(request, response.clone()) : null));
        }
        return cached;
    }

    const settled = first.timedOut ? await attempt : first;
    if (settled.response) {
        if (settled.response.ok) keepAlive(event, saveContent(request, settled.response.clone()));
        return settled.response;
    }
    return offlineResponse(request);
}

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;
    if (request.headers.has('range')) return;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const url = new URL(request.url);
    if (url.pathname.endsWith('/sw.js')) return;

    // ✅ Network First لملفات الـ HTML لضمان تحديثها دائماً (تجاوز الكاش)
    if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(request, { cache: 'no-store' }) // نتجاوز كاش المتصفح دائماً
                .then(response => {
                    if (canCacheShell(response)) {
                        const copy = response.clone();
                        keepAlive(event, caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {}));
                    }
                    return response;
                })
                // أوفلاين: النسخة المخزنة (حتى لو الرابط فيه ?v=...) ثم index.html ثم صفحة الأوفلاين
                .catch(async () => (await caches.match(request, { ignoreSearch: true }))
                    || (await caches.match('./index.html'))
                    || offlineResponse(request))
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event));
    } else if (url.hostname === API_HOST) {
        event.respondWith(networkFirst(event));
    } else if (url.hostname === RAW_HOST || url.hostname === CDN_HOST) {
        event.respondWith(cacheFirst(event));
    }
});

self.addEventListener('message', event => {
    const data = event.data || {};

    if (data.action === 'skipWaiting') {
        console.log('⏭️ تخطي الانتظار وتفعيل SW الجديد');
        self.skipWaiting();
    }

    if (data.action === 'precache') {
        event.waitUntil(Promise.all([precacheAll(), warmUrls(data.warm)]));
    }

    if (data.action === 'clearCache') {
        console.log('🗑️ طلب مسح الكاش');
        event.waitUntil((async () => {
            if (precacheRun) await precacheRun.catch(() => {});
            const keys = await caches.keys();
            await Promise.all(keys.filter(isOurCache).map(key => caches.delete(key)));
            console.log('✅ تم مسح كاش التطبيق');
            await broadcast({ type: 'CACHE_CLEARED' });
            await precacheAll();
        })());
    }
});

console.log(`%c✅ Service Worker v3.0 محمّل - الكاش: ${CACHE_NAME}`, 'color: #00ff00; font-weight: bold;');