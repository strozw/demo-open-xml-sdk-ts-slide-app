import type { CharStyle, TextContent } from "./types";

/**
 * Selectable font families. `undefined` everywhere means "既定" (the app's
 * default sans stack in the editor, PowerPoint's theme font on export).
 */
export type FontFamilyKey = "noto-sans" | "noto-serif";

export interface FontFamilyDefinition {
  key: FontFamilyKey;
  label: string;
  /** CSS font-family stack used on the canvas. */
  css: string;
  /** OOXML typeface name written to `a:latin` / `a:ea`. */
  typeface: string;
}

export const FONT_FAMILIES: readonly FontFamilyDefinition[] = [
  {
    key: "noto-sans",
    label: "Noto Sans JP",
    css: "'Noto Sans JP', sans-serif",
    typeface: "Noto Sans JP",
  },
  {
    key: "noto-serif",
    label: "Noto Serif JP",
    css: "'Noto Serif JP', serif",
    typeface: "Noto Serif JP",
  },
];

export function fontDefinition(key: FontFamilyKey | undefined): FontFamilyDefinition | undefined {
  return FONT_FAMILIES.find((definition) => definition.key === key);
}

export function fontKeyFromTypeface(typeface: string | undefined): FontFamilyKey | undefined {
  return FONT_FAMILIES.find((definition) => definition.typeface === typeface)?.key;
}

/** Fully resolved (base + per-character override) style of one character. */
export interface ResolvedCharStyle {
  fontFamily: FontFamilyKey | undefined;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export function resolveCharStyle(content: TextContent, index: number): ResolvedCharStyle {
  const override = content.charStyles?.[index];
  return {
    // fontFamily: null is an explicit "theme default", a missing key
    // inherits the base family.
    fontFamily:
      override && "fontFamily" in override
        ? (override.fontFamily ?? undefined)
        : content.fontFamily,
    fontSize: override?.fontSize ?? content.fontSize,
    color: override?.color ?? content.color,
    bold: override?.bold ?? content.bold,
    italic: override?.italic ?? content.italic,
  };
}

function sameStyle(a: ResolvedCharStyle, b: ResolvedCharStyle): boolean {
  return (
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic
  );
}

export interface StyleSegment {
  text: string;
  style: ResolvedCharStyle;
}

/**
 * Splits a slice of the text (e.g. one paragraph line) into consecutive
 * same-style segments. `offset` is the line's start index within the full
 * text, so per-character overrides line up across line breaks.
 */
export function segmentByStyle(content: TextContent, line: string, offset: number): StyleSegment[] {
  const segments: StyleSegment[] = [];
  for (let index = 0; index < line.length; index += 1) {
    const style = resolveCharStyle(content, offset + index);
    const last = segments.at(-1);
    if (last && sameStyle(last.style, style)) {
      last.text += line[index]!;
    } else {
      segments.push({ text: line[index]!, style });
    }
  }
  return segments.length > 0
    ? segments
    : [{ text: line, style: resolveCharStyle(content, offset) }];
}

/**
 * Carries per-character style overrides across a text edit by matching the
 * unchanged common prefix and suffix (covers typical insertions/deletions;
 * edits inside a replaced middle section lose their overrides).
 */
export function remapCharStyles(
  previousText: string,
  nextText: string,
  charStyles: readonly (CharStyle | null)[] | undefined,
): (CharStyle | null)[] | undefined {
  if (!charStyles || charStyles.length === 0) {
    return undefined;
  }
  let prefix = 0;
  while (
    prefix < previousText.length &&
    prefix < nextText.length &&
    previousText[prefix] === nextText[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < previousText.length - prefix &&
    suffix < nextText.length - prefix &&
    previousText[previousText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const next: (CharStyle | null)[] = Array.from({ length: nextText.length }, () => null);
  for (let index = 0; index < prefix; index += 1) {
    next[index] = charStyles[index] ?? null;
  }
  for (let index = 0; index < suffix; index += 1) {
    next[nextText.length - 1 - index] = charStyles[previousText.length - 1 - index] ?? null;
  }
  return next.some((style) => style !== null) ? next : undefined;
}
