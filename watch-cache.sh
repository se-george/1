#!/bin/bash

REPO_DIR="/storage/emulated/0/Download/CS26"
JS_FILE="$REPO_DIR/sw.js"
STATE_FILE="$REPO_DIR/.last_cache_version"

cd "$REPO_DIR" || exit

# سطر تعريف الإصدار بس (const CACHE_NAME = ...). الـ grep القديم كان بيمسك كل سطر فيه كلمة CACHE_NAME
# (لوجات وتعليقات)، فأي تعديل فيها كان بيعمل git pull.
current_version=$(grep -m1 '^const CACHE_NAME =' "$JS_FILE")

if [ -z "$current_version" ]; then
    echo "Could not find the 'const CACHE_NAME' line in $JS_FILE"
    exit 1
fi

if [ -f "$STATE_FILE" ]; then
    last_version=$(cat "$STATE_FILE")
else
    last_version=""
fi

if [ "$current_version" != "$last_version" ]; then
    echo "Detected cache version change! Updating..."
    # بنسجّل الإصدار بعد نجاح الـ pull بس — لو فشل (مفيش نت مثلًا) بيحاول تاني في التشغيلة الجاية
    if git pull; then
        echo "$current_version" > "$STATE_FILE"
    else
        echo "git pull failed - will retry on next run"
        exit 1
    fi
fi
