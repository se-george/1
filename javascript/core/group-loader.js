import { RAW_CONTENT_BASE, REPO_NAME, GITHUB_USER, TREE_API_URL, NAV_STATE, rememberGroupImage } from './config.js';
import { getDisplayName, debounce } from './utils.js';
import { pushNavigationState, goToWood } from './navigation.js';
import { setCurrentGroup, setCurrentFolder, setGlobalFileTree, globalFileTree, currentGroup } from './state.js';

import { generateGroupSVG } from './svg-generator.js';
import { GROUP_DATA } from '../groups-data.js';

// ---------- متغيرات داخلية للتحميل ----------
let imageUrlsToLoad = [];
let loadingProgress = {
    totalSteps: 0,
    completedSteps: 0,
    currentPercentage: 0
};

// ---------- شجرة الملفات ----------
const TREE_TIMEOUT_MS = 10000;
let treePromise = null;

try {
    localStorage.removeItem('cached_file_tree');
    localStorage.removeItem('cached_file_tree_time');
} catch (e) { /* التخزين مقفول */ }

// لو في طلب شغّال بنرجّع نفس الـ Promise
export function fetchGlobalTree() {
    if (globalFileTree.length > 0) return Promise.resolve();
    if (!treePromise) {
        treePromise = loadGlobalTree().finally(() => { treePromise = null; });
    }
    return treePromise;
}

// ✅ دالة جديدة: تجبر النظام على إعادة جلب الشجرة (تتخطى الكاش الداخلي)
export function refreshGlobalTree() {
    treePromise = null; // تصفير البروميس لكي يبدأ طلب جديد
    setGlobalFileTree([]); // تصفير المصفوفة القديمة
    return loadGlobalTree();
}

async function loadGlobalTree() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TREE_TIMEOUT_MS);

    try {
        const response = await fetch(TREE_API_URL, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`API status ${response.status}`);

        const data = await response.json();
        if (data.tree && data.tree.length > 0) {
            setGlobalFileTree(data.tree);
            console.log("✅ تم تحميل شجرة الملفات:", globalFileTree.length);
            return;
        }
    } catch (err) {
        console.warn("⚠️ فشل جلب الشجرة:", err);
    } finally {
        clearTimeout(timer);
    }
}

// ---------- حفظ وتحميل المجموعة ----------
export function saveSelectedGroup(group) {
    setCurrentGroup(group);
}

export function loadSelectedGroup() {
    const saved = localStorage.getItem('selectedGroup');
    if (saved) {
        setCurrentGroup(saved);
        return true;
    }
    return false;
}

// ---------- شاشة التحميل ----------
export function showLoadingScreen(groupLetter) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;

    const splashImage = document.getElementById('splash-image');
    if (splashImage) {
        splashImage.style.display = 'none';
        let textElement = document.getElementById('group-text-display');
        if (!textElement) {
            textElement = document.createElement('div');
            textElement.id = 'group-text-display';
            textElement.style.cssText = `
                font-size: 120px;
                font-weight: bold;
                color: #ffca28;
                text-shadow: 0 0 30px rgba(255,202,40,0.8), 0 0 60px rgba(255,202,40,0.5), 0 0 90px rgba(255,202,40,0.3);
                font-family: 'Arial Black', sans-serif;
                letter-spacing: 15px;
                animation: pulse 2s ease-in-out infinite;
                text-align: center;
                margin: 20px 0;
            `;
            splashImage.parentNode.insertBefore(textElement, splashImage);
        }
        textElement.textContent = `Group ${groupLetter}`;
        textElement.style.display = 'block';
    }

    loadingProgress = { totalSteps: 0, completedSteps: 0, currentPercentage: 0 };

    document.querySelectorAll('.light-bulb').forEach(bulb => bulb.classList.remove('on'));
    loadingOverlay.classList.add('active');

    import('../ui/wood-interface.js').then(({ updateWelcomeMessages }) => {
        updateWelcomeMessages();
    });
}

export function hideLoadingScreen() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove('active');

    const splashImage = document.getElementById('splash-image');
    if (splashImage) splashImage.style.display = '';
    
    const textElement = document.getElementById('group-text-display');
    if (textElement) textElement.style.display = 'none';
}

export function updateLoadProgress() {
    if (loadingProgress.totalSteps === 0) return;
    const progress = (loadingProgress.completedSteps / loadingProgress.totalSteps) * 100;
    loadingProgress.currentPercentage = Math.min(100, Math.round(progress));
    const percentage = loadingProgress.currentPercentage;
    if (percentage >= 20) document.getElementById('bulb-4')?.classList.add('on');
    if (percentage >= 40) document.getElementById('bulb-3')?.classList.add('on');
    if (percentage >= 60) document.getElementById('bulb-2')?.classList.add('on');
    if (percentage >= 80) document.getElementById('bulb-1')?.classList.add('on');
}

