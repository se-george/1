// ================================================
// sw.js - Service Worker
// ================================================
const CACHE_PREFIX = 'semester-1-';
const CACHE_NAME = CACHE_PREFIX + 'cache-v4';
const CONTENT_CACHE = CACHE_PREFIX + 'content';
const LEGACY_CACHES = ['semester-1-cache-v4'];
const RAW_HOST = 'raw.githubusercontent.com';
const CDN_HOST = 'cdnjs.cloudflare.com';
const API_HOST = 'api.github.com';
const WARM_HOSTS = [RAW_HOST, CDN_HOST, API_HOST];
const NETWORK_TIMEOUT_MS = 6000;
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

// ------------------------------------------------------------
// أدوات مساعدة
// ------------------------------------------------------------
const isOurCache = (key) => key.startsWith(CACHE_PREFIX) || LEGACY_CACHES.includes(key);

// بنكمّل شغل في الخلفية بأمان (لو الحدث خلص بنتجاهل الخطأ والشغل بيكمّل برضه)
function keepAlive(event, promise) {
    try { event.waitUntil(promise); } catch (e) { /* الحدث خلص */ }
    return promise;
}

// نبعت رسالة لكل الصفحات المفتوحة (حتى اللي لسه الـ SW مسيطر عليها مش مسيطر — أول زيارة)
async function broadcast(message) {
    try {
        const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        windows.forEach(client => client.postMessage(message));
    } catch (e) { /* مفيش صفحات مفتوحة */ }
}

// تخزين الواجهة (same-origin): ردود سليمة بس
function canCacheShell(response) {
    return !!response && (response.type === 'basic' || response.type === 'cors') && response.ok;
}

function shouldCacheShell(url) {
    try {
        const pathname = new URL(url).pathname;
        if (pathname.includes('sw.js')) return false;              // الـ SW نفسه لا يُخزَّن
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

// ------------------------------------------------------------
// كاش المحتوى الخارجي: حد أقصى للعدد والحجم (الأقدم يتشال الأول)
// ------------------------------------------------------------
let putsSinceTrim = 0;

async function trimContentCache() {
    const cache = await caches.open(CONTENT_CACHE);
    const keys = await cache.keys();                       // بترتيب الإضافة (الأقدم الأول)
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
    } catch (e) { /* مساحة ممتلئة أو رد مش قابل للتخزين */ }
}

// ------------------------------------------------------------
// تحميل الواجهة مسبقاً (بالتوازي) + إرسال التقدّم للصفحة
// ------------------------------------------------------------
let precacheRun = null;

function precacheAll() {
    if (precacheRun) return precacheRun;                   // تشغيل واحد في نفس الوقت

    precacheRun = (async () => {
        const cache = await caches.open(CACHE_NAME);
        const total = urlsToCache.length;
        const failed = [];
        let done = 0;

        await Promise.all(urlsToCache.map(async url => {
            try {
                if (!(await cache.match(url))) {
                    // no-cache: بيسأل السيرفر (304 لو مفيش تغيير) بدل ما ياخد نسخة قديمة من HTTP cache
                    // (GitHub Pages بيبعت max-age=600 → ممكن نخزّن نسخة عمرها 10 دقايق).
                    await cache.add(new Request(url, { cache: 'no-cache' }));
                }
            } catch (err) {
                failed.push(url);
                console.warn(`⚠️ فشل تخزين: ${url}`);
            }
            done++;
            broadcast({ type: 'PRECACHE_PROGRESS', done, total, file: url.split('/').pop() || 'index.html' });
        }));

        await broadcast({ type: 'PRECACHE_DONE', total, failed });
    })().finally(() => { precacheRun = null; });

    return precacheRun;
}

// روابط خارجية الصفحة تطلب تسخينها (مثلاً شجرة الملفات) — الرابط معرّف في config.js مش هنا
async function warmUrls(urls) {
    if (!Array.isArray(urls)) return;
    await Promise.all(urls.map(async raw => {
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || !WARM_HOSTS.includes(url.hostname)) return;   // مصادر معروفة بس
            const response = await fetch(new Request(url.href, { mode: 'cors', credentials: 'omit', cache: 'no-store' }));
            if (response.ok) await saveContent(url.href, response);
        } catch (e) {
            console.warn('⚠️ تعذر تسخين:', raw);
        }
    }));
}

