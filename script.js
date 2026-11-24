// ============================================
// script.js - نقطة الدخول الرئيسية (ES Module)
// ============================================

import { setupBackButton } from './javascript/core/navigation.js';
import { preventInteractionWhenHidden, initWoodUI, updateWelcomeMessages } from './javascript/ui/wood-interface.js';
import { initPDFViewer } from './javascript/ui/pdf-viewer.js';
import { initializeGroup } from './javascript/core/group-loader.js';
import { resetBrowserZoom, setupMouseWheelZoom } from './javascript/core/utils.js';

const updateBtn = document.getElementById('update-btn');
if (updateBtn) {
    updateBtn.addEventListener('click', () => {
        import('./javascript/core/update-checker.js').then(({ checkForUpdates }) => checkForUpdates());
    });
}

function autoLoadLastGroup() {
    const preloadDone = localStorage.getItem('preload_done');

    if (!preloadDone) {
        console.log('⏭️ أول زيارة - تخطي التحميل التلقائي');
        return;
    }

    const savedGroup = localStorage.getItem('selectedGroup');

    if (savedGroup && /^[A-F]$/.test(savedGroup)) {
        console.log(`🚀 تحميل آخر جروب تلقائياً: ${savedGroup}`);
        const groupSelectionScreen = document.getElementById('group-selection-screen');
        if (groupSelectionScreen) {
            groupSelectionScreen.style.display = 'none';
        }
        initializeGroup(savedGroup);
    } else {
        console.log('📋 لا يوجد جروب محفوظ - عرض شاشة الاختيار');
    }
}

function observeZIndexChanges() {
    let zoomTimeout;
    const shouldTriggerReset = (el) => {
        if (!el || !el.style) return false;
        const cs = window.getComputedStyle(el);   // مرة واحدة (كانت 4 مرات مع كل تغيير في الـ DOM)
        return (
            cs.zIndex !== 'auto' &&
            parseInt(cs.zIndex) >= 10 &&
            cs.display !== 'none' &&
            cs.visibility !== 'hidden' &&
            cs.opacity !== '0'
        );
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            const target = mutation.target;
            if (mutation.type === 'attributes') {
                if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
                    if (shouldTriggerReset(target)) {
                        clearTimeout(zoomTimeout);
                        zoomTimeout = setTimeout(() => {
                            console.log('🧠 تغيير z-index / ظهور شاشة → Reset Zoom');
                            resetBrowserZoom();
                        }, 80);
                        break;
                    }
                }
            }
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && shouldTriggerReset(node)) {
                        clearTimeout(zoomTimeout);
                        zoomTimeout = setTimeout(() => {
                            console.log('🧠 إضافة شاشة جديدة → Reset Zoom');
                            resetBrowserZoom();
                        }, 80);
                    }
                });
            }
        }
    });

    observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        childList: true,
        subtree: true
    });
    console.log('✅ مراقبة z-index وظهور/اختفاء الشاشات مفعّلة');
}

document.addEventListener('DOMContentLoaded', () => {
    const hoverSwitch = document.getElementById('js-toggle');
    if (hoverSwitch) {
        const savedHoverState = localStorage.getItem('disable_hover');
        if (savedHoverState === 'true') {
            hoverSwitch.checked = false;
            document.body.classList.add('disable-hover');
        }

        hoverSwitch.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.body.classList.remove('disable-hover');
                localStorage.setItem('disable_hover', 'false');
                console.log('✨ تم تفعيل الـ Hover');
            } else {
                document.body.classList.add('disable-hover');
                localStorage.setItem('disable_hover', 'true');
                console.log('🚫 تم إيقاف الـ Hover');

                import('./javascript/features/svg-processor.js')
                    .then(({ cleanupHover }) => {
                        if (typeof cleanupHover === 'function') cleanupHover();
                    })
                    .catch(err => console.warn('cleanupHover import failed:', err));
            }
        });
    }

    const preloadDone = localStorage.getItem('preload_done');

    if (!preloadDone) {
        document.getElementById('preload-screen')?.classList.remove('hidden');
        import('./javascript/features/preload-game.js')
            .then(({ initPreloadSystem }) => initPreloadSystem())
            .catch(err => console.error('❌ فشل تحميل شاشة الـ preload:', err));
    } else {
        autoLoadLastGroup();
        setupBackButton();
        preventInteractionWhenHidden();
        initWoodUI();
        initPDFViewer();
        observeZIndexChanges();
        updateWelcomeMessages();

        // ✅ تفعيل ميزة الزوم بعجلة الماوس
        setupMouseWheelZoom();

        document.addEventListener('contextmenu', (e) => {
            const target = e.target;
            if (target.tagName === 'image' ||
                target.tagName === 'IMG' ||
                target.tagName === 'svg' ||
                target.tagName === 'rect' ||
                target.closest('svg')) {
                e.preventDefault();
                return false;
            }
        });
    }

    console.log('✅ script.js تم تحميله بالكامل - جميع الوحدات جاهزة');
});

// ==========================================
// PWA Install Prompt Handler (Clean & Native)
// ==========================================
let deferredPrompt = null;

function showPWAInstallButton() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (!installBtn) return;

    // إخفاء الزر تماماً لو التطبيق مفتوح كتطبيق مستقل (متثبت بالفعل)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        installBtn.style.display = 'none';
        return;
    }

    // إظهار الزر (يتم استدعاء هذه الدالة فقط عندما يكون المتصفح جاهزاً للتثبيت)
    installBtn.style.display = 'inline-flex';

    if (!installBtn.dataset.bound) {
        installBtn.dataset.bound = 'true';
        installBtn.addEventListener('click', async () => {
            const promptEvent = deferredPrompt || window._pwaPrompt;
            
            // لو اختفى الحدث لأي سبب، نخرج بهدوء
            if (!promptEvent) return; 

            installBtn.style.display = 'none';
            try {
                promptEvent.prompt();
                const result = await promptEvent.userChoice;
                console.log('📲 نتيجة التثبيت:', result.outcome);
                
                // لو المستخدم رفض التثبيت، نخلي الزر يرجع بعد 30 ثانية
                if (result.outcome !== 'accepted') {
                    setTimeout(() => {
                        if (!window.matchMedia('(display-mode: standalone)').matches) {
                            installBtn.style.display = 'inline-flex';
                        }
                    }, 30000);
                }
            } catch (err) {
                console.error('❌ خطأ في prompt():', err);
            }
            deferredPrompt = null;
            window._pwaPrompt = null;
        });
    }
}

// 1) نستمع للحدث الرسمي من المتصفح (هنا فقط سيظهر الزر)
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window._pwaPrompt = e;
    console.log('✅ beforeinstallprompt جاهز - المتصفح يدعم التثبيت');
    showPWAInstallButton();
});

// 2) الـ inline script في index.html بيبعت الحدث ده كـ fallback
window.addEventListener('pwaInstallReady', () => {
    if (window._pwaPrompt) {
        deferredPrompt = window._pwaPrompt;
        showPWAInstallButton();
    }
});

// 3) لو الحدث اتطلق قبل ما الملف يتحمّل
document.addEventListener('DOMContentLoaded', () => {
    if (window._pwaPrompt) {
        deferredPrompt = window._pwaPrompt;
        showPWAInstallButton();
    }
});

// 4) بعد التثبيت بنجاح، نخفي الزر فوراً
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window._pwaPrompt = null;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'none';
    console.log('🎉 تم تثبيت التطبيق بنجاح');
});