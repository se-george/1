const CACHE_NAME = 'semester-1-cache-v99';

// 🆕 رابط شجرة الملفات (يُستخدم للـ pre-cache ولمطابقة الـ cache)
const TREE_API_URL = 'https://api.github.com/repos/se-george/1/git/trees/main?recursive=1';

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
   './image/Upper_wood.webp'
];

// 🆕 هل يمكن تخزين هذه الاستجابة؟
// - basic: same-origin (200 OK)
// - cors:  cross-origin with CORS (200 OK)  ← كان مفقود → سبب المشكلة
// - opaque: cross-origin no-cors (status=0) ← الصور الخارجية
function canCacheResponse(response) {
    if (!response) return false;
    if (response.type === 'opaque') return true;
    if ((response.type === 'basic' || response.type === 'cors') && response.ok) return true;
    return false;
}

function shouldCache(url) {
    try {
        const pathname = new URL(url).pathname;

        // لا نحفظ Service Worker نفسه
        if (pathname.includes('sw.js')) return false;

        // 🆕 شجرة GitHub Trees API
        if (pathname.includes('/git/trees/')) return true;

        // ملفات المشروع
        if (pathname.includes('/javascript/')) return true;
        if (pathname.includes('/image/')) return true;
        if (pathname.match(/\.(html|css|js|webp|png|jpg|jpeg|svg|pdf|json)$/)) return true;

        return false;
    } catch (e) {
        return false;
    }
}

self.addEventListener('install', event => {
    console.log('🔧 Service Worker: تثبيت الإصدار', CACHE_NAME);
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            Promise.all(urlsToCache.map(url =>
                cache.add(url).catch(err => {
                    console.warn(`⚠️ فشل تخزين: ${url}`);
                    return Promise.resolve();
                })
            ))
        ).then(() => {
            // 🆕 تخزين شجرة الملفات مسبقاً (عشان تشتغل أوفلاين من أول مرة)
            return fetch(TREE_API_URL, { cache: 'no-store' })
                .then(res => {
                    if (res && res.ok) {
                        return caches.open(CACHE_NAME)
                            .then(cache => cache.put(TREE_API_URL, res.clone()));
                    }
                    console.warn('⚠️ شجرة الملفات رجعت status:', res && res.status);
                })
                .catch(err => console.warn('⚠️ تعذر pre-cache الشجرة:', err));
        }).then(() => {
            console.log('✅ Service Worker: تم التثبيت بنجاح');
            return self.skipWaiting();
        })
    );
});

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker: تفعيل الإصدار', CACHE_NAME);
    event.waitUntil(
        caches.keys().then(keys => {
            const deletePromises = keys.map(key => {
                if (key !== CACHE_NAME) {
                    console.log(`🗑️ حذف كاش قديم: ${key}`);
                    return caches.delete(key);
                }
                return null;
            }).filter(Boolean);

            return Promise.all(deletePromises);
        }).then(() => {
            console.log('✅ Service Worker: تم التفعيل');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // تجاهل الطلبات الخارجية غير الضرورية
    if (!url.origin.includes(self.location.origin) &&
        !url.origin.includes('github') &&
        !url.origin.includes('raw.githubusercontent') &&
        !url.origin.includes('cdnjs.cloudflare.com')) {
        return;
    }

    // لا نتعامل مع طلبات الـ SW نفسه
    if (url.pathname.includes('sw.js')) return;

    // ✅ استراتيجية Cache First مع الاستجابة والنسخ الآمن
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) {
                // محاولة التحديث في الخلفية بأمان
                fetch(event.request).then(response => {
                    if (shouldCache(event.request.url) && canCacheResponse(response)) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            try { cache.put(event.request, responseToCache); } catch (e) {}
                        });
                    }
                }).catch(() => {});

                return cached;
            }

            // إذا لم يكن في الكاش، نجلبه من الشبكة ونخزنه
            return fetch(event.request).then(response => {
                if (shouldCache(event.request.url) && canCacheResponse(response)) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        try { cache.put(event.request, responseToCache); } catch (e) {}
                    });
                }
                return response;
            }).catch(() => {
                // Offline fallback
                if (event.request.destination === 'document') {
                    return new Response(
                        `<!DOCTYPE html>
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
                        </html>`,
                        {
                            status: 503,
                            headers: {
                                'Content-Type': 'text/html; charset=utf-8',
                                'Cache-Control': 'no-cache'
                            }
                        }
                    );
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        console.log('⏭️ تخطي الانتظار وتفعيل SW الجديد');
        self.skipWaiting();
    }

    if (event.data && event.data.action === 'clearCache') {
        console.log('🗑️ طلب مسح الكاش');
        event.waitUntil(
            caches.keys()
                .then(names => Promise.all(names.map(n => caches.delete(n))))
                .then(() => {
                    console.log('✅ تم مسح جميع الكاش');
                    self.clients.matchAll().then(clients =>
                        clients.forEach(c => c.postMessage({ type: 'CACHE_CLEARED' }))
                    );
                })
        );
    }
});

console.log(`%c✅ Service Worker v2.1 محمّل - الكاش: ${CACHE_NAME}`, 'color: #00ff00; font-weight: bold;');