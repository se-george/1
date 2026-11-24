// ============================================
// wood-interface.js - واجهة عرض الملفات والمجلدات
// ============================================

import { RAW_CONTENT_BASE, NAV_STATE, SUBJECT_FOLDERS, REPO_NAME, HIDDEN_FOLDERS } from '../core/config.js';
import { normalizeArabic, autoTranslate, getDisplayName, resetBrowserZoom, getThumbUrl } from '../core/utils.js';
import { pushNavigationState, goToWood, getCurrentNavigationState, navigationHistory } from '../core/navigation.js';
import { smartOpen } from './pdf-viewer.js';
import { globalFileTree, currentGroup, currentFolder, setCurrentFolder } from '../core/state.js';
import { updateDynamicSizes, fetchGlobalTree, refreshGlobalTree } from '../core/group-loader.js';
import { addScrollSystem } from './scroll-system.js';
import {
    setupGroupChangeButton,
    setupGroupSelectionButtons,
    setupPreloadButton,
    setupResetButton,
    setupMoveToggleButton,
    setupSearchIcon,
    setupBackButtonInSVG,
    setupInteractionToggle
} from './ui-controls.js';
import { setupSearchInput, setupEyeToggleSystem } from './search-and-eye.js';

// ---------- متغير التفاعل ----------
export let interactionEnabled = true;

// ---------- الامتدادات المسموح بعرضها --------
const ALLOWED_EXTENSIONS = [
    'pdf', 
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'heic',
    'mp3', 'wav', 'm4a', 'aac', 'ogg', 
    'mp4', 'webm', 
    'pptx', 'ppt'
];

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// ---------- ملفات مستثناة --------------
const EXCLUDED_FILES = [
    'XXXXXXXXXXX.pdf'
    // مثال لمسار كامل: 'arabic/unknown.pdf'
];

