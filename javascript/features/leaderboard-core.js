// ============================================
// leaderboard-core.js - إدارة القائمة والرقم القياسي
// ============================================

import { FORMSPREE_URL } from '../core/config.js';
import { getPlayerName, getDeviceId } from '../core/utils.js';

export const LEADERBOARD_CACHE_KEY = 'leaderboard_top5_cache';
export const LEADERBOARD_CACHE_TTL = 5 * 60 * 1000;   
export const MAX_CLOUD_SCORES      = 5;

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
    async syncToCloud(playerName, deviceId) {
        return Promise.resolve();
    }
};

export async function fetchAllCloudScores() {
    try {
        // ✅ إجبار المتصفح على تجاهل الكاش تماماً وطلب الملف من السيرفر مباشرة
        const response = await fetch(`./data/leaderboard.json?v=${Date.now()}`, { 
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) return [];
        
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        
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

export async function pruneCloudScores() {
    return Promise.resolve();
}

export async function sendScoreToServer(playerName, playerScore, deviceId) {
    try {
        console.log('📤 إرسال النتيجة إلى Formspree...');
        
        const formData = new FormData();
        formData.append('Type', 'Game_Score');
        formData.append('Player_Name', playerName);
        formData.append('Score', playerScore);
        formData.append('Device_ID', deviceId);
        formData.append('Timestamp', new Date().toLocaleString('ar-EG'));

        navigator.sendBeacon(FORMSPREE_URL, formData);
        console.log('✅ تم إرسال النتيجة بنجاح (ستظهر في Formspree لتحديث ملف JSON)');
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في الإرسال:', error);
        return false;
    }
}