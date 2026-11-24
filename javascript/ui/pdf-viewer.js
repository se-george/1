// ============================================
// pdf-viewer.js - معاينة PDF وفتحه بطرق متعددة
// ============================================

import { RAW_CONTENT_BASE, NAV_STATE } from '../core/config.js';
import { pushNavigationState, popNavigationState } from '../core/navigation.js';
import { resetBrowserZoom, getThumbUrl, resetSvgZoom } from '../core/utils.js';

export let currentPreviewItem = null;

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;
const PDFJS_CMAPS = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`;
let pdfJsPromise = null;

export function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfJsPromise) {
        pdfJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = PDFJS_BASE + 'pdf.min.js';
            script.crossOrigin = 'anonymous';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = () => {
                pdfJsPromise = null; 
                reject(new Error('PDF.js غير محمل'));
            };
            document.head.appendChild(script);
        });
    }
    return pdfJsPromise;
}

async function loadPdfDocument(url) {
    const pdfjs = await ensurePdfJs();
    return pdfjs.getDocument({
        url: url,
        cMapUrl: PDFJS_CMAPS,
        cMapPacked: true,
        disableRange: true,
        disableStream: true,
        disableAutoFetch: true
    }).promise;
}

function loadImage(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; 
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

const previewErrorMessage = (error) =>
    error && error.name === 'MissingPDFException' ? '❌ الملف غير موجود' : '❌ فشل التحميل';

let previewToken = 0; 
let methodToken = 0;  

export async function showPDFPreview(item) {
    if (!item || !item.path) return;

    // ✅ إلغاء الزوم عند فتح المعاينة
    resetBrowserZoom();
    resetSvgZoom();

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
        filenameEl.textContent = fileName.length > 30 ? fileName.substring(0, 27) + '...' : fileName;
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

    console.log('🔍 معاينة:', url);

    const token = ++previewToken;

    try {
        const thumbUrl = getThumbUrl(item.path);
        const thumbImg = thumbUrl ? await loadImage(thumbUrl) : null;
        let imgData = thumbImg ? thumbImg.src : null;

        if (!imgData) {
            const pdf = await loadPdfDocument(url);
            console.log('📄 PDF محمل:', pdf.numPages, 'صفحة');

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 2.0 }); 

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
            context.fillStyle = 'white';
            context.fillRect(0, 0, canvas.width, canvas.height);

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
                enableWebGL: false,
                renderInteractiveForms: false
            };

            await page.render(renderContext).promise;
            imgData = canvas.toDataURL('image/png', 1.0);
        }

        if (token !== previewToken) return; 

        const previewImg = document.createElement('img');
        previewImg.crossOrigin = 'anonymous'; 
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
        if (token !== previewToken) return;
        console.error('❌ خطأ في المعاينة:', error);
        if (loading) {
            loading.textContent = error && error.name === 'MissingPDFException' ? '❌ الملف غير موجود' : '❌ فشل تحميل المعاينة';
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
    previewToken++; 
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

export function showOpenOptions(item) {
    // ✅ إلغاء الزوم عند فتح نافذة الخيارات
    resetBrowserZoom();
    resetSvgZoom();

    const popup = document.getElementById('open-method-popup');
    const canvas = document.getElementById('method-preview-canvas');
    const loading = document.getElementById('method-loading');
    const filenameEl = document.getElementById('method-filename');

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
        const token = ++methodToken;
        (async () => {
            try {
                const thumbUrl = getThumbUrl(item.path);
                const thumbImg = thumbUrl ? await loadImage(thumbUrl) : null;

                if (thumbImg) {
                    if (token !== methodToken) return;
                    canvas.width = thumbImg.naturalWidth;
                    canvas.height = thumbImg.naturalHeight;
                    canvas.getContext('2d', { alpha: false, willReadFrequently: true }).drawImage(thumbImg, 0, 0);
                } else {
                    const pdf = await loadPdfDocument(url);
                    const page = await pdf.getPage(1);
                    if (token !== methodToken) return;
                    const viewport = page.getViewport({ scale: 1.5 });

                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
                    context.fillStyle = 'white';
                    context.fillRect(0, 0, canvas.width, canvas.height);

                    await page.render({ canvasContext: context, viewport }).promise;
                }

                if (token !== methodToken) return;
                if (loading) {
                    loading.classList.add('hidden');
                    loading.style.display = 'none';
                }
                canvas.style.display = 'block';
            } catch (error) {
                if (token !== methodToken) return;
                console.error('❌ خطأ في المعاينة المصغرة:', error);
                if (loading) loading.textContent = previewErrorMessage(error);
            }
        })();
    }
}

export function closeOpenOptions() {
    methodToken++; 
    const popup = document.getElementById('open-method-popup');
    if (popup) {
        popup.classList.add('hidden');
        popup.style.display = 'none';
    }
}

export function openWithDrive(item) {
    if (!item) {
        console.error('❌ openWithDrive: item is null');
        return;
    }

    // ✅ إلغاء الزوم قبل فتح Drive
    resetBrowserZoom();
    resetSvgZoom();

    const url = `${RAW_CONTENT_BASE}${item.path}`;
    const driveUrl = `https://drive.google.com/viewerng/viewer?embedded=true&url=${encodeURIComponent(url)}`;
    window.open(driveUrl, '_blank', 'noopener,noreferrer');

    if (typeof trackSvgOpen === 'function') {
        trackSvgOpen(item.path);
    }

    closeOpenOptions();
    console.log('💾 فتح بـ Google Drive:', driveUrl);
}

