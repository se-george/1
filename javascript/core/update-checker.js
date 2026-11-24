// ============================================
// update-checker.js - زر "🔄 التحقق من وجود تحديثات"
// ============================================
// 1) تحديث الموقع (PWA، وكمان الـ APK لأنه بيفتح الموقع): بنقارن آخر commit على main
//    بالمحفوظ. لو اتغير → نمسح الكاش ونعيد التحميل. (نفس منطق الفحص التلقائي في index.html
//    بس من غير فترة الانتظار، لأن المستخدم داس الزر بنفسه.)
// 2) تحديث الـ APK نفسه (جوه التطبيق بس): بنقارن رقم النسخة المثبتة بآخر Release على GitHub.

import { GITHUB_USER, REPO_NAME } from './config.js';
import { clearAppCaches } from './utils.js';
import { isNativeApp, getPlugin } from '../features/sync-local.js';

const API = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}`;
const FALLBACK_APP_VERSION = '1.0.0';    // لو معرفناش نقرا رقم نسخة التطبيق من النظام

let checking = false;
let clearTimer = null;

const lsGet = (key) => { try { return localStorage.getItem(key); } catch (e) { return null; } };
const lsSet = (key, value) => { try { localStorage.setItem(key, value); } catch (e) { /* التخزين مقفول */ } };
const lsRemove = (key) => { try { localStorage.removeItem(key); } catch (e) { /* التخزين مقفول */ } };

// الحالة بتظهر جوه الزر نفسه (بدل نص منفصل كانت لوحة البحث بتغطيه) وبترجع للاسم الأصلي بعد شوية
let defaultLabel = null;
function setStatus(text, autoClearMs = 8000) {
    const el = document.getElementById('update-btn-text');
    if (!el) return;
    if (defaultLabel === null) defaultLabel = el.textContent;
    clearTimeout(clearTimer);
    el.textContent = text || defaultLabel;
    if (text && autoClearMs) clearTimer = setTimeout(() => { el.textContent = defaultLabel; }, autoClearMs);
}

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

export function isNewerVersion(latest, current) {
    const a = versionParts(latest);
    const b = versionParts(current);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
}

// ---------- 1) تحديث الموقع ----------
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

    setStatus('🆕 فيه تحديث جديد — جاري التطبيق...', 0);
    await clearAppCaches();
    lsSet('last_commit_sha', latest);
    lsRemove('preload_done');
    window.location.reload();
    return true;
}

// ---------- 2) تحديث الـ APK ----------
async function getInstalledVersion() {
    const App = getPlugin('App');
    if (App) {
        try {
            const info = await App.getInfo();
            if (info && info.version) return info.version;
        } catch (e) { /* هنستخدم الاحتياطي */ }
    }
    return FALLBACK_APP_VERSION;
}

async function checkApkUpdate() {
    const release = await githubJson(`${API}/releases/latest`);
    if (!release || !release.tag_name) return null;

    const installed = await getInstalledVersion();
    if (!isNewerVersion(release.tag_name, installed)) return { upToDate: true, installed };

    const apk = (release.assets || []).find(a => /\.apk$/i.test(a.name));
    return {
        upToDate: false,
        installed,
        version: release.tag_name,
        url: apk ? apk.browser_download_url : release.html_url,
        notes: release.body || ''
    };
}

async function openDownload(url) {
    const Browser = getPlugin('Browser');
    if (Browser) {
        try { await Browser.open({ url }); return; } catch (e) { console.warn('⚠️ Browser.open فشل:', e); }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

// ---------- الزر ----------
export async function checkForUpdates() {
    if (checking) return;
    checking = true;
    setStatus('⏳ جاري التحقق من وجود تحديثات...', 0);

    try {
        if (await checkWebUpdate()) return;          // الصفحة بتتعمل reload

        let message = '✅ أنت على آخر نسخة';
        if (isNativeApp()) {
            const apk = await checkApkUpdate().catch(err => {
                console.warn('⚠️ فحص تحديث التطبيق فشل:', err);
                return null;
            });
            if (apk && !apk.upToDate) {
                message = `🆕 يتوفر إصدار جديد من التطبيق (${apk.version})`;
                const notes = apk.notes.trim().slice(0, 300) || 'تحسينات وإصلاحات.';
                if (confirm(`إصدار جديد من التطبيق: ${apk.version}\n(المثبت عندك: ${apk.installed})\n\n${notes}\n\nتحميله الآن؟`)) {
                    await openDownload(apk.url);
                }
            }
        }
        setStatus(message);
    } catch (err) {
        console.error('❌ خطأ أثناء التحقق من التحديثات:', err);
        setStatus('⚠️ تعذر التحقق — تأكد من الاتصال بالإنترنت');
    } finally {
        checking = false;
    }
}
