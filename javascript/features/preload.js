// ============================================
// preload.js
// ============================================

import { TREE_API_URL } from '../core/config.js';

// لو الـ SW ماردّش خالص (متصفح/وضع مش بيدعمه) منعلّقش المستخدم على الشاشة
const STALL_TIMEOUT_MS = 20000;

/**
 * بدء شاشة التحميل المسبق
 * @param {Function} onComplete - دالة تُستدعى بعد اكتمال التحميل (اختياري)
 */
export function initPreload(onComplete) {
    const preloadScreen = document.getElementById('preload-screen');
    if (!preloadScreen) return;

    // إظهار الشاشة وإخفاء المحتوى الرئيسي
    preloadScreen.classList.remove('hidden');
    const mainContent = [
        document.getElementById('group-selection-screen'),
        document.getElementById('js-toggle-container'),
        document.getElementById('scroll-container'),
        document.getElementById('loading-overlay')
    ];
    mainContent.forEach(el => {
        if (el) el.style.display = 'none';
    });

    const progressBar = document.getElementById('progressBar');
    const fileStatus = document.getElementById('fileStatus');
    const continueBtn = document.getElementById('continueBtn');

    let finished = false;
    let stallTimer = null;

    function updateProgress(done, total) {
        const percentage = total ? Math.round((done / total) * 100) : 100;
        if (progressBar) {
            progressBar.style.width = percentage + '%';
            progressBar.textContent = percentage + '%';
        }
    }

    function finish(message) {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        updateProgress(1, 1);
        if (fileStatus) fileStatus.textContent = message;
        if (continueBtn) continueBtn.style.display = 'block';

        // استدعاء callback إذا وُجد
        if (typeof onComplete === 'function') {
            onComplete();
        }
    }

    function armStallTimer() {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(
            () => finish('✔ جاهز (التخزين المسبق بيكمّل في الخلفية)'),
            STALL_TIMEOUT_MS
        );
    }

    // تقدّم التحميل من الـ SW
    function onMessage(event) {
        const msg = event.data;
        if (!msg || finished) return;

        if (msg.type === 'PRECACHE_PROGRESS') {
            armStallTimer();
            updateProgress(msg.done, msg.total);
            if (fileStatus) fileStatus.textContent = `✔ ${msg.file}`;
        } else if (msg.type === 'PRECACHE_DONE') {
            finish('🎉 اكتمل التحميل!');
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', onMessage);
        if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();
        armStallTimer();

        // أول زيارة: الـ SW بيحمّل وهو بيتثبّت. لو كان شغّال قبل كده (مثلاً لعبة "شاشة التحميل" من الإعدادات)
        // بنطلب منه يتأكد من الملفات (اللي موجود بيعدّي فوراً). وبنطلب منه يسخّن شجرة الملفات —
        // الرابط من config.js (مصدره الوحيد) والتخزين بيتم جوه الـ SW.
        navigator.serviceWorker.ready
            .then(registration => {
                if (registration.active) {
                    registration.active.postMessage({ action: 'precache', warm: [TREE_API_URL] });
                }
            })
            .catch(() => { /* الـ stall timer هيكمّل */ });
    } else {
        finish('✔ جاهز');
    }

    // عند الضغط على متابعة
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            console.log('✅ حفظ حالة preload_done');
            localStorage.setItem('preload_done', 'true');
            localStorage.setItem('last_visit_timestamp', Date.now());

            preloadScreen.classList.add('hidden');

            // إظهار المحتوى الرئيسي
            mainContent.forEach(el => {
                if (el) el.style.display = '';
            });

            // إعادة تحميل الصفحة لبدء التشغيل الطبيعي
            window.location.reload();
        });
    }
}
