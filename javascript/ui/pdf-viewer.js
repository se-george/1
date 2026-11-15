// ============================================
// pdf-viewer.js - معاينة PDF وفتحه بطرق متعددة
// + PWA mode: فتح بـ "Open with" + منع التنزيل المكرر
// ============================================

import { RAW_CONTENT_BASE, NAV_STATE } from '../core/config.js';
import { pushNavigationState, popNavigationState } from '../core/navigation.js';
import { resetBrowserZoom } from '../core/utils.js';

export let currentPreviewItem = null;
export let isToolbarExpanded = false;
export let isPdfToolbarHidden = false;

// متغيرات السحب لزر العين
let dragActive = false;
let startX, startY, initialLeft, initialTop;
let currentBlobUrl = null;

// ══════════════════════════════════════════════════════════════
// 🆕 Tracking للتنزيلات + Cache
// ══════════════════════════════════════════════════════════════

const DOWNLOADED_KEY = 'pwa_downloaded_files_v1';
const DOWNLOAD_TTL_DAYS = 30;
const PDF_CACHE_NAME = 'pdf-downloads-v1';

function getDownloadedMap() {
    try {
        return JSON.parse(localStorage.getItem(DOWNLOADED_KEY) || '{}');
    } catch { return {}; }
}

function isAlreadyDownloaded(path) {
    const map = getDownloadedMap();
    const t = map[path];
    if (!t) return false;
    const ageDays = (Date.now() - t) / 86400000;
    if (ageDays > DOWNLOAD_TTL_DAYS) {
        delete map[path];
        localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(map));
        return false;
    }
    return true;
}

function markAsDownloaded(path) {
    const map = getDownloadedMap();
    map[path] = Date.now();
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(map));
}

// debounce للضغط السريع المكرر
let _lastClick = { path: '', time: 0 };
function isRapidDoubleClick(path) {
    const now = Date.now();
    const isRapid = path === _lastClick.path && (now - _lastClick.time) < 2000;
    _lastClick = { path, time: now };
    return isRapid;
}

// ══════════════════════════════════════════════════════════════
// 🆕 Toast UI (بدون أي HTML مطلوب)
// ══════════════════════════════════════════════════════════════

