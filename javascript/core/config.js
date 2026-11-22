// ============================================
// config.js - الثوابت والإعدادات العامة
// ============================================

export const REPO_NAME = "1";
export const GITHUB_USER = "se-george";

// ⚠️ الكاش كله (الاسم، الإصدار، قائمة الملفات، الحد الأقصى، المسح) معرّف في sw.js فقط.
//    مفيش اسم كاش ولا قائمة ملفات للكاش هنا ولا في أي ملف تاني — الصفحة بتكلّم الـ SW برسائل بس.

export const NEW_API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents`;
export const TREE_API_URL = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/git/trees/main?recursive=1`;
export const RAW_CONTENT_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/`;

// صورة خريطة الجروب (الخلفية اللي بتتركّب عليها المستطيلات): image/<الجروب>/<الاسم>
// الكود بيجرّب الأسماء بالترتيب ويستخدم أول اسم موجود فعلاً.
export const GROUP_IMAGE_NAMES = ['01.webp'];

// آخر مسار اتحمّل بنجاح لكل جروب بيتحفظ (تلميح مش كاش) ونفضّله في الزيارة الجاية:
//  - مفيش طلب 404 على الاسم الغلط
//  - index.html بيعمل preload للصورة دي من أول ما الصفحة تفتح (لازم نفس مفتاح 'map_img:' هناك)
const mapImageKey = (groupLetter) => `map_img:${groupLetter}`;

export const groupImagePaths = (groupLetter) => {
    const all = GROUP_IMAGE_NAMES.map(name => `image/${groupLetter}/${name}`);
    let last = null;
    try { last = localStorage.getItem(mapImageKey(groupLetter)); } catch (e) { /* التخزين مقفول */ }
    return last && all.includes(last) ? [last, ...all.filter(path => path !== last)] : all;
};

export const rememberGroupImage = (groupLetter, path) => {
    try { localStorage.setItem(mapImageKey(groupLetter), path); } catch (e) { /* التخزين مقفول */ }
};

// مجلد الـ thumbnails (بيتولّد تلقائي بـ .github/workflows/generate-thumbs.yml في نفس الـ repo)
export const THUMBS_DIR = 'thumbs';

// مجلدات مش بتظهر في واجهة الخشب (ملفات الموقع نفسه + الـ thumbnails)
export const HIDDEN_FOLDERS = ['image', 'groups', 'javascript', THUMBS_DIR];

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