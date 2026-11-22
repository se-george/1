// ============================================
// utils.js - دوال مساعدة عامة (النسخة النهائية الشاملة)
// ============================================

import { translationMap, RAW_CONTENT_BASE, THUMBS_DIR, SUBJECT_FOLDERS } from './config.js';
import { thumbIndex } from './state.js';

// ------------------------------
// 1. توليد كود HEX فريد بناءً على الجهاز والوقت
// ------------------------------
export function getStaticHexId() {
    let hex = localStorage.getItem('static_hex_id');
    if (!hex) {
        const deviceInfo = [
            Date.now().toString(),                   // التاريخ والوقت
            navigator.userAgent,                     // المتصفح ونظام التشغيل
            screen.width + 'x' + screen.height,      // دقة الشاشة
            window.devicePixelRatio,                 // كثافة البكسل
            navigator.language,                      // اللغة
            Math.random().toString(36).substring(2, 8) // عامل عشوائي
        ].join('|');

        let hash = 5381;
        for (let i = 0; i < deviceInfo.length; i++) {
            hash = ((hash << 5) + hash) + deviceInfo.charCodeAt(i);
        }

        hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
        localStorage.setItem('static_hex_id', hex);
    }
    return hex;
}

// ------------------------------
// 2. تحويل النصوص والترجمة
// ------------------------------
export function normalizeArabic(text) {
    if (!text) return '';
    text = String(text);
    text = text.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    return text
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[ًٌٍَُِّْ]/g, '')
        .toLowerCase()
        .trim();
}

export function autoTranslate(filename) {
    if (!filename) return '';
    let arabic = filename.toLowerCase();
    for (let [en, ar] of Object.entries(translationMap)) {
        const regex = new RegExp(en, 'gi');
        arabic = arabic.replace(regex, ar);
    }
    arabic = arabic
        .replace(/\.pdf$/i, '')
        .replace(/\.webp$/i, '')
        .replace(/-/g, ' ')
        .replace(/_/g, ' ')
        .trim();
    return arabic;
}

// ------------------------------
// 3. Debounce
// ------------------------------
export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// ------------------------------
// 4. التعامل مع SVG (الإحداثيات)
// ------------------------------
export function getCumulativeTranslate(element) {
    let x = 0, y = 0, current = element;
    while (current && current.tagName !== 'svg') {
        const trans = current.getAttribute('transform');
        if (trans) {
            const m = trans.match(/translate\s*\(([\d.-]+)[ ,]+([\d.-]+)\s*\)/);
            if (m) {
                x += parseFloat(m[1]);
                y += parseFloat(m[2]);
            }
        }
        current = current.parentNode;
    }
    return { x, y };
}

export function getGroupImage(element) {
    let current = element;
    while (current && current.tagName !== 'svg') {
        if (current.tagName === 'g') {
            const imgs = [...current.children].filter(c => c.tagName === 'image');
            if (imgs.length) return {
                src: imgs[0].getAttribute('data-src') || imgs[0].getAttribute('href'),
                width: parseFloat(imgs[0].getAttribute('width')),
                height: parseFloat(imgs[0].getAttribute('height')),
                x: parseFloat(imgs[0].getAttribute('x')) || 0,
                y: parseFloat(imgs[0].getAttribute('y')) || 0,
                group: current
            };
        }
        current = current.parentNode;
    }
    return null;
}

// ------------------------------
// 5. أسماء المستخدمين والأجهزة
// ------------------------------
export function getDisplayName() {
    const realName = localStorage.getItem('user_real_name');
    // 1. الأولوية للاسم الديناميكي
    if (realName && realName.trim()) {
        return realName.trim();
    }
    // 2. في حال عدم وجوده، نرجع كود HEX الثابت
    return getStaticHexId();
}

export function getPlayerName() {
    if (typeof UserTracker !== 'undefined' && typeof UserTracker.getDisplayName === 'function') {
        return UserTracker.getDisplayName();
    }
    return getDisplayName();
}

export function getDeviceId() {
    if (typeof UserTracker !== 'undefined' && UserTracker.deviceFingerprint) {
        return UserTracker.deviceFingerprint;
    }
    const stored = localStorage.getItem('device_fingerprint');
    if (stored) return stored;
    // المعرف الافتراضي هو كود HEX
    return getStaticHexId();
}

