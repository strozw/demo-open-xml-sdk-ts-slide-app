export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

export type TextHAlign = "left" | "center" | "right" | "justify";
export type TextVAlign = "top" | "center" | "bottom";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseObject extends Rect {
  id: string;
  name: string;
}

export type ShapeKind =
  | "rect"
  | "roundRect"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "rightArrow"
  | "star5"
  | "hexagon";

/**
 * Per-character style override; absent fields inherit the TextContent base
 * values. Applied via the in-place editor's selection.
 *
 * `fontFamily: null` explicitly forces the theme-default font even when the
 * base `fontFamily` is set (the importer needs this to faithfully restore
 * mixed default/non-default runs); a missing key inherits the base.
 */
export interface CharStyle {
  fontFamily?: import("./fonts").FontFamilyKey | null;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface TextContent {
  text: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: TextHAlign;
  verticalAlign: TextVAlign;
  /** Base font family for the whole text; undefined = 既定 (theme font). */
  fontFamily?: import("./fonts").FontFamilyKey;
  /**
   * Per-character style overrides, aligned index-by-index with `text`
   * (null = no override). Kept in sync across edits by `remapCharStyles`.
   */
  charStyles?: (CharStyle | null)[];
}

export interface ShapeObject extends BaseObject {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  outlineColor: string;
  outlineWidth: number;
  text: TextContent;
}

export interface TextObject extends BaseObject {
  type: "text";
  text: TextContent;
}

export type ChartKind =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "scatter"
  | "radar"
  | "bubble"
  | "stock"
  | "surface";

export interface ChartSeries {
  id: string;
  name: string;
  /** Y values (or the single value list for category charts). */
  values: number[];
  /** Bubble charts only: X coordinate per point. */
  xValues?: number[];
  /** Bubble charts only: bubble size per point. */
  bubbleSizes?: number[];
}

export interface ChartObject extends BaseObject {
  type: "chart";
  chartType: ChartKind;
  title: string;
  categories: string[];
  series: ChartSeries[];
  showLegend: boolean;
  /**
   * PowerPoint chart style 1-48 (`c:style`), the only color control the
   * exporter serializes: (style-1)%8 picks the color column
   * (grays / multi-accent / accent1-6), undefined leaves it to PowerPoint.
   */
  style?: number;
  /**
   * Export as a rasterized PNG picture (`p:pic`) instead of a native chart
   * part. The editor model JSON rides along as re-edit metadata (extLst on
   * the picture + iTXt chunk in the PNG), so the app can restore an
   * editable chart when the file is opened again.
   */
  exportAsImage?: boolean;
}

/**
 * Group children keep absolute slide coordinates (not group-relative ones).
 * The exporter writes the group frame's chOff/chExt equal to its
 * offset/extent, so exported child coordinates stay absolute too — keeping
 * the editor model absolute makes export a 1:1 mapping.
 *
 * Groups can nest: children may themselves be groups. A group's own frame is
 * always the bounding box of its children (the store re-derives it after
 * every structural change).
 */
export interface GroupObject extends BaseObject {
  type: "group";
  children: SlideObject[];
}

export type LeafObject = ShapeObject | TextObject | ChartObject;
export type SlideObject = LeafObject | GroupObject;

export interface Slide {
  id: string;
  background: string;
  objects: SlideObject[];
}

export interface Deck {
  title: string;
  slides: Slide[];
}

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function createTextContent(overrides: Partial<TextContent> = {}): TextContent {
  return {
    text: "",
    fontSize: 18,
    bold: false,
    italic: false,
    color: "#1a1a2e",
    align: "center",
    verticalAlign: "center",
    ...overrides,
  };
}

export function createSlide(): Slide {
  return { id: createId("slide"), background: "#ffffff", objects: [] };
}

export function createDeck(): Deck {
  return { title: "Untitled presentation", slides: [createSlide()] };
}