function showPwaToast(message, action = null) {
    document.querySelectorAll('.pwa-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'pwa-toast';
    toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(20,20,20,0.97); color: #ffcc00;
        padding: 14px 22px; border-radius: 14px;
        font-size: 14px; font-weight: 600;
        z-index: 99999; max-width: 90vw;
        box-shadow: 0 8px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,204,0,0.3);
        text-align: center; opacity: 0;
        transition: opacity 0.3s, transform 0.3s;
        direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif;
        display: flex; align-items: center; gap: 12px; justify-content: center;
    `;

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    const closeToast = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    };

    if (action) {
        const btn = document.createElement('button');
        btn.textContent = action.label;
        btn.style.cssText = `
            background: #ffcc00; color: #000;
            border: none; padding: 8px 14px;
            border-radius: 8px; font-weight: bold;
            cursor: pointer; font-size: 13px;
            white-space: nowrap; flex-shrink: 0;
            font-family: inherit;
        `;
        btn.onclick = (e) => {
            e.stopPropagation();
            action.onClick();
            closeToast();
        };
        toast.appendChild(btn);
    }

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    const timeout = setTimeout(closeToast, action ? 8000 : 3500);
    toast.addEventListener('click', (e) => {
        if (e.target === toast) {
            clearTimeout(timeout);
            closeToast();
        }
    });
}

// ══════════════════════════════════════════════════════════════
// 🆕 Cache API Helpers
// ══════════════════════════════════════════════════════════════

async function getPdfFromCache(url) {
    try {
        const cache = await caches.open(PDF_CACHE_NAME);
        const resp = await cache.match(url);
        if (!resp) return null;
        return await resp.blob();
    } catch { return null; }
}

async function cachePdf(url, blob) {
    try {
        const cache = await caches.open(PDF_CACHE_NAME);
        await cache.put(url, new Response(blob, {
            headers: { 'Content-Type': 'application/pdf' }
        }));
    } catch (e) {
        console.warn('⚠️ Cache save failed:', e);
    }
}

// ══════════════════════════════════════════════════════════════
// 🆕 PWA Detection
// ══════════════════════════════════════════════════════════════

export function isPWAMode() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true  // iOS
    );
}

// ══════════════════════════════════════════════════════════════
// 🆕 Device Handler: Share → Check Download → Download
// ══════════════════════════════════════════════════════════════

async function tryShare(pdfUrl, fileName) {
    try {
        // 1) جرّب من الكاش الأول (بدون نت)
        let blob = await getPdfFromCache(pdfUrl);

        // 2) لو مش في الكاش، حمّله وخزنه
        if (!blob) {
            const response = await fetch(pdfUrl, { mode: 'cors' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            blob = await response.blob();
            await cachePdf(pdfUrl, blob);
        }

        const file = new File([blob], fileName, { type: 'application/pdf' });

        if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: fileName });
            console.log('✅ Shared via Web Share API');
            return true;
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('ℹ️ User cancelled share');
            return true;  // المستخدم قفل الشير شيت - مش خطأ
        }
        console.warn('⚠️ Share failed:', e);
    }
    return false;
}

async function triggerDownload(pdfUrl, fileName) {
    try {
        // جرّب من الكاش الأول
        let blob = await getPdfFromCache(pdfUrl);

        // لو مش في الكاش، حمّله
        if (!blob) {
            const resp = await fetch(pdfUrl, { mode: 'cors' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            blob = await resp.blob();
            await cachePdf(pdfUrl, blob);
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
        console.log('✅ Downloaded:', fileName);
        return true;
    } catch (e) {
        console.warn('⚠️ Blob download failed, falling back to direct link:', e);
        // Fallback: link مباشر
        try {
            const a = document.createElement('a');
            a.href = pdfUrl;
            a.download = fileName;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => document.body.removeChild(a), 100);
            return true;
        } catch (err) {
            console.error('❌ Download failed completely:', err);
            return false;
        }
    }
}

/**
 * الفتح على الجهاز (PWA mode):
 * 1. يجرّب share (بتفتح "Open with" أو Share Sheet)
 * 2. لو share مش متاح → يشوف سجل التنزيل:
 *    - لو اتنزل قبل كده (خلال 30 يوم) → مفيش تنزيل تاني، بس رسالة + زر اختياري
 *    - لو مش اتنزل → ينزّل ويسجّل
 * 3. دبل-كليك سريع → بيتجاهل
 */
async function openWithDeviceHandler(pdfUrl, fileName, path) {
    console.log('📱 [PWA] Device handler:', fileName);

    // 0) منع الضغط السريع المكرر
    if (isRapidDoubleClick(path)) {
        console.log('⏭️ Ignoring rapid duplicate click');
        return true;
    }

    // 1) جرّب Share (شغال حتى لو الملف اتنزل قبل - المستخدم ممكن يفتحه في تطبيق تاني)
    const shared = await tryShare(pdfUrl, fileName);
    if (shared) {
        markAsDownloaded(path);  // نسجّل إن المستخدم بقى عنده access للملف
        return true;
    }

    // 2) لو الملف اتنزل قبل كده (خلال 30 يوم) → مفيش تنزيل تاني
    if (isAlreadyDownloaded(path)) {
        console.log('✓ Already downloaded, skipping re-download:', path);
        showPwaToast(
            `📁 "${fileName}" موجود بالفعل على جهازك`,
            {
                label: '⬇️ نزّل تاني',
                onClick: async () => {
                    await triggerDownload(pdfUrl, fileName);
                    markAsDownloaded(path);
                    showPwaToast(`⬇️ جاري تنزيل "${fileName}"...`);
                }
            }
        );
        return true;
    }

    // 3) أول تنزيل
    await triggerDownload(pdfUrl, fileName);
    markAsDownloaded(path);
    showPwaToast(`⬇️ جاري تنزيل "${fileName}"...`);

    return true;
}

// ══════════════════════════════════════════════════════════════
// 🆕 smartOpen — نقطة دخول موحّدة (PWA-aware)
// ══════════════════════════════════════════════════════════════

export function smartOpen(item) {
    if (!item || !item.path) {
        console.warn('⚠️ smartOpen: item or path missing', item);
        return;
    }

    // PWA mode: تجاوز popup + preview
    if (isPWAMode()) {
        const pdfUrl = item.path.startsWith('http')
            ? item.path
            : `${RAW_CONTENT_BASE}${item.path}`;
        const fileName = decodeURIComponent(pdfUrl.split('/').pop().split('#')[0]);
        return openWithDeviceHandler(pdfUrl, fileName, item.path);
    }

    // متصفح عادي: popup اختيار طريقة الفتح
    return showOpenOptions(item);
}

// ---------- معاينة PDF ----------
export async function showPDFPreview(item) {
    if (!item || !item.path) return;

    const popup = document.getElementById('pdf-preview-popup');
    const canvas = document.getElementById('preview-canvas');
    const loading = document.getElementById('preview-loading');
    const filenameEl = document.getElementById('preview-filename');

    if (!popup || !canvas) {
        console.error('❌ عناصر المعاينة غير موجودة');
        return;
    }

    currentPreviewItem = item;
    const fileName = item.path.split('/').pop();
    const url = `${RAW_CONTENT_BASE}${item.path}`;

    popup.classList.remove('hidden');
    popup.style.display = 'flex';

    if (filenameEl) {
        filenameEl.textContent = fileName.length > 30
            ? fileName.substring(0, 27) + '...'
            : fileName;
    }

    if (loading) {
        loading.classList.remove('hidden');
        loading.style.display = 'block';
        loading.textContent = 'جاري تحضير المعاينة...';
    }

    canvas.style.display = 'none';

    const oldImg = popup.querySelector('img[alt^="معاينة"]');
    if (oldImg) oldImg.remove();

    pushNavigationState(NAV_STATE.PDF_VIEW, {
        path: item.path,
        isPreview: true
    });

    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js غير محمل');
        }

        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
            disableRange: true,
            disableStream: true,
            disableAutoFetch: true
        });

        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
            canvasContext: context,
            viewport: viewport,
            enableWebGL: false,
            renderInteractiveForms: false
        }).promise;

        const imgData = canvas.toDataURL('image/png', 1.0);

        const previewImg = document.createElement('img');
        previewImg.src = imgData;
        previewImg.style.width = '100%';
        previewImg.style.height = 'auto';
        previewImg.style.display = 'block';
        previewImg.style.objectFit = 'contain';
        previewImg.style.maxHeight = '80vh';
        previewImg.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        previewImg.style.borderRadius = '4px';
        previewImg.alt = `معاينة الصفحة الأولى من ${fileName}`;

        canvas.style.display = 'none';
        canvas.parentNode.appendChild(previewImg);

        if (loading) {
            loading.classList.add('hidden');
            loading.style.display = 'none';
        }
    } catch (error) {
        console.error('❌ خطأ في المعاينة:', error);
        if (loading) loading.textContent = '❌ فشل تحميل المعاينة';

        const errorMsg = document.createElement('div');
        errorMsg.className = 'preview-error-msg';
        errorMsg.style.color = '#ff4d4d';
        errorMsg.style.padding = '20px';
        errorMsg.style.textAlign = 'center';
        errorMsg.textContent = 'تعذر تحميل المعاينة.';

        canvas.parentNode.appendChild(errorMsg);
        if (loading) loading.classList.add('hidden');
    }
}

export function closePDFPreview() {
    const popup = document.getElementById('pdf-preview-popup');
    const canvas = document.getElementById('preview-canvas');

    if (popup) {
        popup.classList.add('hidden');
        popup.style.display = 'none';
    }

    if (canvas) {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        const parent = canvas.parentNode;
        const previewImg = parent.querySelector('img[alt^="معاينة"]');
        if (previewImg) previewImg.remove();
        const errorMsg = parent.querySelector('.preview-error-msg');
        if (errorMsg) errorMsg.remove();
    }

    currentPreviewItem = null;
    popNavigationState();
}

// ---------- عرض خيارات الفتح (في المتصفح) ----------
export function showOpenOptions(item) {
    const popup = document.getElementById('open-method-popup');
    const canvas = document.getElementById('method-preview-canvas');
    const loading = document.getElementById('method-loading');
    const filenameEl = document.getElementById('method-filename');

    if (!popup) {
        console.error('❌ open-method-popup غير موجود');
        openWithMozilla(item);
        return;
    }

    currentPreviewItem = item;
    const fileName = item.path.split('/').pop();
    const url = `${RAW_CONTENT_BASE}${item.path}`;

    popup.classList.remove('hidden');
    popup.style.display = 'flex';

    if (filenameEl) {
        filenameEl.textContent = fileName.length > 40
            ? fileName.substring(0, 37) + '...'
            : fileName;
    }

    if (loading) {
        loading.classList.remove('hidden');
        loading.style.display = 'block';
    }

    if (canvas) canvas.style.display = 'none';

    if (canvas) {
        (async () => {
            try {
                if (typeof pdfjsLib === 'undefined') {
                    throw new Error('PDF.js غير محمل');
                }

                const loadingTask = pdfjsLib.getDocument({
                    url: url,
                    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
                    cMapPacked: true,
                    disableRange: true,
                    disableStream: true,
                    disableAutoFetch: true
                });

                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 1.5 });

                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const context = canvas.getContext('2d', { alpha: false });
                context.fillStyle = 'white';
                context.fillRect(0, 0, canvas.width, canvas.height);

                await page.render({ canvasContext: context, viewport }).promise;

                if (loading) {
                    loading.classList.add('hidden');
                    loading.style.display = 'none';
                }
                canvas.style.display = 'block';
            } catch (error) {
                console.error('❌ خطأ في المعاينة المصغرة:', error);
                if (loading) loading.textContent = '❌ فشل التحميل';
            }
        })();
    }
}

export function closeOpenOptions() {
    const popup = document.getElementById('open-method-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.style.display = 'none';
    }
}

// ---------- طرق الفتح ----------
export async function openWithMozilla(item) {
    if (!item) return;

    const url = `${RAW_CONTENT_BASE}${item.path}`;
    const scrollContainer = document.getElementById('scroll-container');
    const scrollPosition = scrollContainer ? scrollContainer.scrollLeft : 0;
    pushNavigationState(NAV_STATE.PDF_VIEW, {
        path: item.path,
        scrollPosition: scrollPosition,
        viewer: 'mozilla'
    });

    const overlay = document.getElementById("pdf-overlay");
    const pdfViewer = document.getElementById("pdfFrame");
    const toolbar = document.getElementById('toolbar');
    const eyeBtn = document.getElementById('pdf-eye-draggable');

    if (!overlay || !pdfViewer) return;

    overlay.classList.remove("hidden");
    overlay.style.display = 'flex';

    if (toolbar && eyeBtn) {
        toolbar.style.display = 'flex';
        eyeBtn.classList.remove('active');
        eyeBtn.title = 'إخفاء شريط الأدوات';
        isPdfToolbarHidden = false;
    }

    resetBrowserZoom();

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('فشل تحميل الملف من السيرفر');
        const blob = await response.blob();

        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);

        pdfViewer.src = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(currentBlobUrl)}#zoom=page-fit`;
    } catch (error) {
        console.error('❌ خطأ:', error);
        pdfViewer.src = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(url)}#zoom=page-fit`;
    }

    if (typeof trackSvgOpen === 'function') trackSvgOpen(item.path);
    closeOpenOptions();
}

