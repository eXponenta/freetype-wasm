#!/bin/bash

set -e

if [ -z ${EMSDK+x} ]; then
    source "./emsdk/emsdk_env.sh"
fi

if [ ! -d "./dist" ]; then
    mkdir dist
fi

emcc src/ft.cpp \
    "$EMSDK/upstream/emscripten/cache/sysroot/lib/libfreetype.a" \
    "$EMSDK/upstream/emscripten/cache/sysroot/lib/libbrotlidec.a" \
    "$EMSDK/upstream/emscripten/cache/sysroot/lib/libbrotlicommon.a" \
    -iwithsysroot/include/freetype2 \
    -O3 -msimd128 \
    -lembind \
    -s EXPORT_ES6=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=FreeType \
    -o dist/freetype.js

# Prepend texts to the built file
printf '%s\n/*!\n%s\n%s\n\n%s\n%s\n\n%s\n%s\n*/\n%s\n' \
    "/// <reference types=\"./freetype.d.ts\" />" \
    "Freetype WASM library MIT license:" \
    "https://github.com/Ciantic/freetype-wasm" \
    "Uses Freetype, see licensing options from:" \
    "https://github.com/freetype/freetype/blob/master/LICENSE.TXT" \
    "Uses Brotli for WOFF2 fonts, MIT license:" \
    "https://github.com/google/brotli/blob/master/LICENSE" \
    "$(cat dist/freetype.js)" \
    > dist/freetype.js

# Deno does not like XMLHttpRequest, and emscripten uses old school XHR
# Following trick replaces the required one with `fetch`
sed -i 's|\(readAsync\s*=\s*(url,\s*onload,\s*onerror)\s*=>\s*{\)|\1fetch(url).then(async response => { onload(await response.arrayBuffer());}).catch(onerror); return;|g' dist/freetype.js

echo "✅ Build finished"

./test.sh