// ---------- تحميل SVG الخاص بالمجموعة ----------
export async function loadGroupSVG(groupLetter) {
    const groupContainer = document.getElementById('group-specific-content');
    if (!groupContainer) return;
    groupContainer.innerHTML = '';

    const group = GROUP_DATA[groupLetter];

    if (!group || !group.template) {
        groupContainer.innerHTML = `
            <g transform="translate(0,0)">
                <rect x="0" y="0" width="1024" height="2454" fill="#111"/>
                <text x="512" y="800" text-anchor="middle" fill="#ffcc00" font-size="80" font-weight="bold" font-family="Arial">Group ${groupLetter}</text>
                <text x="512" y="950" text-anchor="middle" fill="#888" font-size="50" font-family="Arial">قريباً...</text>
            </g>
        `;
        loadingProgress.totalSteps = 1;
        loadingProgress.completedSteps = 1;
        updateLoadProgress();
        return;
    }

    try {
        groupContainer.innerHTML = generateGroupSVG(groupLetter, group);

        const injectedImages = groupContainer.querySelectorAll('image[data-src]');
        imageUrlsToLoad = ['image/wood.webp'];
        injectedImages.forEach(img => {
            const src = img.getAttribute('data-src');
            if (src && !imageUrlsToLoad.includes(src)) {
                imageUrlsToLoad.push(src);
            }
        });

        loadingProgress.totalSteps = 1 + imageUrlsToLoad.length;
        loadingProgress.completedSteps = 1;
        updateLoadProgress();
    } catch (err) {
        console.error(`❌ خطأ في loadGroupSVG:`, err);
        loadingProgress.totalSteps = 1;
        loadingProgress.completedSteps = 1;
        updateLoadProgress();
    }
}

// ---------- تهيئة المجموعة ----------
export async function initializeGroup(groupLetter) {
    saveSelectedGroup(groupLetter);

    const toggleContainer = document.getElementById('js-toggle-container');
    const scrollContainer = document.getElementById('scroll-container');
    const groupSelectionScreen = document.getElementById('group-selection-screen');

    if (toggleContainer) {
        toggleContainer.classList.remove('fully-hidden');
        toggleContainer.style.display = 'flex';
    }
    if (scrollContainer) scrollContainer.style.display = 'block';
    if (groupSelectionScreen) {
        groupSelectionScreen.classList.add('hidden');
        groupSelectionScreen.style.display = 'none';
    }

    pushNavigationState(NAV_STATE.WOOD_VIEW, { group: groupLetter });

    showLoadingScreen(groupLetter);
    fetchGlobalTree();
    await loadGroupSVG(groupLetter);

    updateDynamicSizes();
    await loadImages();
}

// ---------- رسالة واضحة لما صورة الخريطة تتعذّر ----------
function showMissingImageNotice(imageEl, triedPaths) {
    const parent = imageEl.parentNode;
    if (!parent || parent.querySelector('.map-image-missing')) return;

    const NS = 'http://www.w3.org/2000/svg';
    const w = parseFloat(imageEl.getAttribute('width')) || 1024;
    const h = parseFloat(imageEl.getAttribute('height')) || 2454;

    const t = document.createElementNS(NS, 'text');
    t.setAttribute('class', 'map-image-missing');
    t.setAttribute('x', w / 2);
    t.setAttribute('y', h / 2 - 40);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#ff5252');
    t.style.fontSize = '46px';
    t.style.fontWeight = 'bold';
    t.style.fontFamily = "'Segoe UI', Tahoma, sans-serif";
    t.style.pointerEvents = 'none';

    const head = document.createElementNS(NS, 'tspan');
    head.setAttribute('x', w / 2);
    head.textContent = '⚠️ تعذر تحميل صورة الخريطة';
    t.appendChild(head);

    triedPaths.forEach(p => {
        const line = document.createElementNS(NS, 'tspan');
        line.setAttribute('x', w / 2);
        line.setAttribute('dy', '58');
        line.setAttribute('direction', 'ltr');
        line.textContent = p;
        t.appendChild(line);
    });

    imageEl.insertAdjacentElement('afterend', t);
}