// ------------------------------
// 6. التحقق من مجلد المادة
// ------------------------------
export function isSubjectFolder(folderName) {
    const lowerName = folderName.toLowerCase();
    return SUBJECT_FOLDERS.some(subject => lowerName.includes(subject));
}

// ------------------------------
// 7. لف النص داخل SVG
// ------------------------------
export function wrapText(el, maxW) {
    const txt = el.getAttribute('data-original-text');
    if (!txt) return;
    const words = txt.split(/\s+/);
    el.textContent = '';

    let ts = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    ts.setAttribute('x', el.getAttribute('x') || '0');
    ts.setAttribute('dy', '0');
    el.appendChild(ts);

    let line = '';
    const lh = parseFloat(el.style.fontSize) * 1.1;

    words.forEach(word => {
        let test = line + (line ? ' ' : '') + word;
        ts.textContent = test;
        if (ts.getComputedTextLength() > maxW - 5 && line) {
            ts.textContent = line;
            ts = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            ts.setAttribute('x', el.getAttribute('x') || '0');
            ts.setAttribute('dy', lh + 'px');
            ts.textContent = word;
            el.appendChild(ts);
            line = word;
        } else {
            line = test;
        }
    });
}

// ------------------------------
// 8. إدارة أخطاء الملفات (shownErrors)
// ------------------------------
const _shownErrors = new Set();
export const addShownError = (url) => _shownErrors.add(url);
export const hasShownError = (url) => _shownErrors.has(url);

// ------------------------------
// 9. التحكم في الزوم (Zoom)
// ------------------------------
let currentSvgZoom = 1;

// تفعيل الزوم بعجلة الماوس (بكرة الماوس)
export function setupMouseWheelZoom() {
    const container = document.getElementById('scroll-container');
    const svg = document.getElementById('main-svg');
    if (!container || !svg) return;

    container.addEventListener('wheel', (e) => {
        e.preventDefault(); 
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        currentSvgZoom = Math.max(0.5, Math.min(4, currentSvgZoom + delta));

        const baseHeight = 2454;
        svg.style.height = `${baseHeight * currentSvgZoom}px`;
        svg.style.transition = 'height 0.1s ease-out';
    }, { passive: false });
}

// تصفير الزوم وإرجاع التمرير للبداية
export function resetSvgZoom() {
    currentSvgZoom = 1;
    const svg = document.getElementById('main-svg');
    const scrollContainer = document.getElementById('scroll-container');
    
    if (svg) {
        svg.style.transition = 'none';
        svg.style.height = ''; 
        
        // إعادة التمرير إلى بداية الخريطة لمنع الشاشة من "الضياع"
        if (scrollContainer) {
            scrollContainer.scrollLeft = 0;
        }
    }
}

// تصفير زوم المتصفح (للموبايل - Pinch Zoom)
export function resetBrowserZoom() {
    const viewport = document.querySelector('meta[name=viewport]');
    if (!viewport) return;

    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

    requestAnimationFrame(() => {
        viewport.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
    });
}

// ------------------------------
// 10. صور مصغّرة (thumbnails)
// ------------------------------
export function getThumbUrl(path) {
    if (!path) return null;
    const clean = String(path).replace(/^\.?\//, '');
    const sha = thumbIndex.get(clean);
    if (!sha) return null;
    const encoded = `${THUMBS_DIR}/${clean}.webp`.split('/').map(encodeURIComponent).join('/');
    return `${RAW_CONTENT_BASE}${encoded}?v=${sha.slice(0, 8)}`;
}

// ------------------------------
// 11. مسح الكاش — من خلال الـ Service Worker فقط
// ------------------------------
export async function clearAppCaches(timeoutMs = 4000) {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = registration && (registration.active || registration.waiting || registration.installing);
    if (!worker) return false; 

    return new Promise(resolve => {
        const finish = (ok) => {
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            resolve(ok);
        };
        const onMessage = (event) => {
            if (event.data && event.data.type === 'CACHE_CLEARED') finish(true);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        navigator.serviceWorker.addEventListener('message', onMessage);
        worker.postMessage({ action: 'clearCache' });
    });
}