// ============================================
// leaderboard-ui.js - دوال عرض القوائم وتحديث الواجهة
// ============================================

import { fetchTop5, LeaderboardCache, PersonalRecord } from './leaderboard-core.js';
import { escapeHTML } from '../core/utils.js';

// عرض قائمة Top5 في عنصر HTML (يستخدم في overlay)
export function renderLeaderboard(listEl, top5, currentDeviceId) {
    if (!listEl) return;
    if (!top5.length) {
        listEl.innerHTML = `<li class="leaderboard-item">
            <span class="leaderboard-rank">-</span>
            <span class="leaderboard-name">لا توجد نتائج بعد</span>
            <span class="leaderboard-score">-</span>
        </li>`;
        return;
    }
    listEl.innerHTML = top5.map((e, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] ?? '';
        const topClass = i < 3 ? `top${i + 1}` : '';
        const cur = e.device_id === currentDeviceId ? 'current-player' : '';
        return `<li class="leaderboard-item ${topClass} ${cur}">
            <span class="leaderboard-rank">${medal} #${i + 1}</span>
            <span class="leaderboard-name">${escapeHTML(e.name)}</span>
            <span class="leaderboard-score">${escapeHTML(e.score)} ⭐</span>
        </li>`;
    }).join('');
}

// عرض القائمة الحية تحت اللعبة مع حالة التحديث
export function renderLiveLeaderboard(listEl, top5, currentDeviceId, fromCache = false, statusEl = null) {
    if (!listEl) return;
    if (!top5.length) {
        listEl.innerHTML = `<li class="live-lb-empty">لا توجد نتائج بعد 🎮</li>`;
        if (statusEl) {
            statusEl.textContent = 'فارغ';
            statusEl.className = 'live-lb-status';
        }
        return;
    }
    const EMOJIS = ['🥇', '🥈', '🥉', '#4', '#5'];
    listEl.innerHTML = top5.map((e, i) => {
        const rankClass = i < 3 ? `lb-rank-${i + 1}` : '';
        const cur = e.device_id === currentDeviceId ? 'lb-current' : '';
        return `<li class="live-lb-item ${rankClass} ${cur}" style="animation-delay:${i * 60}ms">
            <span class="live-lb-rank">${EMOJIS[i]}</span>
            <span class="live-lb-name">${escapeHTML(e.name)}</span>
            <span class="live-lb-score">${escapeHTML(e.score)} ⭐</span>
        </li>`;
    }).join('');
    if (statusEl) {
        statusEl.textContent = fromCache ? '📦 من الكاش' : '☁️ مُحدَّثة';
        statusEl.className = 'live-lb-status loaded';
    }
}

// تحميل القائمة الحية (مرحلتان: كاش فوري ثم سحابة)
export async function loadLiveLeaderboard(listEl, currentDeviceId, statusEl = null) {
    const cached = LeaderboardCache.load();
    if (cached) {
        renderLiveLeaderboard(listEl, cached, currentDeviceId, true, statusEl);
    } else if (statusEl) {
        statusEl.textContent = '⏳ جاري التحميل...';
        statusEl.className = 'live-lb-status';
    }

    try {
        const { data, fromCache } = await fetchTop5(!!cached);
        renderLiveLeaderboard(listEl, data, currentDeviceId, fromCache, statusEl);
    } catch {
        if (statusEl) {
            statusEl.textContent = '❌ خطأ';
            statusEl.className = 'live-lb-status error';
        }
    }
}

// تحديث عرض الرقم القياسي في الواجهة
export function refreshPersonalRecordUI(elementId = 'personalRecordValue') {
    const el = document.getElementById(elementId);
    if (el) el.textContent = PersonalRecord.get();
}