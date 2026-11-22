// ============================================
// config.js - الثوابت والإعدادات العامة
// ============================================

export const REPO_NAME = "1";
export const GITHUB_USER = "se-george";

export const NEW_API_BASE = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents`;
export const TREE_API_URL = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/git/trees/main?recursive=1`;
export const RAW_CONTENT_BASE = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/`;

export const GROUP_IMAGE_NAMES = ['1.webp', '01.webp'];

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

export const THUMBS_DIR = 'thumbs';
export const HIDDEN_FOLDERS = ['image', 'groups', 'javascript', THUMBS_DIR];

export const SUBJECT_FOLDERS = [
    'Lecture', 'Section', 'Book', 'Question', 'Video', 'Photo','Assignment', 'Answer', 'Whiteboard', 'Media'
];

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

export const NAV_STATE = {
    GROUP_SELECTION: 'group_selection',
    WOOD_VIEW: 'wood_view',
    MAP_VIEW: 'map_view',
    PDF_VIEW: 'pdf_view'
};

// ✅ تم تحديث الرابط الجديد الخاص بك
export const FORMSPREE_URL = "https://formspree.io/f/xgakpwdj";

export const lanes = [20, 50, 80];
export const TAP_THRESHOLD_MS = 300;
export const isTouchDevice = window.matchMedia('(hover: none)').matches;