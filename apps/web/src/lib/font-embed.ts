/**
 * Font embedding support: collects the font families a deck actually uses
 * and loads their TrueType binaries for embedding into the .pptx.
 *
 * The fonts are self-hosted static TTF instances under /public/fonts (the
 * same files the editor displays with via @font-face). PowerPoint's
 * embedded-font pipeline requires static TrueType fonts — variable fonts or
 * woff2 are silently ignored and PowerPoint falls back to a substitute.
 */
import { FONT_FAMILIES, fontDefinition, type FontFamilyKey } from "@/features/editor/fonts";
import type { Deck, SlideObject, TextContent } from "@/features/editor/types";

import { bytesToBase64 } from "./binary";

export interface EmbeddedFontData {
  /** OOXML typeface name (matches the `a:latin` typeface in text runs). */
  typeface: string;
  /** Raw TTF bytes (base64) for the regular / bold faces. */
  regularBase64: string;
  boldBase64: string;
}

const FONT_FILES: Record<FontFamilyKey, { regular: string; bold: string }> = {
  "noto-sans": {
    regular: "/fonts/NotoSansJP-Regular.ttf",
    bold: "/fonts/NotoSansJP-Bold.ttf",
  },
  "noto-serif": {
    regular: "/fonts/NotoSerifJP-Regular.ttf",
    bold: "/fonts/NotoSerifJP-Bold.ttf",
  },
};

/** Every non-default font family referenced by the deck's text objects. */
export function collectUsedFonts(deck: Deck): FontFamilyKey[] {
  const used = new Set<FontFamilyKey>();
  const visitText = (content: TextContent): void => {
    if (content.fontFamily) {
      used.add(content.fontFamily);
    }
    for (const style of content.charStyles ?? []) {
      if (style?.fontFamily) {
        used.add(style.fontFamily);
      }
    }
  };
  const visitObject = (object: SlideObject): void => {
    if (object.type === "shape" || object.type === "text") {
      visitText(object.text);
    } else if (object.type === "group") {
      object.children.forEach(visitObject);
    }
  };
  for (const slide of deck.slides) {
    slide.objects.forEach(visitObject);
  }
  return FONT_FAMILIES.map((definition) => definition.key).filter((key) => used.has(key));
}

const fontCache = new Map<string, Promise<string>>();

function fetchFontBase64(path: string): Promise<string> {
  let cached = fontCache.get(path);
  if (!cached) {
    cached = (async () => {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`フォントの読み込みに失敗しました (${path}: HTTP ${response.status})`);
      }
      return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
    })();
    // A failed load must not poison the cache.
    cached.catch(() => fontCache.delete(path));
    fontCache.set(path, cached);
  }
  return cached;
}

/** Loads the TTF data for every font the deck uses (browser only). */
export async function loadEmbeddedFonts(deck: Deck): Promise<EmbeddedFontData[]> {
  return Promise.all(
    collectUsedFonts(deck).map(async (key) => {
      const files = FONT_FILES[key];
      const [regularBase64, boldBase64] = await Promise.all([
        fetchFontBase64(files.regular),
        fetchFontBase64(files.bold),
      ]);
      return { typeface: fontDefinition(key)!.typeface, regularBase64, boldBase64 };
    }),
  );
}
