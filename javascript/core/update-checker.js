// ============================================
// update-checker.js - زرّين التحديث أعلى صفحة الخشب
// ============================================
// 🌐 #update-btn  تحديث الموقع: بنقارن آخر commit على main بالمحفوظ. لو اتغير → نمسح الكاش ونعيد التحميل.
//                 (شغال في المتصفح وجوه الـ APK، لأن الـ APK بيفتح الموقع نفسه.)
// 📱 #app-btn     التطبيق (APK): بيعرض رقم آخر إصدار منشور في GitHub Releases دايمًا.
//                 - في المتصفح: ضغطة واحدة = تنزيل مباشر لملف الـ APK.
//                 - جوه التطبيق: بيقارن الإصدار المثبّت بآخر إصدار، ولو فيه أحدث الضغطة بتنزّله.

import { RELEASES_API_URL, RELEASES_PAGE_URL, apkDownloadUrl, GITHUB_USER, REPO_NAME } from './config.js';
import { clearAppCaches } from './utils.js';
import { isNativeApp, getPlugin } from '../features/sync-local.js';

const API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}`;
const RELEASE_CACHE_KEY = 'app_release_cache';
// حد GitHub API من غير توكن = 60 طلب/ساعة لكل IP (وشبكات الموبايل بتتشارك الـ IP) فبنخزّن آخر إصدار
const RELEASE_TTL_MS = 30 * 60 * 1000;
const BUTTON_TEXT_MAX_WIDTH = 360;      // عرض الزر 384 − هامش

const lsGet = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* التخزين مقفول */ } };
const lsRemove = (key) => { try { localStorage.removeItem(key); } catch (e) { /* التخزين مقفول */ } };

// ---------- نص الزر (سطر واحد، ويصغّر الخط لو طويل) ----------
function fitText(el, maxWidth) {
    el.style.fontSize = '';
    try {
        let size = parseFloat(getComputedStyle(el).fontSize) || 24;
        for (let i = 0; i < 8 && size > 12 && el.getComputedTextLength() > maxWidth; i++) {
            size -= 2;
            el.style.fontSize = size + 'px';
        }
    } catch (e) { /* العنصر مش معروض */ }
}

function createLabel(textId) {
    let base = null;
    let timer = null;
    const label = {
        // نص مؤقت (بيرجع للنص الأساسي بعد autoClearMs لو اتحدد)
        set(text, autoClearMs = 0) {
            const el = document.getElementById(textId);
            if (!el) return;
            if (base === null) base = el.textContent;
            clearTimeout(timer);
            el.textContent = text;
            fitText(el, BUTTON_TEXT_MAX_WIDTH);
            if (autoClearMs) timer = setTimeout(() => label.reset(), autoClearMs);
        },
        // النص الأساسي الجديد (اللي بيرجع له الزر)
        setBase(text) { base = text; label.set(text); },
        reset() { if (base !== null) label.set(base); }
    };
    return label;
}

const siteLabel = createLabel('update-btn-text');
const appLabel = createLabel('app-btn-text');

// GitHub API مع مهلة 10 ثواني. 404 → null (مثلاً مفيش Releases لسه)
async function githubJson(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
        const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github.v3+json' }, signal: ctrl.signal });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// "v1.2.10" → [1, 2, 10]
const versionParts = (v) => String(v || '').replace(/^[^\d]*/, '').split('.').map(n => parseInt(n, 10) || 0);
const tagLabel = (v) => 'v' + String(v || '').replace(/^[^\d]*/, '');

export function isNewerVersion(latest, current) {
    const a = versionParts(latest);
    const b = versionParts(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

// ============================================
// 🌐 تحديث الموقع
// ============================================
let siteBusy = false;

// بترجع true لو لقت تحديث وبدأت إعادة التحميل
async function checkWebUpdate() {
    const data = await githubJson(`${API}/commits/main`);
    if (!data || !data.sha) throw new Error('مفيش commit في الرد');

    const latest = data.sha.substring(0, 7);
    const last = lsGet('last_commit_sha');
    lsSet('last_update_check', String(Date.now()));

    if (!last || last === latest) {
        lsSet('last_commit_sha', latest);
        return false;
    }

    siteLabel.set('🆕 تحديث جديد...');
    await clearAppCaches();
    lsSet('last_commit_sha', latest);
    lsRemove('preload_done');
    window.location.reload();
    return true;
}

export async function checkForUpdates() {
    if (siteBusy) return;
    siteBusy = true;
    siteLabel.set('⏳ جاري التحقق...');
    try {
        if (await checkWebUpdate()) return;          // الصفحة بتتعمل reload
        siteLabel.set('✅ الموقع محدّث', 6000);
    } catch (err) {
        console.error('❌ خطأ أثناء التحقق من تحديث الموقع:', err);
        siteLabel.set('⚠️ تعذر التحقق', 6000);
    } finally {
        siteBusy = false;
    }
}

// ============================================
// 📱 التطبيق (APK)
// ============================================
const appState = { native: false, release: null, installed: null };
let appBusy = false;

function readReleaseCache() {
    try {
        const cached = JSON.parse(lsGet(RELEASE_CACHE_KEY));
        return cached && cached.tag && cached.url ? cached : null;
    } catch (e) {
        return null;
    }
}

// بترجع { tag, url, notes, savedAt } أو null لو مفيش Release منشور
async function fetchLatestRelease() {
    const release = await githubJson(RELEASES_API_URL);
    if (!release || !release.tag_name) return null;
    const apk = (release.assets || []).find(a => /\.apk$/i.test(a.name));
    return {
        tag: release.tag_name,
        url: apk ? apk.browser_download_url : apkDownloadUrl(release.tag_name),
        notes: release.body || '',
        savedAt: Date.now()
    };
}

async function getLatestRelease(force = false) {
    const cached = readReleaseCache();
    if (!force && cached && Date.now() - cached.savedAt < RELEASE_TTL_MS) return cached;
    try {
        const fresh = await fetchLatestRelease();
        if (fresh) lsSet(RELEASE_CACHE_KEY, JSON.stringify(fresh));
        else lsRemove(RELEASE_CACHE_KEY);
        return fresh;
    } catch (err) {
        console.warn('⚠️ تعذر جلب آخر إصدار للتطبيق:', err);
        return cached;                               // أوفلاين / تخطّينا حد الـ API: نعرض آخر إصدار معروف
    }
}

async function getInstalledVersion() {
    const App = getPlugin('App');
    if (!App) return null;
    try {
        const info = await App.getInfo();
        return (info && info.version) || null;
    } catch (e) {
        return null;
    }
}

function renderAppButton() {
    const { native, release, installed } = appState;
    let text = '📱 تحميل التطبيق';
    let hasUpdate = false;

    if (release) {
        if (native && installed) {
            hasUpdate = isNewerVersion(release.tag, installed);
            text = hasUpdate ? `⬆️ تحديث التطبيق ${tagLabel(release.tag)}` : `✅ آخر إصدار ${tagLabel(installed)}`;
        } else {
            text = `📱 تحميل التطبيق ${tagLabel(release.tag)}`;
        }
    }
    document.getElementById('app-btn')?.classList.toggle('has-update', hasUpdate);
    appLabel.setBase(text);
    return hasUpdate;
}

// تنزيل مباشر لملف الـ APK: جوه التطبيق من خلال متصفح النظام، وفي المتصفح من خلال تبويب جديد
async function openDownload(url) {
    if (appState.native) {
        const Browser = getPlugin('Browser');
        if (Browser) {
            try { await Browser.open({ url }); return; } catch (e) { console.warn('⚠️ Browser.open فشل:', e); }
        }
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// بيتنادى مرة واحدة عند فتح الموقع: يعرض آخر إصدار معروف فورًا (من الكاش) وبعدين يحدّثه
export async function initUpdateButtons() {
    appState.native = isNativeApp();
    appState.release = readReleaseCache();
    renderAppButton();

    const [installed, release] = await Promise.all([
        appState.native ? getInstalledVersion() : null,
        getLatestRelease(false)
    ]);
    appState.installed = installed;
    appState.release = release;
    renderAppButton();
}

export async function onAppButtonClick() {
    if (appBusy) return;
    appBusy = true;
    try {
        // المتصفح: الرابط معروف → تنزيل مباشر من غير انتظار (وبنحدّث الرقم في الخلفية)
        if (!appState.native) {
            if (appState.release) {
                await openDownload(appState.release.url);
                getLatestRelease(true).then(release => { appState.release = release; renderAppButton(); });
            } else {
                await openDownload(RELEASES_PAGE_URL);          // الـ API مش متاح: صفحة الـ Releases
            }
            return;
        }

        // التطبيق: نتحقق الأول، ولو فيه إصدار أحدث ننزّله
        appLabel.set('⏳ جاري التحقق...');
        const release = await getLatestRelease(true);
        appState.release = release;
        if (!appState.installed) appState.installed = await getInstalledVersion();

        if (!release) {
            renderAppButton();
            appLabel.set('⚠️ تعذر التحقق', 4000);
        } else if (renderAppButton()) {
            await openDownload(release.url);
        } else {
            appLabel.set('✅ أنت على آخر نسخة', 4000);
        }
    } catch (err) {
        console.error('❌ خطأ في زر التطبيق:', err);
        appLabel.set('⚠️ تعذر التحقق', 4000);
    } finally {
        appBusy = false;
    }
}
