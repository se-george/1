// ============================================
// pdf-viewer.js - معاينة PDF وفتحه بطرق متعددة
// مع تحسين جودة المعاينة ومعالجة أخطاء أفضل
// وإضافة زر عين قابل للسحب داخل PDF
// ============================================

import { RAW_CONTENT_BASE, NAV_STATE } from '../core/config.js';
import { pushNavigationState, popNavigationState } from '../core/navigation.js';
import { resetBrowserZoom } from '../core/utils.js';

export let currentPreviewItem = null;
export let isToolbarExpanded = false;
export let isPdfToolbarHidden = false; // حالة إخفاء شريط أدوات PDF

// متغيرات السحب للزر
let dragActive = false;
let startX, startY, initialLeft, initialTop;
let currentBlobUrl = null; // لتتبع الـ Blob URL النشط ومسحه من الذاكرة

// ---------- معاينة PDF (محدثة بجودة عالية) ----------
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

    // إظهار النافذة
    popup.classList.remove('hidden');
    popup.style.display = 'flex';

    if (filenameEl) {
        filenameEl.textContent = fileName.length > 30 ? fileName.substring(0, 27) + '...' : fileName;
    }
    
    if (loading) {
        loading.classList.remove('hidden');
        loading.style.display = 'block';
        loading.textContent = 'جاري تحضير المعاينة...';
    }
    
    canvas.style.display = 'none';

    // إزالة أي صورة معاينة قديمة
    const oldImg = popup.querySelector('img[alt^="معاينة"]');
    if (oldImg) oldImg.remove();

    pushNavigationState(NAV_STATE.PDF_VIEW, {
        path: item.path,
        isPreview: true
    });

    console.log('🔍 معاينة:', url);

    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js غير محمل');
        }

        // تحميل PDF مع إعدادات التوافق
        const loadingTask = pdfjsLib.getDocument({
            url: url,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
            cMapPacked: true,
            disableRange: true,
            disableStream: true,
            disableAutoFetch: true
        });

        const pdf = await loadingTask.promise;
        console.log('📄 PDF محمل:', pdf.numPages, 'صفحة');

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // زيادة الدقة

        // ضبط أبعاد canvas
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = 'white';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // رسم الصفحة
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
            enableWebGL: false,
            renderInteractiveForms: false
        };

        await page.render(renderContext).promise;

        // تحويل canvas إلى صورة PNG
        const imgData = canvas.toDataURL('image/png', 1.0);

        // إنشاء عنصر img لعرض الصورة
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

        console.log('✅ تم تحويل المعاينة إلى صورة PNG عالية الجودة');

    } catch (error) {
        console.error('❌ خطأ في المعاينة:', error);
        if (loading) {
            loading.textContent = '❌ فشل تحميل المعاينة';
        }

        const errorMsg = document.createElement('div');
        errorMsg.className = 'preview-error-msg';
        errorMsg.style.color = '#ff4d4d';
        errorMsg.style.padding = '20px';
        errorMsg.style.textAlign = 'center';
        errorMsg.textContent = 'تعذر تحميل المعاينة. قد يكون الملف غير متاح أونلاين أو حظره المتصفح.';

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
    console.log('🔒 تم إغلاق المعاينة');
}

// ---------- عرض خيارات الفتح ----------
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
        filenameEl.textContent = fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
    }

    if (loading) {
        loading.classList.remove('hidden');
        loading.style.display = 'block';
    }

    if (canvas) {
        canvas.style.display = 'none';
    }

    console.log('📋 عرض خيارات الفتح:', url);

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

// ---------- تهيئة مستمعات الأحداث ----------
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
            if (e.target === previewPopup) {
                closePDFPreview();
            }
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

    if (mozillaBtn) {
        mozillaBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPreviewItem) {
                openWithMozilla(currentPreviewItem);
            }
        });
    }

    if (browserBtn) {
        browserBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPreviewItem) {
                openWithBrowser(currentPreviewItem);
            }
        });
    }

    if (driveBtn) {
        driveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentPreviewItem) {
                openWithDrive(currentPreviewItem);
            }
        });
    }

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

    if (expandToolbarBtn) {
        expandToolbarBtn.addEventListener('click', toggleMozillaToolbar);
    }

    // مستمعات السحب لزر العين
    if (pdfEyeDraggable) {
        pdfEyeDraggable.addEventListener('mousedown', startDrag);
        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);

        pdfEyeDraggable.addEventListener('touchstart', startDrag, { passive: false });
        window.addEventListener('touchmove', onDrag, { passive: false });
        window.addEventListener('touchend', stopDrag);

        pdfEyeDraggable.addEventListener('click', (e) => {
            if (!dragActive) {
                togglePdfToolbar();
            }
        });
    }

    console.log('✅ معالجات المعاينة والفتح جاهزة');
}