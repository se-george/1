// scripts/prepare-android.mjs
// بيتشغل بعد "npx cap add android": بيظبط رقم النسخة، ولون الخلفية، وأيقونة التطبيق (من image/0.webp).
//   VERSION      رقم النسخة الظاهر (مثال 1.0.3) — لازم يطابق اسم الـ Release (v1.0.3)
//   BUILD_NUMBER versionCode (لازم يزيد مع كل APK عشان التحديث فوق النسخة القديمة يشتغل)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(ROOT, 'android', 'app', 'build.gradle');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const ICON_SRC = join(ROOT, 'image', '0.webp');

const version = (process.env.VERSION || '1.0.0').replace(/^v/i, '').trim();
const buildNumber = parseInt(process.env.BUILD_NUMBER || '1', 10) || 1;
if (!/^\d+(\.\d+){0,2}$/.test(version)) {
  console.error(`❌ رقم النسخة لازم يكون زي 1.0.3 (جاتلي "${version}")`);
  process.exit(1);
}

// ---- 1) رقم النسخة (إجباري: لو فشل نوقف البناء بدل ما ننتج APK بنسخة غلط)
if (!existsSync(GRADLE)) { console.error(`❌ مش لاقي ${GRADLE} — شغّل "npx cap add android" الأول`); process.exit(1); }
let gradle = readFileSync(GRADLE, 'utf8');
const before = gradle;
// بيدعم الشكلين: versionCode 1  /  versionCode = 1
gradle = gradle.replace(/(versionCode\s*=?\s*)\d+/, `$1${buildNumber}`)
               .replace(/(versionName\s*=?\s*)"[^"]*"/, `$1"${version}"`);
if (!new RegExp(`versionCode\\s*=?\\s*${buildNumber}\\b`).test(gradle) ||
    !new RegExp(`versionName\\s*=?\\s*"${version.replace(/\./g, '\\.')}"`).test(gradle)) {
  console.error('❌ معرفتش أظبط versionCode/versionName في build.gradle (شكل الملف اتغير؟)');
  process.exit(1);
}
if (gradle !== before) writeFileSync(GRADLE, gradle);
console.log(`✅ version ${version} (code ${buildNumber})`);

// ---- 2) الأيقونة (اختياري: لو فشل بنكمل بالأيقونة الافتراضية)
try {
  if (!existsSync(ICON_SRC)) throw new Error('image/0.webp مش موجود');
  const sharp = (await import('sharp')).default;

  const BG = { r: 0, g: 0, b: 0, alpha: 1 };
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };   // حجم الأيقونة بالـ px
  for (const [name, size] of Object.entries(densities)) {
    const dir = join(RES, `mipmap-${name}`);
    mkdirSync(dir, { recursive: true });

    // أيقونة مربعة (أندرويد القديم) + دايرية
    await sharp(ICON_SRC).resize(size, size, { fit: 'cover' }).png().toFile(join(dir, 'ic_launcher.png'));
    const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
    await sharp(ICON_SRC).resize(size, size, { fit: 'cover' }).composite([{ input: circle, blend: 'dest-in' }])
      .png().toFile(join(dir, 'ic_launcher_round.png'));

    // Adaptive icon: لوحة 108dp والصورة جوه المنطقة الآمنة (66%) عشان الحواف ما تتقصّش
    const canvas = Math.round(size * 108 / 48);
    const inner = Math.round(canvas * 0.66);
    const pad = Math.floor((canvas - inner) / 2);
    await sharp(ICON_SRC).resize(inner, inner, { fit: 'cover' })
      .extend({ top: pad, bottom: canvas - inner - pad, left: pad, right: canvas - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png().toFile(join(dir, 'ic_launcher_foreground.png'));
  }
  mkdirSync(join(RES, 'values'), { recursive: true });
  writeFileSync(join(RES, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`);
  console.log('✅ الأيقونة اتظبطت من image/0.webp');
} catch (err) {
  console.warn(`⚠️ تخطيت الأيقونة (${err.message}) — هتظهر الأيقونة الافتراضية`);
}

// ---- 3) الزوم بالأصابع جوه الـ WebView (android.zoomEnabled — Capacitor 6+)
//      من غيره الـ WebView بيتجاهل الـ pinch حتى لو الـ viewport meta بيسمح بالزوم.
//      بنكتبه في capacitor.config.json وفي نسخته اللي جوه مشروع أندرويد (لو اتعمل sync قبل كده)،
//      فيشتغل أيًا كان ترتيب الخطوات في الـ workflow. اختياري: لو فشل بنكمل والـ APK يتبني من غير زوم.
try {
  const configs = [
    join(ROOT, 'capacitor.config.json'),
    join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'capacitor.config.json')
  ];
  let found = 0;
  for (const file of configs) {
    if (!existsSync(file)) continue;
    found++;
    const cfg = JSON.parse(readFileSync(file, 'utf8'));
    if (cfg.android && cfg.android.zoomEnabled === true) continue;
    cfg.android = { ...(cfg.android || {}), zoomEnabled: true };
    writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  }
  if (!found) throw new Error('capacitor.config.json مش موجود');
  console.log('✅ الزوم بالأصابع مفعّل (android.zoomEnabled)');
} catch (err) {
  console.warn(`⚠️ معرفتش أفعّل الزوم بالأصابع (${err.message})`);
}