export function openWithBrowser(item) {
    if (!item) {
        console.error('❌ openWithBrowser: item is null');
        return;
    }

    // ✅ إلغاء الزوم قبل فتح المتصفح
    resetBrowserZoom();
    resetSvgZoom();

    const url = `${RAW_CONTENT_BASE}${item.path}`;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (typeof trackSvgOpen === 'function') {
        trackSvgOpen(item.path);
    }

    closeOpenOptions();
    console.log('🌐 فتح بالمتصفح (رابط مباشر):', url);
}

// تنزيل الملف على الجهاز (مرة واحدة) وفتحه بتطبيق الـ PDF — في الـ APK بس
export async function openOnDevice(item) {
    if (!item || !item.path) return;
    resetBrowserZoom();
    resetSvgZoom();

    const btn = document.getElementById('open-device-btn');
    const label = btn && btn.querySelector('.method-btn-text');
    const oldLabel = label ? label.textContent : '';
    if (btn) btn.disabled = true;
    if (label) label.textContent = '⏳ جاري التحميل...';

    try {
        const { syncAndOpenFile } = await import('../features/sync-local.js');
        const result = await syncAndOpenFile(item.path);
        if (result.ok) {
            if (typeof trackSvgOpen === 'function') trackSvgOpen(item.path);
            closeOpenOptions();
        } else {
            alert(result.message || 'تعذر فتح الملف');
        }
    } catch (err) {
        console.error('❌ openOnDevice:', err);
        alert('تعذر فتح الملف على الجهاز');
    } finally {
        if (btn) btn.disabled = false;
        if (label) label.textContent = oldLabel;
    }
}

export function smartOpen(item) {
    if (!item || !item.path) return;
    showOpenOptions(item);
}

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

    // زر "فتح من الجهاز" بيظهر في تطبيق الـ APK بس
    const deviceBtn = document.getElementById('open-device-btn');
    if (deviceBtn) {
        import('../features/sync-local.js').then(({ isNativeApp }) => {
            if (!isNativeApp()) return;
            deviceBtn.style.display = '';
            deviceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (currentPreviewItem) openOnDevice(currentPreviewItem);
            });
        }).catch(() => { /* مفيش دعم للتطبيق الأصلي — الزر يفضل مخفي */ });
    }

    console.log('✅ معالجات المعاينة والفتح جاهزة');
}