export function openWithDrive(item) {
    if (!item) return;
    const url = `${RAW_CONTENT_BASE}${item.path}`;
    const driveUrl = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(url)}`;
    window.open(driveUrl, '_blank', 'noopener,noreferrer');
    if (typeof trackSvgOpen === 'function') trackSvgOpen(item.path);
    closeOpenOptions();
}

export function openWithBrowser(item) {
    if (!item) return;
    const url = `${RAW_CONTENT_BASE}${item.path}`;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (typeof trackSvgOpen === 'function') trackSvgOpen(item.path);
    closeOpenOptions();
}

// ---------- سحب زر العين ----------
function startDrag(e) {
    const eyeBtn = document.getElementById('pdf-eye-draggable');
    if (!eyeBtn) return;
    dragActive = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX;
    startY = clientY;
    const rect = eyeBtn.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
}

function onDrag(e) {
    const eyeBtn = document.getElementById('pdf-eye-draggable');
    if (!eyeBtn || startX === undefined) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - startX;
    const dy = clientY - startY;
    if (!dragActive && Math.sqrt(dx * dx + dy * dy) > 5) {
        dragActive = true;
        eyeBtn.classList.add('dragging');
    }
    if (dragActive) {
        eyeBtn.style.left = `${initialLeft + dx}px`;
        eyeBtn.style.top = `${initialTop + dy}px`;
        eyeBtn.style.right = 'auto';
        if (e.cancelable) e.preventDefault();
    }
}

function stopDrag() {
    const eyeBtn = document.getElementById('pdf-eye-draggable');
    if (eyeBtn && dragActive) eyeBtn.classList.remove('dragging');
    setTimeout(() => {
        startX = undefined;
        startY = undefined;
        dragActive = false;
    }, 50);
}

// ---------- Toggle Toolbars ----------
export function toggleMozillaToolbar() {
    const overlay = document.getElementById('pdf-overlay');
    if (!overlay) return;
    overlay.classList.toggle('fullscreen-mode');
    isToolbarExpanded = overlay.classList.contains('fullscreen-mode');
}

export function togglePdfToolbar() {
    const overlay = document.getElementById('pdf-overlay');
    const eyeBtn = document.getElementById('pdf-eye-draggable');
    if (!overlay || !eyeBtn) return;
    isPdfToolbarHidden = !isPdfToolbarHidden;
    overlay.classList.toggle('toolbar-hidden', isPdfToolbarHidden);
    eyeBtn.classList.toggle('active', isPdfToolbarHidden);
    eyeBtn.title = isPdfToolbarHidden ? 'إظهار شريط الأدوات' : 'إخفاء شريط الأدوات';
}

// ---------- تهيئة المستمعات ----------
export function initPDFViewer() {
    const closePreviewBtn = document.getElementById('preview-close-btn');
    const openFromPreviewBtn = document.getElementById('preview-open-btn');
    const previewPopup = document.getElementById('pdf-preview-popup');

    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closePDFPreview();
        });
    }

    if (openFromPreviewBtn) {
        openFromPreviewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPreviewItem) {
                const item = currentPreviewItem;
                closePDFPreview();
                setTimeout(() => showOpenOptions(item), 50);
            }
        });
    }

    if (previewPopup) {
        previewPopup.addEventListener('click', (e) => {
            if (e.target === previewPopup) closePDFPreview();
        });
    }

    const methodPopup = document.getElementById('open-method-popup');
    const methodCloseBtn = document.getElementById('method-close-btn');
    const mozillaBtn = document.getElementById('open-mozilla-btn');
    const browserBtn = document.getElementById('open-browser-btn');
    const driveBtn = document.getElementById('open-drive-btn');

    if (methodCloseBtn) {
        methodCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeOpenOptions();
            currentPreviewItem = null;
        });
    }

    if (methodPopup) {
        methodPopup.addEventListener('click', (e) => {
            if (e.target === methodPopup) {
                closeOpenOptions();
                currentPreviewItem = null;
            }
        });
    }

    if (mozillaBtn) mozillaBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPreviewItem) openWithMozilla(currentPreviewItem);
    });

    if (browserBtn) browserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPreviewItem) openWithBrowser(currentPreviewItem);
    });

    if (driveBtn) driveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPreviewItem) openWithDrive(currentPreviewItem);
    });

    const closePdfBtn = document.getElementById('closePdfBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    const expandToolbarBtn = document.getElementById('expand-toolbar-btn');
    const pdfEyeDraggable = document.getElementById('pdf-eye-draggable');
    const pdfOverlay = document.getElementById('pdf-overlay');
    const pdfFrame = document.getElementById('pdfFrame');

    if (closePdfBtn) {
        closePdfBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pdfOverlay) {
                pdfOverlay.classList.add('hidden');
                pdfOverlay.style.display = 'none';
            }
            if (pdfFrame) pdfFrame.src = '';
            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
                currentBlobUrl = null;
            }
            resetBrowserZoom();
            popNavigationState();
        });
    }

    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPreviewItem && currentPreviewItem.path) {
                const fileUrl = `${RAW_CONTENT_BASE}${currentPreviewItem.path}`;
                const a = document.createElement('a');
                a.href = fileUrl;
                a.download = fileUrl.split('/').pop();
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (currentPreviewItem && currentPreviewItem.path) {
                const fileUrl = `${RAW_CONTENT_BASE}${currentPreviewItem.path}`;
                if (navigator.share) {
                    try {
                        await navigator.share({ url: fileUrl, title: fileUrl.split('/').pop() });
                    } catch (err) {
                        navigator.clipboard?.writeText(fileUrl);
                        alert('تم نسخ الرابط!');
                    }
                } else {
                    navigator.clipboard?.writeText(fileUrl);
                    alert('تم نسخ الرابط!');
                }
            }
        });
    }

    if (expandToolbarBtn) expandToolbarBtn.addEventListener('click', toggleMozillaToolbar);

    if (pdfEyeDraggable) {
        pdfEyeDraggable.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);
        pdfEyeDraggable.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', onDrag, { passive: false });
        window.addEventListener('touchend', stopDrag);
        pdfEyeDraggable.addEventListener('click', () => {
            if (!dragActive) togglePdfToolbar();
        });
    }

    console.log('✅ معالجات المعاينة والفتح جاهزة');
}