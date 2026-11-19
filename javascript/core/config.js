// ============================================
// config.js - الثوابت والإعدادات العامة
// ============================================

export const REPO_NAME = "s4";
export const GITHUB_USER = "MUE24Med";

// ✅ المصدر الوحيد لاسم الكاش — غيّره هنا فقط عند كل تحديث
// (يُمرَّر للـ Service Worker كـ ?v= ويستخدمه preload.js أيضاً)
export const SW_CACHE_NAME = "semester-4-cache-2026-11-19-01";

export const NEW_API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents`;
export const TREE_API_URL = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/git/trees/main?recursive=1`;
export const RAW_CONTENT_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/`;

// الملفات المحمية (لا يتم تحديثها تلقائياً)
export const PROTECTED_FILES = [
    'image/0.webp',
    'image/wood.webp',
    'image/Upper_wood.webp',
    'image/logo-A.webp',
    'image/logo-B.webp',
    'image/logo-C.webp',
    'image/logo-D.webp',
    'image/logo-E.webp',
    'image/logo-F.webp',
    'image/black.webp'
];

export function isProtectedFile(filename) {
    return PROTECTED_FILES.some(protectedFile =>
        filename.endsWith(protectedFile) || filename.includes(`/${protectedFile}`)
    );
}

// أسماء المواد للتصنيف
export const SUBJECT_FOLDERS = [
    'Lecture', 'Section', 'Book', 'Question', 'Video', 'Photo','Assignment', 'Answer', 'Whiteboard', 'Media'
];

// خريطة الترجمة للأسماء
export const translationMap = {
    'Percalculus': 'بريكالكيولاس',
    'IS': 'Introduction to information System',
    'Introduction to Computing': 'كومبيوتينج',
    'section': 'سكشن',
    'lecture': 'محاضرة',
    'question': 'أسئلة',
    'answer': 'إجابات',
    'discussion': 'مناقشة',
    'book': 'كتاب',
    'bio': 'بيوكيميستري',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};

// حالات التنقل
export const NAV_STATE = {
    GROUP_SELECTION: 'group_selection',
    WOOD_VIEW: 'wood_view',
    MAP_VIEW: 'map_view',
    PDF_VIEW: 'pdf_view'
};

// رابط Formspree للعبة
export const FORMSPREE_URL = "https://formspree.io/f/xzdpqrnj";

// ممرات اللعبة
export const lanes = [20, 50, 80];

// إعدادات اللمس
export const TAP_THRESHOLD_MS = 300;
export const isTouchDevice = window.matchMedia('(hover: none)').matches;