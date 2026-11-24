// ============================================
// sync-local.js - تنزيل الملف على الجهاز وفتحه بتطبيق PDF (تطبيق الـ APK فقط)
// ============================================
// الموقع شغال بدون bundler، فمفيش import لحزم npm هنا: الـ APK بيحقن window.Capacitor
// ومنه بنوصل للبلجنز (Filesystem / FileViewer / Share ...).
// في المتصفح العادي isNativeApp() = false والزر "فتح من الجهاز" بيفضل مخفي.

import { RAW_CONTENT_BASE } from '../core/config.js';
import { globalFileTree } from '../core/state.js';

const LOCAL_ROOT = 'CS26';              // مجلد الملفات جوه مساحة التطبيق: Android/data/<التطبيق>/files/CS26
const DIRECTORY = 'EXTERNAL';           // = Directory.External — من غير صلاحيات، وبيتمسح مع حذف التطبيق
const INDEX_KEY = 'cs26_local_files';   // { "مسار الملف في الريبو": sha } — منه نعرف لو الملف اتغير على GitHub

export function isNativeApp() {
    try {
        const cap = window.Capacitor;
        if (!cap) return false;
        if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform();
        return typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web';
    } catch (e) {
        return false;
    }
}

// بلجن Capacitor بالاسم (من غير import). بترجع null لو مش متاح.
export function getPlugin(name) {
    try {
        const cap = window.Capacitor;
        if (!cap) return null;
        return (cap.Plugins && cap.Plugins[name]) || (typeof cap.registerPlugin === 'function' ? cap.registerPlugin(name) : null);
    } catch (e) {
        return null;
    }
}

// "./CCS/Lecture/x.pdf " → "CCS/Lecture/x.pdf"
export function normalizeRepoPath(path) {
    let p = String(path || '').trim().replace(/^(\.?\/)+/, '');
    try { p = decodeURIComponent(p); } catch (e) { /* مش مترمّز */ }
    return p;
}

const remoteUrl = (repoPath) => RAW_CONTENT_BASE + repoPath.split('/').map(encodeURIComponent).join('/');

function readIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || {}; } catch (e) { return {}; }
}

function writeIndex(index) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch (e) { /* التخزين مقفول */ }
}

// sha الملف الحالي على GitHub (من شجرة الملفات اللي التطبيق محملها)
function treeSha(repoPath) {
    const entry = globalFileTree.find(e => e.type === 'blob' && e.path === repoPath);
    return entry ? entry.sha : null;
}

function fetchAsBase64(url) {
    return fetch(url, { cache: 'no-store' }).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
    }).then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('فشل قراءة الملف'));
        reader.onload = () => {
            const s = String(reader.result);
            resolve(s.slice(s.indexOf(',') + 1));      // بنشيل "data:...;base64,"
        };
        reader.readAsDataURL(blob);
    }));
}

async function downloadToDevice(Filesystem, url, relPath) {
    try {
        // تنزيل أصلي من غير تحويل base64 — أخف على الذاكرة مع الملفات الكبيرة
        await Filesystem.downloadFile({ url, path: relPath, directory: DIRECTORY, recursive: true });
        return;
    } catch (e) {
        console.warn('⚠️ downloadFile فشل — هجرب fetch + base64:', e);
    }
    const data = await fetchAsBase64(url);
    await Filesystem.writeFile({ path: relPath, data, directory: DIRECTORY, recursive: true });
}

async function ensureLocalCopy(Filesystem, repoPath) {
    const relPath = `${LOCAL_ROOT}/${repoPath}`;
    const sha = treeSha(repoPath);
    const index = readIndex();

    let present = false;
    try {
        await Filesystem.stat({ path: relPath, directory: DIRECTORY });
        present = true;
    } catch (e) { /* مش موجود لسه */ }

    // موجود ومتسجل عندنا، والـ sha ما اتغيرش (أو مفيش شجرة نقارن بيها) → نستخدمه من غير تنزيل
    const upToDate = present && !!index[repoPath] && (!sha || index[repoPath] === sha);
    if (!upToDate) {
        await downloadToDevice(Filesystem, remoteUrl(repoPath), relPath);
        index[repoPath] = sha || 'unknown';
        writeIndex(index);
    }
    const { uri } = await Filesystem.getUri({ path: relPath, directory: DIRECTORY });
    return { uri, fromCache: upToDate };
}

const errorCode = (e) => (e && (e.code || e.errorCode)) || ((String((e && e.message) || e).match(/OS-PLUG-FLVW-\d+/) || [])[0] || '');

async function openLocalFile(uri) {
    const plain = uri.replace(/^file:\/\//, '');
    let lastError = null;

    const FileViewer = getPlugin('FileViewer');
    if (FileViewer) {
        // التوثيق بيقول "مسار كامل" ومش واضح بيقبل file:// ولا لأ — بنجرب الشكلين
        for (const path of [plain, uri]) {
            try {
                await FileViewer.openDocumentFromLocalPath({ path });
                return { ok: true };
            } catch (e) {
                lastError = e;
                if (errorCode(e) === 'OS-PLUG-FLVW-0010') {   // مفيش تطبيق يفتح النوع ده
                    return { ok: false, message: 'مفيش تطبيق على الجهاز يفتح الملف ده. نزّل قارئ PDF وجرب تاني.' };
                }
            }
        }
    }

    // خطة بديلة: قائمة المشاركة (المستخدم يختار التطبيق)
    const Share = getPlugin('Share');
    if (Share) {
        try {
            await Share.share({ title: plain.split('/').pop(), url: uri, dialogTitle: 'افتح الملف بـ...' });
            return { ok: true };
        } catch (e) {
            if (/cancel/i.test(String((e && e.message) || e))) return { ok: true };   // المستخدم قفل القائمة
            lastError = lastError || e;
        }
    }

    console.error('❌ فتح الملف:', lastError);
    return { ok: false, message: 'الملف اتحفظ على الجهاز بس معرفتش أفتحه تلقائيًا. دوّر عليه في تطبيق الملفات (Android/data ← CS26).' };
}

// ينزل الملف على الجهاز (مرة واحدة، ويتجدد لو اتغير على GitHub) ويفتحه. بترجع { ok, message }.
export async function syncAndOpenFile(path) {
    if (!isNativeApp()) return { ok: false, message: 'الميزة دي متاحة في تطبيق الأندرويد بس.' };

    const Filesystem = getPlugin('Filesystem');
    if (!Filesystem) return { ok: false, message: 'بلجن الملفات مش موجود في التطبيق.' };

    const repoPath = normalizeRepoPath(path);
    if (!repoPath || repoPath.split('/').includes('..')) return { ok: false, message: 'مسار الملف غير صحيح.' };

    let uri;
    try {
        ({ uri } = await ensureLocalCopy(Filesystem, repoPath));
    } catch (e) {
        console.error('❌ تنزيل الملف:', e);
        return { ok: false, message: 'تعذر تنزيل الملف — تأكد من الاتصال بالإنترنت.' };
    }
    return openLocalFile(uri);
}
