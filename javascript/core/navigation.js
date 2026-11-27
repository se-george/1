// ============================================
// navigation.js - زر الرجوع وإدارة الشاشات المفتوحة
// ============================================
// أي "رجوع" بيعدّي على closeTopLayer(): بتقفل أعلى حاجة مفتوحة وبترجّع true،
// ولو مفيش حاجة تتقفل بترجّع false وساعتها الزر يعمل رجوع/خروج عادي.
//
//   المتصفح:   popstate (زر/إيماءة الرجوع). بنحط مدخل احتياطي (guard) في الـ history بعد أول لمسة،
//              عشان الضغطة الأولى على الرجوع تفضل جوه الصفحة بدل ما تخرّج المستخدم منها.
//   التطبيق:   حدث backButton بتاع Capacitor (بلجن App). لو مش متاح بنرجع لنفس طريقة المتصفح.
//   الكمبيوتر: Esc بيقفل النوافذ بس.
//
// الترتيب من الأعلى للأدنى (priority):
//   100 صورة مكبّرة · 90 نافذة اختيار الفتح · 80 معاينة PDF · 60 شاشة تغيير المجموعة
//   50 الخريطة · 40 مجلد (مستوى واحد) · 20 صفحة الخشب (الجذر) ← اختيار المجموعة
// النوافذ والمجلدات بتسجّل نفسها بـ registerBackLayer من ملفاتها (من غير import دائري).

import { NAV_STATE } from './config.js';
import { currentFolder } from './state.js';
import { isShown } from './utils.js';
import { isNativeApp, getPlugin } from '../features/sync-local.js';

// ---------- مكدّس الحالات ----------
export const navigationHistory = [];

export function pushNavigationState(state, data = {}) {
    navigationHistory.push({ state, data, timestamp: Date.now() });
    console.log(`📍 تم إضافة حالة: ${state}`, data);
}

export function popNavigationState() {
    if (navigationHistory.length > 0) {
        const popped = navigationHistory.pop();
        console.log(`🔙 تم إزالة حالة: ${popped.state}`);
        return popped;
    }
    return null;
}

export function getCurrentNavigationState() {
    return navigationHistory.length > 0
        ? navigationHistory[navigationHistory.length - 1]
        : null;
}

// يفضّي المكدّس ويبدأ من حالة واحدة (عند تحميل مجموعة جديدة)
export function resetNavigationTo(state, data = {}) {
    navigationHistory.length = 0;
    pushNavigationState(state, data);
}

const topState = () => {
    const top = getCurrentNavigationState();
    return top ? top.state : null;
};
const byId = (id) => document.getElementById(id);

// ---------- الطبقات (من الأعلى للأدنى) ----------
// layer: { id, priority, popup?, isOpen(): boolean, close(): void }
const layers = [];

export function registerBackLayer(layer) {
    const i = layers.findIndex(l => l.id === layer.id);
    if (i >= 0) layers.splice(i, 1);
    layers.push(layer);
    layers.sort((a, b) => b.priority - a.priority);
}

const isOnMap = () => {
    const sc = byId('scroll-container');
    return !!sc && sc.scrollLeft > 8;
};

function showGroupScreen() {
    const gs = byId('group-selection-screen');
    if (gs) {
        gs.classList.remove('hidden');
        gs.style.display = 'flex';
    }
}

function hideGroupScreen() {
    const gs = byId('group-selection-screen');
    if (gs) {
        gs.classList.add('hidden');
        gs.style.display = 'none';
    }
}

// حالات فاضلة في المكدّس من غير ما شاشتها تكون ظاهرة فعلًا (لمسة سريعة، تمرير يدوي...): بنشيلها
// عشان ضغطة الرجوع ما تضيعش على حاجة مش ظاهرة
function dropStaleStates() {
    for (let i = 0; i < 20; i++) {
        const top = topState();
        const stale =
            (top === NAV_STATE.PDF_VIEW && !isShown(byId('pdf-preview-popup'))) ||
            (top === NAV_STATE.GROUP_SELECTION && !isShown(byId('group-selection-screen'))) ||
            (top === NAV_STATE.MAP_VIEW && !isOnMap());
        if (!stale) return;
        popNavigationState();
    }
}

// شاشة اختيار المجموعة اتفتحت من زر "Change Group" فوق صفحة الخشب ← نقفلها ونرجع للخشب
registerBackLayer({
    id: 'group-overlay',
    priority: 60,
    isOpen: () => topState() === NAV_STATE.GROUP_SELECTION && isShown(byId('group-selection-screen')),
    close() {
        popNavigationState();
        hideGroupScreen();
    }
});

// الخريطة (بعد زر "إلى الخريطة") ← نرجع لصفحة الخشب
registerBackLayer({
    id: 'map',
    priority: 50,
    isOpen: () => topState() === NAV_STATE.MAP_VIEW && isOnMap(),
    close() {
        popNavigationState();
        goToWood();
    }
});

// صفحة الخشب عند الجذر ← شاشة اختيار المجموعة (والضغطة اللي بعدها تخرّج)
registerBackLayer({
    id: 'wood-root',
    priority: 20,
    isOpen: () => topState() === NAV_STATE.WOOD_VIEW && !isShown(byId('group-selection-screen')),
    close() {
        showGroupScreen();
        byId('js-toggle-container')?.classList.add('fully-hidden');
        const sc = byId('scroll-container');
        if (sc) sc.style.display = 'none';
        navigationHistory.length = 0;
    }
});

