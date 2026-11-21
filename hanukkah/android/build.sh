#!/usr/bin/env bash
# בונה את קובץ ה-APK של "עולם החנוכה" מתוך קבצי האתר (בלי Gradle).
# דרישות (אובונטו): apt-get install android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign
# שימוש: ./build.sh            -> dist/hanukkah-kids.apk
# חתימה: משתנה KEYSTORE (ברירת מחדל: android/release.keystore, נוצר אוטומטית אם חסר)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB="$(cd "$HERE/.." && pwd)"
SDK=/usr/lib/android-sdk
JAR="$SDK/platforms/android-23/android.jar"
OUT="$HERE/build"
DIST="$WEB/dist"
KEYSTORE="${KEYSTORE:-$HERE/release.keystore}"
KS_PASS="${KS_PASS:-hanukkah}"
FONTS="${FONTS_DIR:-$HERE/fonts}"

rm -rf "$OUT"; mkdir -p "$OUT/assets/www" "$OUT/res" "$OUT/classes" "$DIST"

# 1) קבצי האפליקציה
cp -r "$WEB/css" "$WEB/js" "$WEB/icons" "$OUT/assets/www/"
mkdir -p "$OUT/assets/www/fonts"
cp "$FONTS"/*.woff2 "$OUT/assets/www/fonts/"
cat > "$OUT/assets/www/css/fonts.css" <<'CSS'
@font-face { font-family: 'Fredoka'; font-weight: 400; font-display: swap; src: url(../fonts/fredoka-hebrew-400-normal.woff2) format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Fredoka'; font-weight: 500 600; font-display: swap; src: url(../fonts/fredoka-hebrew-500-normal.woff2) format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Fredoka'; font-weight: 700; font-display: swap; src: url(../fonts/fredoka-hebrew-700-normal.woff2) format('woff2'); unicode-range: U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; }
@font-face { font-family: 'Fredoka'; font-weight: 400 600; font-display: swap; src: url(../fonts/fredoka-latin-400-normal.woff2) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: 'Fredoka'; font-weight: 700; font-display: swap; src: url(../fonts/fredoka-latin-700-normal.woff2) format('woff2'); unicode-range: U+0000-00FF; }
@font-face { font-family: 'Frank Ruhl Libre'; font-weight: 400 500; font-display: swap; src: url(../fonts/frank-ruhl-libre-hebrew-500-normal.woff2) format('woff2'); }
@font-face { font-family: 'Frank Ruhl Libre'; font-weight: 700; font-display: swap; src: url(../fonts/frank-ruhl-libre-hebrew-700-normal.woff2) format('woff2'); }
CSS
# index.html בלי תלות באינטרנט: גופנים מקומיים, בלי manifest/service worker
python3 - "$WEB/index.html" "$OUT/assets/www/index.html" <<'PY'
import re, sys
s = open(sys.argv[1], encoding='utf-8').read()
s = re.sub(r'\s*<link rel="preconnect"[^>]*>', '', s)
s = re.sub(r'\s*<link href="https://fonts.googleapis.com[^>]*>', '\n<link rel="stylesheet" href="css/fonts.css">', s)
s = re.sub(r'\s*<link rel="manifest"[^>]*>', '', s)
open(sys.argv[2], 'w', encoding='utf-8').write(s)
PY

# 2) אייקונים
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  mkdir -p "$OUT/res/mipmap-${d%%:*}"
done
cp -r "$HERE/res/"* "$OUT/res/"
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do cp "$WEB/icons/icon-192.png" "$OUT/res/mipmap-$d/ic_launcher.png"; done
cp "$WEB/icons/icon-512.png" "$OUT/res/mipmap-xxxhdpi/ic_launcher.png"

# 3) משאבים + מניפסט
aapt package -f -M "$HERE/AndroidManifest.xml" -S "$OUT/res" -A "$OUT/assets" -I "$JAR" -F "$OUT/unsigned.apk" --min-sdk-version 21 --target-sdk-version 34

# 4) קוד Java -> dex
javac -nowarn -Xlint:-options --release 8 -classpath "$JAR" -d "$OUT/classes" $(find "$HERE/src" -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add unsigned.apk classes.dex >/dev/null)

# 5) יישור וחתימה
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias hanukkah \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Hanukkah Kids, O=Hanukkah Kids, C=IL" 2>&1 | grep -v "^Picked up" || true
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias hanukkah --out "$DIST/hanukkah-kids.apk" "$OUT/aligned.apk"
apksigner verify "$DIST/hanukkah-kids.apk"
echo "APK: $DIST/hanukkah-kids.apk ($(du -h "$DIST/hanukkah-kids.apk" | cut -f1))"
