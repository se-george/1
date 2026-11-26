// ============================================
// script.js - نقطة الدخول الرئيسية (ES Module)
// ============================================

import { setupBackButton } from './javascript/core/navigation.js';
import { preventInteractionWhenHidden, initWoodUI, updateWelcomeMessages } from './javascript/ui/wood-interface.js';
import { initPDFViewer } from './javascript/ui/pdf-viewer.js';
import { initializeGroup } from './javascript/core/group-loader.js';
import { resetBrowserZoom, setupMouseWheelZoom } from './javascript/core/utils.js';

// زرّين التحديث أعلى صفحة الخشب: 🌐 الموقع + 📱 التطبيق (APK)
const loadUpdater = () => import('./javascript/core/update-checker.js');
document.getElementById('update-btn')?.addEventListener('click', () => {
    loadUpdater().then(({ checkForUpdates }) => checkForUpdates());
});
document.getElementById('app-btn')?.addEventListener('click', () => {
    loadUpdater().then(({ onAppButtonClick }) => onAppButtonClick());
});

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

        // رقم آخر إصدار على زر التطبيق (من الكاش فورًا، وبعدين من GitHub)
        loadUpdater()
            .then(({ initUpdateButtons }) => initUpdateButtons())
            .catch(err => console.warn('⚠️ تعذر تهيئة أزرار التحديث:', err));

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