// ------------------------------------------------------------
// دورة حياة الـ SW
// ------------------------------------------------------------
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
        // بنمسح كاشاتنا القديمة بس (نفس الـ prefix) — مش أي كاش على نفس الـ origin
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

// ------------------------------------------------------------
// استراتيجيات الطلبات
// ------------------------------------------------------------

// الواجهة (same-origin): من الكاش فوراً + تحديث في الخلفية (stale-while-revalidate)
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

// المحتوى الخارجي (raw / cdnjs): من الكاش لو موجود، وإلا من الشبكة ونخزّنه — من غير تحديث في الخلفية
// (الـ thumbnails رابطها فيه ?v=sha فلو الصورة اتغيّرت بياخد رابط جديد لوحده)
async function cacheFirst(event) {
    const request = event.request;
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        // طلبات no-cors (صور/سكريبتات) ردّها opaque: مش بنعرف حالته وبيتحسب ~7MB من مساحة التخزين.
        // فبنعيدها بـ CORS (السيرفرين بيدعموه) عشان نتأكد إنها 200 قبل ما نخزّنها.
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
            try { return await fetch(request); } catch (e) { /* أوفلاين */ }   // السيرفر مبيدعمش CORS: من غير تخزين
        }
        return offlineResponse(request);
    }
}

// شجرة الملفات (api.github.com): الشبكة أولاً (عشان تبقى محدّثة) ولو بطيئة/محجوبة (403) أو أوفلاين
// نرجع لآخر نسخة سليمة — ده بديل نسخة localStorage القديمة (الكاش بقى في مكان واحد).
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
        // لو الشبكة اتأخرت بس لسه ممكن توصل: نحدّث النسخة المحفوظة لما تخلص
        if (first.timedOut) {
            keepAlive(event, attempt.then(({ response }) => (response && response.ok) ? saveContent(request, response.clone()) : null));
        }
        return cached;
    }

    // مفيش نسخة محفوظة: نستنى الشبكة للآخر
    const settled = first.timedOut ? await attempt : first;
    if (settled.response) {
        if (settled.response.ok) keepAlive(event, saveContent(request, settled.response.clone()));
        return settled.response;
    }
    return offlineResponse(request);
}

self.addEventListener('fetch', event => {
    const request = event.request;

    if (request.method !== 'GET') return;                              // POST (Formspree...) وغيره: يعدّي
    if (request.headers.has('range')) return;                          // طلبات Range (صوت/فيديو/PDF مجزّأ): المتصفح أدرى
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

    const url = new URL(request.url);
    if (url.pathname.endsWith('/sw.js')) return;                       // الـ SW نفسه

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(event));
    } else if (url.hostname === API_HOST) {
        event.respondWith(networkFirst(event));
    } else if (url.hostname === RAW_HOST || url.hostname === CDN_HOST) {
        event.respondWith(cacheFirst(event));
    }
    // أي مصدر تاني: من غير تدخّل
});

// ------------------------------------------------------------
// الرسائل من الصفحة
// ------------------------------------------------------------
self.addEventListener('message', event => {
    const data = event.data || {};

    if (data.action === 'skipWaiting') {
        console.log('⏭️ تخطي الانتظار وتفعيل SW الجديد');
        self.skipWaiting();
    }

    // شاشة الـ preload: نتأكد إن كل ملفات urlsToCache متخزّنة (والتقدّم بيرجع كرسائل PRECACHE_*)
    // data.warm = روابط خارجية عايزينها في الكاش (الصفحة هي اللي بتحدّدها من config.js)
    if (data.action === 'precache') {
        event.waitUntil(Promise.all([precacheAll(), warmUrls(data.warm)]));
    }

    if (data.action === 'clearCache') {
        console.log('🗑️ طلب مسح الكاش');
        event.waitUntil((async () => {
            if (precacheRun) await precacheRun.catch(() => {});     // ما نمسحش وسط تحميل شغّال
            const keys = await caches.keys();
            await Promise.all(keys.filter(isOurCache).map(key => caches.delete(key)));
            console.log('✅ تم مسح كاش التطبيق');
            await broadcast({ type: 'CACHE_CLEARED' });
            await precacheAll();                                    // نرجّع الواجهة جاهزة أوفلاين بعد المسح
        })());
    }
});

console.log(`%c✅ Service Worker v3.0 محمّل - الكاش: ${CACHE_NAME}`, 'color: #00ff00; font-weight: bold;');