// ============================================
// state.js - الحالة المشتركة للتطبيق
// ============================================

import { THUMBS_DIR } from './config.js';

// المجموعة الحالية (A, B, C, D)
export let currentGroup = null;

// المجلد الحالي في واجهة الخشب
export let currentFolder = "";

// شجرة الملفات من GitHub
export let globalFileTree = [];

// فهرس الـ thumbnails: مسار الملف الأصلي → sha بتاع الـ thumbnail (بيتبني من الشجرة نفسها)
// الـ sha بيتحط في رابط الـ thumbnail (?v=) فأي تغيير في الصورة بيدّي رابط جديد تلقائياً
export let thumbIndex = new Map();

function buildThumbIndex(tree) {
    const prefix = THUMBS_DIR + '/';
    const index = new Map();
    for (const entry of tree) {
        if (entry.type === 'blob' && entry.path.startsWith(prefix) && entry.path.endsWith('.webp')) {
            index.set(entry.path.slice(prefix.length, -'.webp'.length), entry.sha);
        }
    }
    return index;
}

// دوال التعديل الآمنة
export function setCurrentGroup(group) {
    currentGroup = group;
    localStorage.setItem('selectedGroup', group);
    window.dispatchEvent(new CustomEvent('groupChanged', { detail: group }));
}

export function setCurrentFolder(folder) {
    currentFolder = folder;
}

export function setGlobalFileTree(tree) {
    globalFileTree = tree;
    thumbIndex = buildThumbIndex(tree);
}