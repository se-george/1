// ============================================
// preload.js - شاشة التحميل المسبق (عرض التقدّم فقط)
// ============================================

import { TREE_API_URL } from '../core/config.js';

const STALL_TIMEOUT_MS = 20000;

export function initPreload(onComplete) {
    const preloadScreen = document.getElementById('preload-screen');
    if (!preloadScreen) return;

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

        // ✅ استماع لحدث بدء التحميل
        if (msg.type === 'PRECACHE_START') {
            armStallTimer();
            if (fileStatus) fileStatus.textContent = `⏳ جاري تحميل: ${msg.file}`;
        } 
        // استماع لحدث اكتمال التحميل
        else if (msg.type === 'PRECACHE_PROGRESS') {
            armStallTimer();
            updateProgress(msg.done, msg.total);
            if (fileStatus) fileStatus.textContent = `✔ ${msg.file}`;
        } 
        // استماع لحدث انتهاء الكل
        else if (msg.type === 'PRECACHE_DONE') {
            finish('🎉 اكتمل التحميل!');
        }
    }

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', onMessage);
        if (navigator.serviceWorker.startMessages) navigator.serviceWorker.startMessages();
        armStallTimer();

        navigator.serviceWorker.ready
            .then(registration => {
                if (registration.active) {
                    registration.postMessage({ action: 'precache', warm: [TREE_API_URL] });
                }
            })
            .catch(() => { /* الـ stall timer هيكمّل */ });
    } else {
        finish('✔ جاهز');
    }

    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            console.log('✅ حفظ حالة preload_done');
            localStorage.setItem('preload_done', 'true');
            localStorage.setItem('last_visit_timestamp', Date.now());

            preloadScreen.classList.add('hidden');

            mainContent.forEach(el => {
                if (el) el.style.display = '';
            });

            window.location.reload();
        });
    }
}