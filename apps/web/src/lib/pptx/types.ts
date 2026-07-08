/**
 * Declarative document model consumed by the openxmlsdkts-based PPTX
 * generator. All geometry is expressed in EMU (English Metric Units,
 * 914400 per inch); use `pxToEmu` to convert from canvas pixels.
 */

export const EMU_PER_PX = 9525; // 96 dpi
export const SLIDE_CX = 12192000; // 16:9
export const SLIDE_CY = 6858000;

export function pxToEmu(px: number): number {
  return Math.round(px) * EMU_PER_PX;
}

/** Absolute frame on the slide, in EMU. */
export interface FrameEmu {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

/** OOXML paragraph alignment (`a:pPr@algn`). */
export type ParagraphAlign = "l" | "ctr" | "r" | "just";
/** OOXML text-body anchor (`a:bodyPr@anchor`). */
export type BodyAnchor = "t" | "ctr" | "b";

export interface TextRunDoc {
  text: string;
  /** Font size in points (`a:rPr@sz` = pt × 100). */
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  /** RRGGBB (no `#`). */
  color?: string;
}

export interface ParagraphDoc {
  align?: ParagraphAlign;
  runs: TextRunDoc[];
}

export interface TextBodyDoc {
  anchor?: BodyAnchor;
  paragraphs: ParagraphDoc[];
}

export interface ShapeDoc {
  type: "shape";
  name: string;
  frame: FrameEmu;
  /** DrawingML preset geometry (`a:prstGeom@prst`), e.g. "roundRect". */
  geometry: string;
  /** RRGGBB solid fill, or undefined for `a:noFill` (text boxes). */
  fill?: string;
  outline?: { widthEmu: number; color: string };
  /** Marks the shape as a text box (`p:cNvSpPr@txBox`). */
  textBox?: boolean;
  textBody?: TextBodyDoc;
}

export type ChartType =
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

export interface ChartSeriesDoc {
  name: string;
  values: number[];
  /** Bubble charts only: X coordinate per point. */
  xValues?: number[];
  /** Bubble charts only: bubble size per point. */
  bubbleSizes?: number[];
}

export interface ChartDoc {
  type: "chart";
  name: string;
  frame: FrameEmu;
  chartType: ChartType;
  title?: string;
  categories: string[];
  series: ChartSeriesDoc[];
  showLegend: boolean;
  /** PowerPoint chart style 1-48 (`c:style`). */
  style?: number;
  /**
   * Opaque re-edit metadata (the editor's chart JSON), written into
   * `p:cNvPr/a:extLst` on the chart's graphicFrame or picture.
   */
  reEditData?: string;
  /**
   * When set, the chart is emitted as a `p:pic` referencing this PNG media
   * part instead of a native chart part. The generator never rasterizes —
   * callers supply finished PNG bytes (metadata chunk already embedded), so
   * the Node validation script can inject a stub image.
   */
  image?: { pngBase64: string };
}

/**
 * Group children keep ABSOLUTE slide coordinates: the generator writes the
 * group's child offset/extent (`a:chOff`/`a:chExt`) equal to the group frame
 * itself, so no coordinate re-mapping happens inside the group.
 */
export interface GroupDoc {
  type: "group";
  name: string;
  frame: FrameEmu;
  children: (ShapeDoc | ChartDoc)[];
}

export type SlideChildDoc = ShapeDoc | ChartDoc | GroupDoc;

export interface SlideDoc {
  /** RRGGBB background fill. */
  background?: string;
  children: SlideChildDoc[];
}

export interface PresentationDoc {
  title: string;
  slides: SlideDoc[];
}
