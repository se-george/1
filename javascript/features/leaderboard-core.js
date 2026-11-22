// ============================================
// leaderboard-core.js - إدارة القائمة والرقم القياسي
// الإصدار الجديد: يعتمد على ملف JSON يدوي + إرسال لـ Formspree
// ============================================

import { FORMSPREE_URL } from '../core/config.js';
import { getPlayerName, getDeviceId } from '../core/utils.js';

// ─── ثوابت ─────────────────────────────────
export const LEADERBOARD_CACHE_KEY = 'leaderboard_top5_cache';
export const LEADERBOARD_CACHE_TTL = 5 * 60 * 1000;   // 5 دقائق
export const MAX_CLOUD_SCORES      = 5;

// ─── كائن إدارة الكاش المحلي ──────────────
export const LeaderboardCache = {
    save(top5) {
        try {
            localStorage.setItem(LEADERBOARD_CACHE_KEY, JSON.stringify({
                data: top5,
                savedAt: Date.now()
            }));
            console.log('💾 Top5 محفوظة في الكاش');
        } catch (e) {
            console.warn('⚠️ فشل حفظ الكاش:', e);
        }
    },
    load() {
        try {
            const raw = localStorage.getItem(LEADERBOARD_CACHE_KEY);
            if (!raw) return null;
            const { data, savedAt } = JSON.parse(raw);
            if (Date.now() - savedAt > LEADERBOARD_CACHE_TTL) {
                console.log('⏰ كاش منتهي الصلاحية');
                return null;
            }
            console.log('✅ كاش Top5 صالح');
            return data ?? null;
        } catch {
            return null;
        }
    },
    invalidate() {
        localStorage.removeItem(LEADERBOARD_CACHE_KEY);
        console.log('🗑️ تم إبطال كاش Top5');
    }
};

// ─── إدارة الرقم القياسي الشخصي ────────────
export const PersonalRecord = {
    get() {
        return parseInt(localStorage.getItem('personal_best_score') || '0', 10);
    },
    update(newScore) {
        if (newScore > this.get()) {
            localStorage.setItem('personal_best_score', String(newScore));
            console.log(`🏆 رقم قياسي جديد: ${newScore}`);
            return true;
        }
        return false;
    },
    // تم إيقاف الرفع السحابي لأننا نعتمد على ملف JSON
    async syncToCloud(playerName, deviceId) {
        return Promise.resolve();
    }
};

// ─── دوال جلب النتائج ──────────────────────

// ✅ جلب النتائج من ملف JSON داخل المشروع (الذي تقوم بتحديثه يدوياً)
export async function fetchAllCloudScores() {
    try {
        // نضيف ?v=timestamp لكسر الكاش وجلب أحدث نسخة من الملف
        const response = await fetch(`./data/leaderboard.json?v=${Date.now()}`);
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        
        // ترتيب تنازلي حسب النتيجة
        return data.sort((a, b) => b.score - a.score);
    } catch (e) {
        console.error('❌ خطأ جلب النتائج من الملف:', e);
        return [];
    }
}

export async function fetchTop5(forceCloud = false) {
    if (!forceCloud) {
        const cached = LeaderboardCache.load();
        if (cached && cached.length > 0) {
            return { data: cached, fromCache: true };
        }
    }
    
    console.log('🌐 جلب Top5 من ملف المشروع...');
    const all = await fetchAllCloudScores();
    const top5 = all.slice(0, MAX_CLOUD_SCORES);
    
    if (top5.length) {
        LeaderboardCache.save(top5);
    }
    return { data: top5, fromCache: false };
}

// لم يعد هناك داعي لهذه الدالة لأننا نتحكم في حجم الملف يدوياً
export async function pruneCloudScores() {
    return Promise.resolve();
}

// ─── إرسال النتيجة الجديدة ──────────────────
export async function sendScoreToServer(playerName, playerScore, deviceId) {
    try {
        console.log('📤 إرسال النتيجة إلى Formspree...');
        
        const formData = new FormData();
        formData.append('Type', 'Game_Score');
        formData.append('Player_Name', playerName);
        formData.append('Score', playerScore);
        formData.append('Device_ID', deviceId);
        formData.append('Timestamp', new Date().toLocaleString('ar-EG'));

        // إرسال في الخلفية
        navigator.sendBeacon(FORMSPREE_URL, formData);
        console.log('✅ تم إرسال النتيجة بنجاح (ستظهر في Formspree لتحديث ملف JSON)');

        // لا نقوم بتحديث الكاش المحلي هنا عمداً
        // حتى تظل القائمة تعرض الـ Top 5 الحقيقيين من الملف،
        // وسيقوم الأدمن بتحديث الملف يدوياً إذا كانت النتيجة تستحق الدخول للقائمة.
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في الإرسال:', error);
        return false;
    }
}