// بتقفل أعلى طبقة مفتوحة. popupsOnly: النوافذ بس (للـ Esc). بترجّع true لو قفلت حاجة
export function closeTopLayer({ popupsOnly = false } = {}) {
    dropStaleStates();
    for (const layer of layers) {
        if (popupsOnly && !layer.popup) continue;
        let open = false;
        try {
            open = !!layer.isOpen();
        } catch (err) {
            console.warn(`⚠️ فحص الطبقة ${layer.id} فشل:`, err);
        }
        if (!open) continue;
        console.log(`🔙 رجوع: قفل ${layer.id}`);
        try {
            layer.close();
        } catch (err) {
            console.error(`❌ قفل ${layer.id} فشل:`, err);
        }
        return true;
    }
    return false;
}

// ---------- المتصفح: مدخل احتياطي (guard) في الـ history ----------
const BASE_STATE = { cs26: 'base' };
const GUARD_STATE = { cs26: 'guard' };
let guardOn = false;        // المدخل الاحتياطي موجود فوق مدخل الصفحة
let guardPending = false;   // مستنيين أول لمسة عشان نحطه

function pushGuard() {
    try {
        history.pushState(GUARD_STATE, '');
        guardOn = true;
    } catch (err) {
        guardOn = false;
    }
}

// كروم بيتخطّى مدخلات الـ history اللي الصفحة بتضيفها من غير لمسة من المستخدم (Back بيعدّي عليها)،
// فبنحط الـ guard أول ما تيجي لمسة/ضغطة/زر
function armGuardOnFirstGesture() {
    if (guardOn || guardPending) return;
    guardPending = true;
    const events = ['pointerup', 'touchend', 'mouseup', 'click', 'keydown'];
    const arm = () => {
        events.forEach(type => window.removeEventListener(type, arm, true));
        guardPending = false;
        if (!guardOn) pushGuard();
    };
    events.forEach(type => window.addEventListener(type, arm, { capture: true, passive: true }));
}

function onPopState(e) {
    // الرجوع من الـ guard بيوصّلنا لمدخل الصفحة نفسه
    if (!e.state || e.state.cs26 !== 'base') return;
    guardOn = false;

    if (closeTopLayer()) {
        pushGuard();            // نرجّع الـ guard عشان الضغطة الجاية تتمسك برضه
        return;
    }

    // مفيش حاجة تتقفل: رجوع عادي (يخرج للصفحة اللي قبل الموقع لو فيه)
    console.log('📱 لا توجد شاشة مفتوحة - رجوع عادي');
    history.back();
    // لو مفيش صفحة قبله الصفحة بتفضل مكانها: نجهّز الـ guard تاني عند أول لمسة
    setTimeout(() => armGuardOnFirstGesture(), 400);
}

// ---------- التطبيق: زر الرجوع في أندرويد ----------
function hookNativeBackButton() {
    if (!isNativeApp()) return;
    const App = getPlugin('App');
    if (!App || typeof App.addListener !== 'function') return;
    try {
        const registration = App.addListener('backButton', () => {
            let handled = false;
            try {
                handled = closeTopLayer();
            } catch (err) {
                console.error('❌ خطأ في زر الرجوع:', err);
            }
            if (handled) return;
            // مفيش حاجة تتقفل: نخرج من التطبيق (من غير الـ listener ده كان الخروج هو الافتراضي)
            if (typeof App.exitApp === 'function') App.exitApp();
            else history.back();
        });
        if (registration && typeof registration.catch === 'function') {
            registration.catch(err => console.warn('⚠️ تعذر تسجيل زر الرجوع:', err));
        }
    } catch (err) {
        console.warn('⚠️ تعذر تسجيل زر الرجوع:', err);
    }
}

let setupDone = false;

export function setupBackButton() {
    if (setupDone) return;
    setupDone = true;
    console.log('🔧 إعداد نظام التنقل الخلفي');

    try {
        const st = history.state;
        if (st && st.cs26 === 'guard') guardOn = true;                 // الصفحة اتعمللها reload وإحنا فوق الـ guard
        else if (!st || st.cs26 !== 'base') history.replaceState(BASE_STATE, '');
    } catch (err) { /* history مقفول */ }

    window.addEventListener('popstate', onPopState);

    // Esc بيقفل أي نافذة مفتوحة (للكمبيوتر)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeTopLayer({ popupsOnly: true });
    });

    hookNativeBackButton();
    armGuardOnFirstGesture();

    console.log('✅ نظام التنقل الخلفي جاهز');
}

// ---------- التنقل بين صفحة الخشب والخريطة ----------
export function goToWood() {
    const scrollContainer = byId('scroll-container');
    if (scrollContainer) {
        scrollContainer.scrollTo({ left: 0, behavior: 'smooth' });
    }
    if (topState() !== NAV_STATE.WOOD_VIEW) {
        pushNavigationState(NAV_STATE.WOOD_VIEW, { folder: currentFolder });
    }
}

export function goToMapEnd() {
    const scrollContainer = byId('scroll-container');
    if (!scrollContainer) return;
    const maxScrollRight = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    scrollContainer.scrollTo({ left: maxScrollRight, behavior: 'smooth' });
    if (topState() !== NAV_STATE.MAP_VIEW) {
        pushNavigationState(NAV_STATE.MAP_VIEW);
    }
}
