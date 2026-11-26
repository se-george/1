// scripts/prepare-www.mjs
// بيجهّز مجلد www/ (اللي Capacitor بيحطه جوه الـ APK) من ملفات الموقع، وبيظبط capacitor.config.json.
//
// متغيرات بيئة اختيارية:
//   MODE=live      (الافتراضي) التطبيق بيفتح الموقع المنشور مباشرة → أي تحديث على الموقع بيوصل فورًا.
//                  ملفات www/ بتفضل جوه الـ APK كاحتياطي لصفحة "مفيش إنترنت" بس.
//   MODE=bundled   ملفات الموقع جوه الـ APK نفسه (بيشتغل من أول مرة من غير نت)، لكن أي تغيير في الكود
//                  أو في groups-data.js محتاج APK جديد.
//   APP_URL=...    رابط الموقع المنشور لو مختلف عن اللي في capacitor.config.json
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const CONFIG = join(ROOT, 'capacitor.config.json');

const FILES = ['index.html', 'style.css', 'script.js', 'tracker.js', 'sw.js'];   // manifest.json اتشال (مفيش PWA، التثبيت بالـ APK)
const DIRS = ['javascript', 'image'];

const mode = (process.env.MODE || 'live').trim().toLowerCase();
if (!['live', 'bundled'].includes(mode)) {
  console.error(`❌ MODE لازم يكون live أو bundled (جاتلي "${mode}")`);
  process.exit(1);
}

// 1) نسخ ملفات الموقع
rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
for (const f of FILES) {
  if (!existsSync(join(ROOT, f))) { console.error(`❌ ملف ناقص: ${f}`); process.exit(1); }
  cpSync(join(ROOT, f), join(WWW, f));
}
for (const d of DIRS) {
  if (!existsSync(join(ROOT, d))) { console.error(`❌ مجلد ناقص: ${d}`); process.exit(1); }
  cpSync(join(ROOT, d), join(WWW, d), { recursive: true });
}

// 2) صفحة "مفيش اتصال" (server.errorPath) — بتظهر لو الموقع ما فتحش (أول تشغيل من غير نت)
writeFileSync(join(WWW, 'offline.html'), `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مفيش اتصال</title>
<style>
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
       background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px}
  button{font-size:18px;font-weight:700;padding:12px 28px;border:0;border-radius:10px;background:#ffca28;color:#000}
</style>
</head>
<body>
  <h2>📡 مفيش اتصال بالإنترنت</h2>
  <p>أول تشغيل للتطبيق محتاج إنترنت. بعد كده بيشتغل أوفلاين.</p>
  <button onclick="location.href='/'">إعادة المحاولة</button>
</body>
</html>
`);

// 3) ظبط capacitor.config.json حسب الوضع
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
if (mode === 'bundled') {
  delete config.server;
} else {
  config.server = { ...(config.server || {}) };
  if (process.env.APP_URL) config.server.url = process.env.APP_URL.trim();
  if (!config.server.url) { console.error('❌ مفيش server.url — حطه في capacitor.config.json أو عدّل APP_URL'); process.exit(1); }
  if (!config.server.errorPath) config.server.errorPath = 'offline.html';
}
writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');

console.log(`✅ www/ جاهز (MODE=${mode}${config.server ? ` — ${config.server.url}` : ''})`);
