// ============================================
// config.js - الثوابت والإعدادات العامة
// ============================================

export const REPO_NAME = "1";
export const GITHUB_USER = "se-george";

// ملاحظة: اسم الكاش وإصداره معرّفين في sw.js فقط (const CACHE_NAME) — مفيش حاجة تخصه هنا.

export const NEW_API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents`;
export const TREE_API_URL = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/git/trees/main?recursive=1`;
export const RAW_CONTENT_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/`;

// صورة خريطة الجروب (الخلفية اللي بتتركّب عليها المستطيلات): image/<الجروب>/<الاسم>
// الكود بيجرّب الأسماء بالترتيب ويستخدم أول اسم موجود فعلاً (الأول = الأساسي).
// لما تتأكد من الاسم الصح سيب اسم واحد بس.
export const GROUP_IMAGE_NAMES = ['1.webp', '01.webp'];
export const groupImagePaths = (groupLetter) =>
    GROUP_IMAGE_NAMES.map(name => `image/${groupLetter}/${name}`);

// الملفات المحمية (لا يتم تحديثها تلقائياً)
export const PROTECTED_FILES = [
    'image/0.webp',
    'image/wood.webp'
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