const isExcludedFile = (path) => {
    const normalizedPath = path.replace(/^\.\//, '').toLowerCase();
    const fileName = path.split('/').pop().toLowerCase();

    return EXCLUDED_FILES.some(excluded => {
        const cleanExcluded = excluded.replace(/^\.\//, '').toLowerCase();
        return normalizedPath === cleanExcluded || fileName === cleanExcluded;
    });
};

const isSupportedFile = (path) => {
    if (isExcludedFile(path)) return false;
    const ext = path.split('.').pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
};

const isImageFile = (path) => {
    const ext = path.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
};
// ---------- معرض الصور (Lightbox) ----------
let currentImageLightbox = null;

function openImageLightbox(imageSrc, fileName) {
    if (currentImageLightbox) {
        currentImageLightbox.remove();
        currentImageLightbox = null;
    }

    if (!document.getElementById('wood-lightbox-style')) {
        const style = document.createElement('style');
        style.id = 'wood-lightbox-style';
        style.textContent = `@keyframes woodFadeIn { from { opacity:0 } to { opacity:1 } }`;
        document.head.appendChild(style);
    }

    const lightbox = document.createElement('div');
    lightbox.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.96);
        z-index: 999999;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 20px; box-sizing: border-box;
        animation: woodFadeIn 0.25s ease;
    `;

    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = `
        position: absolute; top: 20px; right: 20px;
        width: 50px; height: 50px; display: flex;
        align-items: center; justify-content: center;
        background: rgba(255,255,255,0.15); color: #fff;
        border: 2px solid rgba(255,255,255,0.4);
        border-radius: 50%; font-size: 24px; font-weight: bold;
        cursor: pointer; user-select: none;
        transition: background 0.2s, transform 0.2s;
    `;
    closeBtn.onmouseenter = () => { closeBtn.style.background = 'rgba(255,255,255,0.3)'; closeBtn.style.transform = 'scale(1.1)'; };
    closeBtn.onmouseleave = () => { closeBtn.style.background = 'rgba(255,255,255,0.15)'; closeBtn.style.transform = 'scale(1)'; };

    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = fileName;
    img.style.cssText = `
        max-width: 95vw; max-height: 82vh;
        object-fit: contain; border-radius: 12px;
        box-shadow: 0 10px 60px rgba(0,0,0,0.9);
        background: #111;
    `;

    const title = document.createElement('div');
    title.textContent = '🖼️ ' + fileName;
    title.style.cssText = `
        color: #fff; margin-top: 20px; font-size: 18px;
        font-weight: bold; font-family: Arial, sans-serif;
        text-align: center; padding: 8px 22px;
        background: rgba(255,202,40,0.15);
        border: 1px solid rgba(255,202,40,0.4);
        border-radius: 22px; max-width: 90vw;
        word-break: break-word;
    `;

    const close = () => {
        lightbox.remove();
        currentImageLightbox = null;
    };

    closeBtn.onclick = close;
    lightbox.onclick = (e) => { if (e.target === lightbox) close(); };

    lightbox.appendChild(closeBtn);
    lightbox.appendChild(img);
    lightbox.appendChild(title);
    document.body.appendChild(lightbox);
    currentImageLightbox = lightbox;
}

// ---------- تحديث واجهة الخشب ----------
export async function updateWoodInterface() {
    const dynamicGroup = document.getElementById('dynamic-links-group');
    const backBtnText = document.getElementById('back-btn-text');
    const groupBtnText = document.getElementById('group-btn-text');
    const mainSvg = document.getElementById('main-svg');
    const searchInput = document.getElementById('search-input');

    if (!dynamicGroup || !backBtnText) return;

    dynamicGroup.querySelectorAll('.wood-folder-group, .wood-file-group, .scroll-container-group, .subject-separator-group, .scroll-bar-group, .window-frame, .api-error-group')
        .forEach(el => el.remove());

    await fetchGlobalTree();

    const query = normalizeArabic(searchInput ? searchInput.value : '');

    // ✅ إذا فشل جلب شجرة الملفات، نعرض الزر العملاق للاعتذار وإعادة المحاولة
    if (globalFileTree.length === 0 && query === '') {
        const errorGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        errorGroup.setAttribute("class", "api-error-group");
        errorGroup.style.cursor = "pointer";

        // الخلفية العملاقة
        const errorRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        errorRect.setAttribute("x", "120");
        errorRect.setAttribute("y", "250");
        errorRect.setAttribute("width", "780");
        errorRect.setAttribute("height", "1000"); 
        errorRect.setAttribute("rx", "15");
        errorRect.style.fill = "#1a1a1a";
        errorRect.style.stroke = "#ff5252";
        errorRect.style.strokeWidth = "4";
        
        // أيقونة التحذير
        const warningIcon = document.createElementNS("http://www.w3.org/2000/svg", "text");
        warningIcon.setAttribute("x", "510");
        warningIcon.setAttribute("y", "550");
        warningIcon.setAttribute("text-anchor", "middle");
        warningIcon.style.fontSize = "80px";
        warningIcon.textContent = "⚠️";

        // نص الاعتذار
        const errorText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        errorText.setAttribute("x", "510");
        errorText.setAttribute("y", "650");
        errorText.setAttribute("text-anchor", "middle");
        errorText.setAttribute("fill", "#ff5252");
        errorText.style.fontSize = "36px";
        errorText.style.fontWeight = "bold";
        errorText.style.fontFamily = "Arial, sans-serif";
        errorText.textContent = "نعتذر، حدث عطل تقني في GitHub";

        const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        subText.setAttribute("x", "510");
        subText.setAttribute("y", "720");
        subText.setAttribute("text-anchor", "middle");
        subText.setAttribute("fill", "#aaa");
        subText.style.fontSize = "24px";
        subText.style.fontFamily = "Arial, sans-serif";
        subText.textContent = "تعذر جلب قائمة الملفات. يرجى المحاولة مرة أخرى.";

        // زر إعادة المحاولة
        const refreshBtnRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        refreshBtnRect.setAttribute("x", "260");
        refreshBtnRect.setAttribute("y", "800");
        refreshBtnRect.setAttribute("width", "500");
        refreshBtnRect.setAttribute("height", "90");
        refreshBtnRect.setAttribute("rx", "15");
        refreshBtnRect.style.fill = "#ffca28";
        refreshBtnRect.style.stroke = "#fff";
        refreshBtnRect.style.strokeWidth = "3";

        const refreshBtnText = document.createElementNS("http://www.w3.org/2000/svg", "text");
        refreshBtnText.setAttribute("x", "510");
        refreshBtnText.setAttribute("y", "860");
        refreshBtnText.setAttribute("text-anchor", "middle");
        refreshBtnText.setAttribute("fill", "#000");
        refreshBtnText.style.fontSize = "32px";
        refreshBtnText.style.fontWeight = "bold";
        refreshBtnText.style.fontFamily = "Arial, sans-serif";
        refreshBtnText.textContent = "🔄 إعادة المحاولة الآن";

        errorGroup.appendChild(errorRect);
        errorGroup.appendChild(warningIcon);
        errorGroup.appendChild(errorText);
        errorGroup.appendChild(subText);
        errorGroup.appendChild(refreshBtnRect);
        errorGroup.appendChild(refreshBtnText);

        // حدث الضغط: يجلب الملفات ويحدث الواجهة دون إعادة تحميل الصفحة
        errorGroup.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // تغيير النص لإظهار حالة التحميل
            errorText.textContent = "⏳ جاري جلب الملفات...";
            errorText.setAttribute("fill", "#ffca28");
            subText.textContent = "يرجى الانتظار قليلاً";
            refreshBtnText.textContent = "⏳ جاري التحديث...";

            // إعادة جلب الشجرة وتحديث الواجهة
            await refreshGlobalTree();
            
            // استدعاء الدالة من جديد لترسم الملفات (أو تظهر الخطأ مجدداً لو فشلت)
            updateWoodInterface();
        });

        dynamicGroup.appendChild(errorGroup);
        return; // إيقاف باقي الكود لأننا لا نملك ملفات لنرسمها
    }

    if (currentFolder === "") {
        backBtnText.textContent = "➡️ إلى الخريطة ➡️";
        const currentState = getCurrentNavigationState();
        if (!currentState || currentState.state !== NAV_STATE.WOOD_VIEW) {
            navigationHistory.length = 0;
            pushNavigationState(NAV_STATE.WOOD_VIEW, { folder: "" });
        }
    } else {
        const folderName = currentFolder.split('/').pop();
        const countInCurrent = globalFileTree.filter(f => {
            const isInside = f.path.startsWith(currentFolder + '/');
            const isValidFile = isSupportedFile(f.path);
            if (query === "") return isInside && isValidFile;
            const fileName = f.path.split('/').pop().toLowerCase();
            const arabicName = autoTranslate(fileName);
            return isInside && isValidFile && (
                normalizeArabic(fileName).includes(query) ||
                normalizeArabic(arabicName).includes(query)
            );
        }).length;

        const pathParts = currentFolder.split('/');
        const breadcrumb = "الرئيسية > " + pathParts.join(' > ');
        const displayLabel = ` (${countInCurrent}) ملف`;

        backBtnText.textContent = breadcrumb.length > 30 ?
            `🔙 ... > ${folderName} ${displayLabel}` :
            `🔙 ${breadcrumb} ${displayLabel}`;
    }

    if (groupBtnText && currentGroup) {
        groupBtnText.textContent = `Change Group 🔄 ${currentGroup}`;
    }

    const folderPrefix = currentFolder ? currentFolder + '/' : '';
    const itemsMap = new Map();

    globalFileTree.forEach(item => {
        if (item.path.startsWith(folderPrefix)) {
            const relativePath = item.path.substring(folderPrefix.length);
            const pathParts = relativePath.split('/');
            const name = pathParts[0];

            if (!itemsMap.has(name)) {
                const isDir = pathParts.length > 1 || item.type === 'tree';
                const isValidFile = isSupportedFile(item.path);

                const lowerName = name.toLowerCase();
                let isSubjectItem = false;
                let mainSubject = null;

                for (const subject of SUBJECT_FOLDERS) {
                    if (lowerName.startsWith(subject) ||
                        lowerName.includes(`-${subject}`) ||
                        lowerName.startsWith(subject + '-')) {
                        isSubjectItem = true;
                        mainSubject = subject;
                        break;
                    }
                }

                if (isDir && !HIDDEN_FOLDERS.includes(name) && !name.startsWith('.')) {
                    itemsMap.set(name, {
                        name: name,
                        type: 'dir',
                        path: folderPrefix + name,
                        isSubject: isSubjectItem,
                        subject: mainSubject
                    });
                } else if (isValidFile && pathParts.length === 1) {
                    itemsMap.set(name, {
                        name: name,
                        type: 'file',
                        path: item.path,
                        isSubject: isSubjectItem,
                        subject: mainSubject
                    });
                }
            }
        }
    });

    let filteredData = Array.from(itemsMap.values());

    filteredData.sort((a, b) => {
        if (a.isSubject && !b.isSubject) return -1;
        if (!a.isSubject && b.isSubject) return 1;

        if (a.isSubject && b.isSubject) {
            const aSubjectIndex = SUBJECT_FOLDERS.indexOf(a.subject);
            const bSubjectIndex = SUBJECT_FOLDERS.indexOf(b.subject);
            if (aSubjectIndex !== bSubjectIndex) {
                return aSubjectIndex - bSubjectIndex;
            }
        }

        if (a.type !== b.type) {
            return a.type === 'dir' ? -1 : 1;
        }

        return a.name.localeCompare(b.name);
    });

    const scrollContainerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    scrollContainerGroup.setAttribute("class", "scroll-container-group");

    const oldClips = mainSvg.querySelectorAll('clipPath[id^="window-clip"]');
    oldClips.forEach(clip => clip.remove());

    const clipPathId = "window-clip-" + Date.now();
    const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clipPath.setAttribute("id", clipPathId);

    const clipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    clipRect.setAttribute("x", "120");
    clipRect.setAttribute("y", "250");
    clipRect.setAttribute("width", "780");
    clipRect.setAttribute("height", "2204"); 
    clipRect.setAttribute("rx", "15");

    clipPath.appendChild(clipRect);
    mainSvg.querySelector('defs').appendChild(clipPath);

    const scrollContent = document.createElementNS("http://www.w3.org/2000/svg", "g");
    scrollContent.setAttribute("class", "scrollable-content");
    scrollContent.setAttribute("clip-path", `url(#${clipPathId})`);

    const BOTTOM_PADDING = 100;

    const separatorGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    separatorGroup.setAttribute("class", "subject-separator-group");
    separatorGroup.setAttribute("clip-path", `url(#${clipPathId})`);

    let yPosition = 250;
    let fileRowCounter = 0;
    let itemsAdded = 0;

    const itemsBySubject = {};
    filteredData.forEach(item => {
        const subjectKey = item.isSubject ? item.subject : 'other';
        if (!itemsBySubject[subjectKey]) {
            itemsBySubject[subjectKey] = [];
        }
        itemsBySubject[subjectKey].push(item);
    });

    let subjectIndex = 0;
    const subjectKeys = Object.keys(itemsBySubject);

    for (const subjectKey of subjectKeys) {
        const subjectItems = itemsBySubject[subjectKey];
        const isSubjectSection = subjectKey !== 'other';

        if (subjectIndex > 0 && itemsAdded > 0) {
            yPosition += 20;
            const separatorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            separatorLine.setAttribute("x1", "120");
            separatorLine.setAttribute("y1", yPosition);
            separatorLine.setAttribute("x2", "900");
            separatorLine.setAttribute("y2", yPosition);
            separatorLine.setAttribute("stroke", "#ffcc00");
            separatorLine.setAttribute("stroke-width", "4");
            separatorLine.setAttribute("stroke-dasharray", "15,8");
            separatorLine.setAttribute("opacity", "0.9");
            separatorLine.setAttribute("stroke-linecap", "round");
            separatorGroup.appendChild(separatorLine);
            yPosition += 40;
            fileRowCounter = 0;
        }

        for (let i = 0; i < subjectItems.length; i++) {
            const item = subjectItems[i];

            const isImage = item.type === 'file' && isImageFile(item.path);
            const isFullWidth = item.type === 'dir' || isImage;

            if (isFullWidth && fileRowCounter > 0) {
                if (fileRowCounter % 2 === 1) {
                    yPosition += 90;
                }
                fileRowCounter = 0;
            }

            let x, width, height;
            if (item.type === 'dir') {
                x = 120;
                width = 780;
                height = 70;
            } else if (isImage) {
                x = 120;
                width = 780;
                height = 200; 
            } else {
                const isLeftColumn = fileRowCounter % 2 === 0;
                x = isLeftColumn ? 120 : 550;
                width = 350;
                height = 70;
            }

            const y = yPosition;

            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.setAttribute("class", item.type === 'dir' ? "wood-folder-group" : "wood-file-group");
            g.style.cursor = "pointer";

            const cleanName = item.name.replace(/\.[^/.]+$/, "");
            let shouldDisplay = true;

            if (item.type === 'dir') {
                const filteredCount = globalFileTree.filter(f => {
                    const isInsideFolder = f.path.startsWith(item.path + '/');
                    const isValidFile = isSupportedFile(f.path);
                    if (query === "") return isInsideFolder && isValidFile;

                    const fileName = f.path.split('/').pop().toLowerCase();
                    const fileArabic = autoTranslate(fileName);

                    return isInsideFolder && isValidFile && (
                        normalizeArabic(fileName).includes(query) ||
                        normalizeArabic(fileArabic).includes(query)
                    );
                }).length;

                if (query !== "" && filteredCount === 0) {
                    shouldDisplay = false;
                }
            } else {
                const arabicName = autoTranslate(cleanName);
                if (query !== "" &&
                    !normalizeArabic(cleanName).includes(query) &&
                    !normalizeArabic(arabicName).includes(query)) {
                    shouldDisplay = false;
                }
            }

            if (shouldDisplay) {
                if (isImage) {
                    const encodedPath = item.path.split('/').map(encodeURIComponent).join('/');
                    const imageUrl = `${RAW_CONTENT_BASE}${encodedPath}`;
                    const cardUrl = getThumbUrl(item.path) || imageUrl;
                    
                    const displayName = cleanName.length > 40 ? cleanName.substring(0, 37) + "..." : cleanName;

                    const imgClipId = "imgclip-" + Date.now() + "-" + Math.floor(Math.random() * 99999);
                    const imgClipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
                    imgClipPath.setAttribute("id", imgClipId);
                    const imgClipRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    imgClipRect.setAttribute("x", x);
                    imgClipRect.setAttribute("y", y);
                    imgClipRect.setAttribute("width", width);
                    imgClipRect.setAttribute("height", height);
                    imgClipRect.setAttribute("rx", "12");
                    imgClipPath.appendChild(imgClipRect);
                    mainSvg.querySelector('defs').appendChild(imgClipPath);

                    const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    bgRect.setAttribute("x", x);
                    bgRect.setAttribute("y", y);
                    bgRect.setAttribute("width", width);
                    bgRect.setAttribute("height", height);
                    bgRect.setAttribute("rx", "12");
                    bgRect.setAttribute("clip-path", `url(#${imgClipId})`);
                    bgRect.style.fill = "#1a1a1a";

                    const loadingText = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    loadingText.setAttribute("x", x + width / 2);
                    loadingText.setAttribute("y", y + height / 2);
                    loadingText.setAttribute("text-anchor", "middle");
                    loadingText.setAttribute("fill", "#888");
                    loadingText.style.fontSize = "18px";
                    loadingText.style.pointerEvents = "none";
                    loadingText.textContent = "⏳ جاري التحميل...";

                    const imgElement = document.createElementNS("http://www.w3.org/2000/svg", "image");
                    imgElement.setAttribute("x", x);
                    imgElement.setAttribute("y", y);
                    imgElement.setAttribute("width", width);
                    imgElement.setAttribute("height", height);
                    imgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
                    imgElement.setAttribute("href", cardUrl);
                    imgElement.setAttribute("clip-path", `url(#${imgClipId})`);
                    imgElement.style.pointerEvents = "none";

                    imgElement.addEventListener('load', () => loadingText.remove());
                    imgElement.addEventListener('error', () => {
                        if (cardUrl !== imageUrl && imgElement.getAttribute("href") === cardUrl) {
                            imgElement.setAttribute("href", imageUrl);
                            return;
                        }
                        loadingText.textContent = "⚠️ الصورة غير متاحة";
                        loadingText.setAttribute("fill", "#ff4444");
                        imgElement.remove();
                    });

                    const frameRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    frameRect.setAttribute("x", x);
                    frameRect.setAttribute("y", y);
                    frameRect.setAttribute("width", width);
                    frameRect.setAttribute("height", height);
                    frameRect.setAttribute("rx", "12");
                    frameRect.setAttribute("clip-path", `url(#${imgClipId})`);
                    frameRect.style.fill = "none";
                    frameRect.style.stroke = "#ffca28";
                    frameRect.style.strokeWidth = "3";
                    frameRect.style.pointerEvents = "none";

                    const nameBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    nameBg.setAttribute("x", x);
                    nameBg.setAttribute("y", y + height - 32);
                    nameBg.setAttribute("width", width);
                    nameBg.setAttribute("height", "32");
                    nameBg.setAttribute("clip-path", `url(#${imgClipId})`);
                    nameBg.style.fill = "rgba(0,0,0,0.78)";
                    nameBg.style.pointerEvents = "none";

                    const nameLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    nameLabel.setAttribute("x", x + width / 2);
                    nameLabel.setAttribute("y", y + height - 10);
                    nameLabel.setAttribute("text-anchor", "middle");
                    nameLabel.setAttribute("fill", "#fff");
                    nameLabel.style.fontSize = "16px";
                    nameLabel.style.fontWeight = "bold";
                    nameLabel.style.fontFamily = "Arial, sans-serif";
                    nameLabel.style.pointerEvents = "none";
                    nameLabel.textContent = "🖼️ " + displayName;

                    g.appendChild(bgRect);
                    g.appendChild(loadingText);
                    g.appendChild(imgElement);
                    g.appendChild(nameBg);
                    g.appendChild(nameLabel);
                    g.appendChild(frameRect);

                    let lpTimer = null;
                    let lpTriggered = false;
                    let tStart = 0;

                    g.addEventListener('touchstart', (e) => {
                        tStart = Date.now();
                        lpTriggered = false;
                        lpTimer = setTimeout(() => {
                            lpTriggered = true;
                            if (navigator.vibrate) navigator.vibrate(50);
                            import('./pdf-viewer.js').then(({ showPDFPreview }) => {
                                showPDFPreview(item);
                            }).catch(() => {});
                        }, 500);
                    }, { passive: true });

                    g.addEventListener('touchmove', () => { clearTimeout(lpTimer); }, { passive: true });

                    g.addEventListener('touchend', (e) => {
                        clearTimeout(lpTimer);
                        if (!lpTriggered && Date.now() - tStart < 500) {
                            e.stopPropagation();
                            if (e.cancelable) e.preventDefault(); 
                            resetBrowserZoom();
                            openImageLightbox(imageUrl, cleanName);
                        }
                    });

                    g.addEventListener('click', (e) => {
                        e.stopPropagation();
                        resetBrowserZoom();
                        openImageLightbox(imageUrl, cleanName);
                    });

                } else {
                    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    r.setAttribute("x", x);
                    r.setAttribute("y", y);
                    r.setAttribute("width", width);
                    r.setAttribute("height", height);
                    r.setAttribute("rx", "12");
                    r.setAttribute("class", "list-item");

                    if (item.type === 'dir') {
                        r.style.fill = isSubjectSection ? "#8d6e63" : "#5d4037";
                        r.style.stroke = isSubjectSection ? "#ffcc00" : "#fff";
                        r.style.strokeWidth = isSubjectSection ? "3" : "2";
                    } else {
                        r.style.fill = "rgba(0,0,0,0.85)";
                        r.style.stroke = "#fff";
                        r.style.strokeWidth = "2";
                    }

                    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    t.setAttribute("x", x + (width / 2));
                    t.setAttribute("y", y + 42);
                    t.setAttribute("text-anchor", "middle");
                    t.setAttribute("fill", "white");
                    t.style.fontWeight = "bold";
                    t.style.fontSize = item.type === 'dir' ? "20px" : "18px";
                    t.style.fontFamily = "Arial, sans-serif";
                    t.style.pointerEvents = "none";

                    if (item.type === 'dir') {
                        const filteredCount = globalFileTree.filter(f => {
                            const isInsideFolder = f.path.startsWith(item.path + '/');
                            const isValidFile = isSupportedFile(f.path);
                            if (query === "") return isInsideFolder && isValidFile;
                            const fileName = f.path.split('/').pop().toLowerCase();
                            const fileArabic = autoTranslate(fileName);
                            return isInsideFolder && isValidFile && (
                                normalizeArabic(fileName).includes(query) ||
                                normalizeArabic(fileArabic).includes(query)
                            );
                        }).length;

                        const maxLength = 45;
                        const displayName = cleanName.length > maxLength ?
                            cleanName.substring(0, maxLength - 3) + "..." : cleanName;
                        t.textContent = `📁 (${filteredCount}) ${displayName}`;
                    } else {
                        let icon = "📄 ";
                        const ext = item.path.split('.').pop().toLowerCase();
                        if (['mp4', 'webm'].includes(ext)) icon = "🎬 ";
                        else if (['mp3', 'wav', 'm4a', 'aac', 'ogg'].includes(ext)) icon = "🎧 ";
                        else if (['pptx', 'ppt'].includes(ext)) icon = "📊 ";

                        const displayName = cleanName.length > 25 ? cleanName.substring(0, 22) + "..." : cleanName;
                        t.textContent = icon + displayName;
                    }

                    g.appendChild(r);
                    g.appendChild(t);

                    let longPressTimer = null;
                    let longPressTriggered = false;
                    let touchStartTime = 0;

                    g.addEventListener('touchstart', (e) => {
                        touchStartTime = Date.now();
                        longPressTriggered = false;
                        longPressTimer = setTimeout(() => {
                            longPressTriggered = true;
                            if (item.type === 'file') {
                                if (navigator.vibrate) navigator.vibrate(50);
                                import('./pdf-viewer.js').then(({ showPDFPreview }) => {
                                    showPDFPreview(item);
                                });
                            }
                        }, 500);
                    }, { passive: true });

                    g.addEventListener('touchend', (e) => {
                        clearTimeout(longPressTimer);
                        const touchDuration = Date.now() - touchStartTime;
                        if (!longPressTriggered && touchDuration < 500) {
                            e.stopPropagation();
                            if (e.cancelable) e.preventDefault();
                            resetBrowserZoom();
                            if (item.type === 'dir') {
                                setCurrentFolder(item.path);
                                updateWoodInterface();
                            } else {
                                smartOpen(item);
                            }
                        }
                    });

                    g.addEventListener('touchmove', () => { clearTimeout(longPressTimer); }, { passive: true });

                    g.addEventListener('click', (e) => {
                        e.stopPropagation();
                        resetBrowserZoom();
                        if (item.type === 'dir') {
                            setCurrentFolder(item.path);
                            updateWoodInterface();
                        } else {
                            smartOpen(item);
                        }
                    });
                }

                scrollContent.appendChild(g);
                itemsAdded++;
            }

            if (isFullWidth) {
                yPosition += height + 20;
                fileRowCounter = 0;
            } else {
                fileRowCounter++;
                if (fileRowCounter % 2 === 0) {
                    yPosition += 90;
                }
            }
        }

        subjectIndex++;
        if (fileRowCounter % 2 === 1) {
            yPosition += 90;
            fileRowCounter = 0;
        }
    }

    yPosition += BOTTOM_PADDING;
    const totalContentHeight = yPosition - 250;
    const needsScroll = totalContentHeight > 2204; 

    if (needsScroll) {
        const nameInputGroup = dynamicGroup.querySelector('.name-input-group');
        if (nameInputGroup) nameInputGroup.style.display = 'none';
    } else {
        renderNameInput();
    }

    scrollContainerGroup.appendChild(separatorGroup);
    scrollContainerGroup.appendChild(scrollContent);

    const maxScroll = Math.max(0, totalContentHeight - 2204); 
    addScrollSystem(scrollContainerGroup, scrollContent, separatorGroup, maxScroll, totalContentHeight);

    dynamicGroup.appendChild(scrollContainerGroup);
}

// ---------- إدخال اسم المستخدم ----------
export function renderNameInput() {
    const dynamicGroup = document.getElementById('dynamic-links-group');
    if (!dynamicGroup) return;

    const oldInput = dynamicGroup.querySelector('.name-input-group');
    if (oldInput) oldInput.remove();

    const inputGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    inputGroup.setAttribute("class", "name-input-group");

    const containerWidth = 1024;
    const inputWidth = 780;
    const centerX = (containerWidth - inputWidth) / 2;
    const inputY = 2375;

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", centerX);
    bg.setAttribute("y", inputY);
    bg.setAttribute("width", inputWidth);
    bg.setAttribute("height", "60");
    bg.setAttribute("rx", "10");
    bg.style.fill = "rgba(0,0,0,0.7)";
    bg.style.stroke = "#ffca28";
    bg.style.strokeWidth = "2";

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", containerWidth / 2);
    label.setAttribute("y", inputY + 30);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", "white");
    label.style.fontSize = "18px";
    label.style.fontWeight = "bold";

    const currentName = localStorage.getItem('user_real_name');
    label.textContent = currentName ? `مرحباً ${currentName} - اضغط للتعديل` : "اضغط هنا لإدخال اسمك";

    inputGroup.appendChild(bg);
    inputGroup.appendChild(label);
    inputGroup.style.cursor = "pointer";

    inputGroup.onclick = () => {
        const currentName = localStorage.getItem('user_real_name');
        const promptMessage = currentName ?
            `الاسم الحالي: ${currentName}\nأدخل اسم جديد أو اترك فارغاً للإلغاء:` :
            "ما اسمك؟";
        const name = prompt(promptMessage, currentName || "");
        if (name !== null && name.trim()) {
            localStorage.setItem('user_real_name', name.trim());
            if (typeof trackNameChange === 'function') {
                trackNameChange(name.trim());
            }
            updateWelcomeMessages();
            updateWoodInterface();
            alert("أهلاً بك يا " + name.trim());
        }
    };

    dynamicGroup.appendChild(inputGroup);
}

// ---------- تحديث رسائل الترحيب ----------
export function updateWelcomeMessages() {
    const displayName = getDisplayName();
    const groupScreenH1 = document.querySelector('#group-selection-screen h1');
    if (groupScreenH1) {
        groupScreenH1.innerHTML = `مرحباً بك يا <span style="color: #ffca28;">${displayName}</span> إختر جروبك`;
    }
    const loadingH1 = document.querySelector('#loading-content h1');
    if (loadingH1 && currentGroup) {
        loadingH1.innerHTML = `أهلاً بك يا <span style="color: #ffca28;">${displayName}</span><br>في ${REPO_NAME.toUpperCase()}`;
    }
}

// ---------- منع التفاعل مع العناصر المخفية ----------
export function preventInteractionWhenHidden() {
    const toggleContainer = document.getElementById('js-toggle-container');
    const searchContainer = document.getElementById('search-container');

    if (!toggleContainer || !searchContainer) {
        setTimeout(preventInteractionWhenHidden, 500);
        return;
    }

    const blockAllEvents = (e) => {
        e.stopPropagation();
        e.preventDefault();
        return false;
    };

    const eventsToBlock = [
        'click', 'touchstart', 'touchend', 'mousedown', 'mouseup',
        'pointerdown', 'pointerup', 'mouseover', 'mouseout',
        'touchmove', 'contextmenu'
    ];

    const toggleObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class' || mutation.attributeName === 'style') {
                const isHidden = toggleContainer.classList.contains('hidden') ||
                    toggleContainer.classList.contains('fully-hidden') ||
                    toggleContainer.style.display === 'none';

                if (isHidden) {
                    toggleContainer.style.pointerEvents = 'none';
                    toggleContainer.style.visibility = 'hidden';
                    eventsToBlock.forEach(eventType => {
                        toggleContainer.addEventListener(eventType, blockAllEvents, true);
                    });
                } else {
                    toggleContainer.style.pointerEvents = '';
                    toggleContainer.style.visibility = '';
                    eventsToBlock.forEach(eventType => {
                        toggleContainer.removeEventListener(eventType, blockAllEvents, true);
                    });
                }
            }
        });
    });

    const searchObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class' || mutation.attributeName === 'style') {
                const isHidden = searchContainer.classList.contains('hidden') ||
                    searchContainer.style.display === 'none';

                if (isHidden) {
                    searchContainer.style.pointerEvents = 'none';
                    searchContainer.style.visibility = 'hidden';
                    eventsToBlock.forEach(eventType => {
                        searchContainer.addEventListener(eventType, blockAllEvents, true);
                    });
                } else {
                    searchContainer.style.pointerEvents = '';
                    searchContainer.style.visibility = '';
                    eventsToBlock.forEach(eventType => {
                        searchContainer.removeEventListener(eventType, blockAllEvents, true);
                    });
                }
            }
        });
    });

    toggleObserver.observe(toggleContainer, { attributes: true, attributeFilter: ['class', 'style'] });
    searchObserver.observe(searchContainer, { attributes: true, attributeFilter: ['class', 'style'] });

    if (toggleContainer.classList.contains('hidden') ||
        toggleContainer.classList.contains('fully-hidden') ||
        toggleContainer.style.display === 'none') {
        toggleContainer.style.pointerEvents = 'none';
        toggleContainer.style.visibility = 'hidden';
    }

    if (searchContainer.classList.contains('hidden') ||
        searchContainer.style.display === 'none') {
        searchContainer.style.pointerEvents = 'none';
        searchContainer.style.visibility = 'hidden';
    }

    console.log('✅ إصلاح زر العين 👁️ نشط');
}

// ---------- تهيئة واجهة الخشب وربط الأحداث ----------
export function initWoodUI() {
    setupGroupChangeButton();
    setupGroupSelectionButtons();
    setupPreloadButton();
    setupResetButton();
    setupMoveToggleButton();
    setupSearchIcon();

    setupBackButtonInSVG(() => currentFolder, setCurrentFolder, updateWoodInterface);

    setupInteractionToggle();
    setupSearchInput(updateWoodInterface);
    setupEyeToggleSystem();
}