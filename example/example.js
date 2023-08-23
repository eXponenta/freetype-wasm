// @ts-check
import FreetypeInit from "../dist/freetype.js";
const Freetype = await FreetypeInit();

const text_input = document.querySelector("#input")
const size_input = document.querySelector("#size")
const sdf_input = document.querySelector("#sdf")
const render_button = document.querySelector("#render")
const render_time = document.querySelector("#render-time")
/**
 * @typedef {Object} DrawCacheEntry
 * @property {import("../dist/freetype.js").FT_GlyphSlotRec} glyph
 * @property {ImageBitmap|null} bitmap
 *
 * @typedef {Map<string, DrawCacheEntry>} DrawCache
 */

/**
 * Create from URL
 *
 * @param {*} url
 * @returns {Promise<import("../dist/freetype.js").FT_FaceRec[]>}
 */
async function createFontFromUrl(url) {
    const font = await fetch(url);
    const buffer = await font.arrayBuffer();
    const face = Freetype.LoadFontFromBytes(new Uint8Array(buffer));
    return face;
}

/**
 * Create from Google fonts
 *
 * @param {string} fontName
 * @param {number} index
 * @returns {Promise<import("../dist/freetype.js").FT_FaceRec[]>}
 */
async function createGoogleFont(fontName, index = 0) {
    const url = `https://fonts.googleapis.com/css?family=${fontName}`;
    const css = await fetch(url);
    const text = await css.text();
    const urls = [...text.matchAll(/url\(([^\(\)]+)\)/g)].map((m) => m[1]);
    return await createFontFromUrl(urls[index]);
}

/**
 * Update glyph and bitmap caches
 *
 * @param {string} str
 * @param {DrawCache} cache
 * @param {boolean} use_sdf
 */
async function updateCache(str, cache, use_sdf) {
    // Get char codes without bitmaps
    const codes = [];
    for (const char of new Set(str)) {
        const point = char.codePointAt(0);
        if (char !=="\n" && !cache.has(char) && point !== undefined) {
            codes.push(point);
        }
    }

    const newGlyphs = Freetype.LoadGlyphs(codes, Freetype.FT_LOAD_RENDER, !!use_sdf);

    for (const [code, glyph] of newGlyphs) {
        const char = String.fromCodePoint(code);
        cache.set(char, {
            glyph,
            bitmap: glyph.bitmap.imagedata
                ? await createImageBitmap(glyph.bitmap.imagedata)
                : null,
        });
    }

    // TODO: Is awaiting with Promise.all faster? Is GPU uploading parallelizable?
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} str
 * @param {number} offsetx
 * @param {number} offsety
 * @param {DrawCache} cache
 */
export async function write(ctx, str, offsetx_, offsety_, cache, use_sdf) {
    await updateCache(str, cache, use_sdf);
    let offsetx = offsetx_
    let offsety = offsety_
    let prev = null;

    for (const char of str) {
        const { glyph, bitmap } = cache.get(char) || {};

        if (char == "\n") {
            offsetx = offsetx_
            offsety += line_height
            continue
        }

        if (glyph) {
            // Kerning
            if (prev) {
                const kerning = Freetype.GetKerning(
                    prev.glyph_index,
                    glyph.glyph_index,
                    0
                );
                offsetx += kerning.x >> 6;
            }

            

            if (bitmap) {
                ctx.drawImage(
                    bitmap,
                    offsetx + glyph.bitmap_left,
                    offsety - glyph.bitmap_top
                );
            }

            offsetx += glyph.advance.x >> 6;
            prev = glyph;
        }
    }
}

// Create pixel perfect canvas
const canvas = document.querySelector("canvas");
const ctx = canvas?.getContext("2d");
if (!canvas || !ctx) {
    throw new Error("No canvas or context found");
}
canvas.width = canvas.clientWidth * window.devicePixelRatio;
canvas.height = canvas.clientHeight * window.devicePixelRatio;

const font_tname = "Permanent Marker"
await createGoogleFont(font_tname, 0);
const font = Freetype.SetFont(font_tname, "Regular");
const cmap = Freetype.SetCharmap(Freetype.FT_ENCODING_UNICODE);
const cache = new Map();

let line_height = 0

if (!cmap) {
    console.assert(false, "Unicode charmap is not found");
}

console.log("Font", font);
console.log("Charmap", cmap);

let was_sdf = false
let last_size = 0

function setSize() {
    const ref_size = Number.parseInt(size_input.value)
    const size = Freetype.SetPixelSize(0, ref_size * window.devicePixelRatio);
    
    line_height = size.height >> 6;

    if (ref_size !== last_size) {
        cache.clear()
    }

    console.log("Size", size);
}

async function render() {
    ctx?.clearRect(0, 0, canvas?.width, canvas?.height);

    const use_sdf = !!sdf_input.checked;
    const text = text_input.value;

    setSize()

    if (was_sdf !== use_sdf || size !== last_size) {
        cache.clear();
    }

    was_sdf = use_sdf

    const start = performance.now()

    await write(ctx, text , 10, line_height, cache, use_sdf);

    const end = performance.now()

    if (render_time) {
        render_time.textContent = `${(end-start).toFixed(2)}ms`
    }
}

render_button?.addEventListener('click', render)

render()

// NOTE: When changing font or size the cache must be cleared

// Freetype.UnloadFont("OSP-DIN");
// Freetype.Cleanup();
