import { RAW_CONTENT_BASE, REPO_NAME, GITHUB_USER, TREE_API_URL, NAV_STATE } from './config.js';
import { getDisplayName, debounce, resetBrowserZoom } from './utils.js';
import { pushNavigationState, goToWood } from './navigation.js';
import { setCurrentGroup, setCurrentFolder, setGlobalFileTree, globalFileTree, currentGroup, currentFolder } from './state.js';

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
export async function fetchGlobalTree() {
    if (globalFileTree.length > 0) return;

    try {
        const response = await fetch(TREE_API_URL);
        if (!response.ok) throw new Error(`API status ${response.status}`);

        const data = await response.json();

        if (data.tree && data.tree.length > 0) {
            setGlobalFileTree(data.tree);
            console.log("✅ تم تحميل شجرة الملفات:", globalFileTree.length);

            try {
                const treeStr = JSON.stringify(data.tree);
                if (treeStr.length < 4 * 1024 * 1024) {
                    localStorage.setItem('cached_file_tree', treeStr);
                    localStorage.setItem('cached_file_tree_time', Date.now().toString());
                }
            } catch (e) {
                console.warn('⚠️ فشل حفظ الشجرة في localStorage:', e);
            }
            return;
        }
    } catch (err) {
        console.warn("⚠️ فشل جلب الشجرة - محاولة الـ fallback:", err);
    }

    try {
        const cached = localStorage.getItem('cached_file_tree');
        if (cached) {
            const tree = JSON.parse(cached);
            if (Array.isArray(tree) && tree.length > 0) {
                setGlobalFileTree(tree);
                console.log("📦 شجرة الملفات من الكاش المحلي:", tree.length);
                return;
            }
        }
    } catch (e) {
        console.error('❌ فشل قراءة الكاش المحلي:', e);
    }

    console.warn("⚠️ لا توجد شجرة ملفات متاحة (أول زيارة أوفلاين؟)");
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
    console.log(`🔦 شاشة التحميل نشطة: Group ${groupLetter}`);

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
    
    console.log('✅ تم إخفاء شاشة التحميل');
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
        console.warn(`⚠️ المجموعة ${groupLetter} مش جاهزة بعد`);
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
        console.log(`✅ توليد ${groupLetter}: ${groupContainer.children.length} عنصر`);

        const injectedImages = groupContainer.querySelectorAll('image[data-src]');
        imageUrlsToLoad = ['image/wood.webp'
        ];
        injectedImages.forEach(img => {
            const src = img.getAttribute('data-src');
            },)
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

// ---------- تحديث شعار الخشب ----------
export function updateWoodLogo(groupLetter) {
    const dynamicGroup = document.getElementById('dynamic-links-group');
    if (!dynamicGroup) return;

    const oldBanner = dynamicGroup.querySelector('.wood-banner-animation');
    if (oldBanner) oldBanner.remove();

    if (currentFolder !== "") return;


    banner.onclick = (e) => {
        e.stopPropagation();
        resetBrowserZoom();
        const groupSelectionScreen = document.getElementById('group-selection-screen');
        if (groupSelectionScr)
        {
            groupSelectionScreen.classList.remove('hidden');
            groupSelectionScreen.style.display = 'flex';
        }
        goToWood();
        pushNavigationState(NAV_STATE.GROUP_SELECTION);
    };

    dynamicGroup.appendChild(banner);
}

// ---------- تهيئة المجموعة ----------
export async function initializeGroup(groupLetter) {
    console.log(`🚀 تهيئة المجموعة: ${groupLetter}`);
    
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
    await Promise.all([fetchGlobalTree(), loadGroupSVG(groupLetter)]);

    updateDynamicSizes();
    await loadImages();
}

// ---------- تحميل الصور ----------
export async function loadImages() {
    const mainSvg = document.getElementById('main-svg');
    if (!mainSvg) return;

    console.log(`🖼️ بدء تحميل ${imageUrlsToLoad.length} صورة...`);
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
                console.log(`✅ تم تحديث الصورة: ${url.split('/').pop()}`);

                loadingProgress.completedSteps++;
                updateLoadProgress();
                resolve();
            };
                
                loadingProgress.completedSteps++;
                updateLoadProgress();
                resolve();
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
    console.log('✅ التحميل اكتمل 100% - جاري عرض المحتوى...');

    const { scan } = await import('../features/svg-processor.js');
    const { updateWoodInterface } = await import('../ui/wood-interface.js');

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
    console.log('🎉 اكتمل التحميل والعرض');
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
    console.log(`✅ viewBox: 0 0 ${maxX} ${maxY}`);
}