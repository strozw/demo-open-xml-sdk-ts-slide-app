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

/** Raster image placed on a slide (PNG / JPEG / GIF). */
export interface ImageObject extends BaseObject {
  type: "image";
  mimeType: "image/png" | "image/jpeg" | "image/gif";
  /** Raw image bytes, base64-encoded (no `data:` prefix). */
  dataBase64: string;
}

export type ConnectorKind = "straight" | "bent";

/** Cardinal connection sites shared by every shape (bounding-box midpoints). */
export type ConnectionSite = "top" | "right" | "bottom" | "left";

export interface ConnectorEndpoint {
  /**
   * Id of the connected shape / text box (may live inside a group).
   * Omitted for a free-floating endpoint that is not attached to any object.
   */
  objectId?: string;
  /** Connection site (attached endpoints) / routing direction hint (free). */
  site: ConnectionSite;
  /** Fixed slide position for a free endpoint (ignored when attached). */
  point?: { x: number; y: number };
}

/**
 * Connector between two objects. Its geometry is DERIVED: the store
 * recomputes `startPoint` / `endPoint` (absolute px, from the connected
 * objects' bounds) and the own frame (bounding box of the two points) after
 * every change, so connectors follow their endpoints. Connectors always
 * live at the top level of a slide (never inside groups).
 */
export interface ConnectorObject extends BaseObject {
  type: "connector";
  connectorType: ConnectorKind;
  start: ConnectorEndpoint;
  end: ConnectorEndpoint;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  lineColor: string;
  /** Line width in px (1px = 9525 EMU on export). */
  lineWidth: number;
  /** Draw an arrowhead at the end point (`a:tailEnd`). */
  arrowEnd: boolean;
  /**
   * Bent connectors only: position of the primary mid-line (0..1, default
   * 0.5). The number of corners is derived from geometry, not this value.
   * Editor-only refinement — not persisted through OOXML.
   */
  bend?: number;
  /**
   * Bent connectors only: length (px) the line leads out of the start / end
   * port before its first / last turn (default 16). Editor-only refinement.
   */
  startLead?: number;
  endLead?: number;
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

export type LeafObject = ShapeObject | TextObject | ChartObject | ImageObject;
export type SlideObject = LeafObject | GroupObject | ConnectorObject;

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