// ---------- تحميل الصور ----------
export async function loadImages() {
    const mainSvg = document.getElementById('main-svg');
    if (!mainSvg) return;

    if (imageUrlsToLoad.length === 0) {
        finishLoading();
        return;
    }

    const MAX_CONCURRENT = 3;
    let currentIndex = 0;

    function loadOneImage(url) {
        return new Promise((resolve) => {
            const img = new Image();

            img.onload = function () {
                const allImages = [
                    ...mainSvg.querySelectorAll('image'),
                    ...(document.getElementById('files-list-container')?.querySelectorAll('image') || [])
                ];
                allImages.forEach(si => {
                    const dataSrc = si.getAttribute('data-src');
                    if (dataSrc === url) {
                        si.setAttribute('href', this.src);
                        si.removeAttribute('data-src');
                    }
                });
                if (currentGroup && url.startsWith(`image/${currentGroup}/`)) rememberGroupImage(currentGroup, url);

                loadingProgress.completedSteps++;
                updateLoadProgress();
                resolve();
            };

            img.onerror = function () {
                const owners = [...mainSvg.querySelectorAll('image')]
                    .filter(si => si.getAttribute('data-src') === url);

                const fallbacks = (owners[0]?.getAttribute('data-fallbacks') || '')
                    .split(',').filter(Boolean);
                if (fallbacks.length) {
                    const [next, ...rest] = fallbacks;
                    owners.forEach(si => {
                        si.setAttribute('data-src', next);
                        si.setAttribute('data-fallbacks', rest.join(','));
                        si.setAttribute('data-tried', [si.getAttribute('data-tried'), url].filter(Boolean).join(','));
                    });
                    loadOneImage(next).then(resolve);
                    return;
                }

                const tried = [...new Set(
                    [owners[0]?.getAttribute('data-tried'), url].filter(Boolean).join(',').split(',')
                )];
                owners.forEach(si => {
                    si.style.display = 'none';
                    si.removeAttribute('data-src');
                    si.removeAttribute('data-fallbacks');
                    if (si.closest('#group-specific-content')) showMissingImageNotice(si, tried);
                });
                
                loadingProgress.completedSteps++;
                updateLoadProgress();
                resolve();
            };

            img.src = url;
        });
    }

    async function loadNextBatch() {
        const batch = [];
        const end = Math.min(currentIndex + MAX_CONCURRENT, imageUrlsToLoad.length);
        for (let i = currentIndex; i < end; i++) {
            batch.push(loadOneImage(imageUrlsToLoad[i]));
        }
        currentIndex = end;

        await Promise.all(batch);

        if (currentIndex >= imageUrlsToLoad.length) {
            finishLoading();
        } else {
            loadNextBatch();
        }
    }

    loadNextBatch();
}

// ---------- إنهاء التحميل ----------
async function finishLoading() {
    loadingProgress.completedSteps = loadingProgress.totalSteps;
    loadingProgress.currentPercentage = 100;
    updateLoadProgress();

    const { scan } = await import('../features/svg-processor.js');
    const { updateWoodInterface } = await import('../ui/wood-interface.js');

    await fetchGlobalTree(); 

    updateDynamicSizes();
    scan();
    updateWoodInterface();
    goToWood();

    const mainSvg = document.getElementById('main-svg');
    if (mainSvg) {
        mainSvg.style.opacity = '1';
        mainSvg.style.visibility = 'visible';
        mainSvg.classList.add('loaded');
    }

    hideLoadingScreen();
}

// ---------- تحديث أحجام SVG ديناميكياً ----------
export function updateDynamicSizes() {
    const mainSvg = document.getElementById('main-svg');
    if (!mainSvg) return;

    const allImages = mainSvg.querySelectorAll('image[width][height]');
    if (allImages.length === 0) return;

    let maxX = 0, maxY = 0;

    allImages.forEach(img => {
        let tx = 0, ty = 0;
        let el = img.parentElement;
        while (el && el !== mainSvg) {
            const t = el.getAttribute && el.getAttribute('transform');
            if (t) {
                const m = t.match(/translate\s*\(\s*([\d.eE+-]+)(?:[ ,]+([\d.eE+-]+))?\s*\)/);
                if (m) {
                    tx += parseFloat(m[1]) || 0;
                    ty += parseFloat(m[2]) || 0;
                }
            }
            el = el.parentElement;
        }

        const w = parseFloat(img.getAttribute('width'))  || 0;
        const h = parseFloat(img.getAttribute('height')) || 0;
        const x = parseFloat(img.getAttribute('x'))      || 0;
        const y = parseFloat(img.getAttribute('y'))      || 0;

        const right  = tx + x + w;
        const bottom = ty + y + h;
        if (right  > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
    });

    mainSvg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
}