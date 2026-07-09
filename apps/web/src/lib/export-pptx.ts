import { fontDefinition, segmentByStyle } from "@/features/editor/fonts";
import { boundingBox, connectorRoutePoints, objectBounds } from "@/features/editor/geometry";
import { shapeDefinition } from "@/features/editor/shape-defs";
import type {
  ChartObject,
  ConnectionSite,
  ConnectorObject,
  Deck,
  GroupObject,
  ImageObject,
  LeafObject,
  ShapeObject,
  TextContent,
  TextObject,
  TextHAlign,
  TextVAlign,
} from "@/features/editor/types";

import { base64ToBytes, bytesToBase64 } from "./binary";
import { insertPngTextChunk } from "./png-text";
import { generatePresentation, pxToEmu } from "./pptx";
import type {
  BodyAnchor,
  ChartDoc,
  ConnectorDoc,
  FrameEmu,
  GroupDoc,
  ImageDoc,
  ParagraphAlign,
  PresentationDoc,
  ShapeDoc,
  SlideChildDoc,
  TextBodyDoc,
} from "./pptx";
import { PNG_TEXT_KEYWORD } from "./pptx/chart-meta";
import { rasterizeChartToPng, type ChartRasterizer } from "./rasterize-chart";

/**
 * The editor canvas is 1280x720 px, which matches the 16:9 slide size
 * (12192000x6858000 EMU) at 96 DPI exactly, so canvas coordinates map 1:1.
 * The pptx generator takes EMU numbers; `pxToEmu` (1px = 9525 EMU) converts.
 */
function frame(rect: { x: number; y: number; width: number; height: number }): FrameEmu {
  return {
    x: pxToEmu(rect.x),
    y: pxToEmu(rect.y),
    cx: pxToEmu(rect.width),
    cy: pxToEmu(rect.height),
  };
}

function hex(color: string): string {
  return color.replace("#", "").toUpperCase();
}

const PARAGRAPH_ALIGN: Record<TextHAlign, ParagraphAlign> = {
  left: "l",
  center: "ctr",
  right: "r",
  justify: "just",
};

const BODY_ANCHOR: Record<TextVAlign, BodyAnchor> = {
  top: "t",
  center: "ctr",
  bottom: "b",
};

function textBody(content: TextContent): TextBodyDoc | undefined {
  if (!content.text) {
    return undefined;
  }
  // Each line becomes a paragraph; within a line, consecutive characters
  // that share a style become one run (per-character style overrides).
  let offset = 0;
  const paragraphs = content.text.split("\n").map((line) => {
    const segments = segmentByStyle(content, line, offset);
    offset += line.length + 1;
    return {
      align: PARAGRAPH_ALIGN[content.align],
      runs: segments.map((segment) => ({
        text: segment.text,
        sizePt: segment.style.fontSize,
        bold: segment.style.bold,
        italic: segment.style.italic,
        color: hex(segment.style.color),
        font: fontDefinition(segment.style.fontFamily)?.typeface,
      })),
    };
  });
  return {
    anchor: BODY_ANCHOR[content.verticalAlign],
    paragraphs,
  };
}

function shapeChild(object: ShapeObject): ShapeDoc {
  return {
    type: "shape",
    refId: object.id,
    name: object.name,
    frame: frame(object),
    geometry: shapeDefinition(object.shape).presetGeometry,
    fill: hex(object.fill),
    outline:
      object.outlineWidth > 0
        ? { widthEmu: pxToEmu(object.outlineWidth), color: hex(object.outlineColor) }
        : undefined,
    textBody: textBody(object.text),
  };
}

function textChild(object: TextObject): ShapeDoc {
  // A text box is a borderless, unfilled shape carrying only a text body.
  return {
    type: "shape",
    refId: object.id,
    name: object.name,
    frame: frame(object),
    geometry: "rect",
    textBox: true,
    textBody: textBody(object.text),
  };
}

export interface ExportOptions {
  /** Chart → PNG renderer; injectable so Node validation can stub it. */
  rasterize?: ChartRasterizer;
  /** Export every chart as an image, regardless of each chart's flag. */
  forceChartsAsImages?: boolean;
  /** Static TTF data to embed (see `loadEmbeddedFonts`). */
  embeddedFonts?: { typeface: string; regularBase64: string; boldBase64: string }[];
}

async function chartChild(object: ChartObject, options: ExportOptions): Promise<ChartDoc> {
  const rasterize = options.rasterize;
  // The full editor model rides along as re-edit metadata: on the shape's
  // extLst always, and inside the PNG itself for image-exported charts.
  const reEditData = JSON.stringify(object);
  let image: ChartDoc["image"];
  if ((object.exportAsImage || options.forceChartsAsImages) && rasterize) {
    const png = base64ToBytes(await rasterize(object));
    image = { pngBase64: bytesToBase64(insertPngTextChunk(png, PNG_TEXT_KEYWORD, reEditData)) };
  }
  return {
    type: "chart",
    refId: object.id,
    name: object.name,
    frame: frame(object),
    chartType: object.chartType,
    title: object.title || undefined,
    categories: object.categories,
    series: object.series.map((series) => ({
      name: series.name,
      values: series.values,
      xValues: series.xValues,
      bubbleSizes: series.bubbleSizes,
    })),
    showLegend: object.showLegend,
    style: object.style,
    reEditData,
    image,
  };
}

function imageChild(object: ImageObject): ImageDoc {
  return {
    type: "image",
    refId: object.id,
    name: object.name,
    frame: frame(object),
    mimeType: object.mimeType,
    dataBase64: object.dataBase64,
  };
}

async function leafChild(
  object: LeafObject,
  options: ExportOptions,
): Promise<ShapeDoc | ChartDoc | ImageDoc> {
  switch (object.type) {
    case "shape":
      return shapeChild(object);
    case "text":
      return textChild(object);
    case "chart":
      return chartChild(object, options);
    case "image":
      return imageChild(object);
  }
}

/** Cardinal sites → connection-site index (rect-family cxn order). */
const SITE_INDEX: Record<ConnectionSite, number> = { top: 0, left: 1, bottom: 2, right: 3 };

/** Corner count → the matching PowerPoint bent-connector preset. */
const BENT_PRESET_BY_CORNERS: Record<number, ConnectorDoc["preset"]> = {
  1: "bentConnector2",
  2: "bentConnector3",
  3: "bentConnector4",
  4: "bentConnector5",
};

const ARROW_SIZE_TOKEN = { small: "sm", medium: "med", large: "lg" } as const;

/** Editor arrowhead → OOXML head/tail end, or undefined for "none". */
function arrowDoc(arrow: ConnectorObject["startArrow"]): ConnectorDoc["startArrow"] {
  if (arrow.type === "none") {
    return undefined;
  }
  return { type: arrow.type, size: ARROW_SIZE_TOKEN[arrow.size] };
}

function connectorChild(object: ConnectorObject): ConnectorDoc {
  // Pick the bent preset by the editor's corner count so PowerPoint draws a
  // route with the same number of bends. The frame is the endpoint bounding
  // box (not the routed-polyline box) because PowerPoint maps the preset
  // geometry into that box and re-routes from the connection points.
  const corners = connectorRoutePoints(object).length - 2;
  const preset: ConnectorDoc["preset"] =
    object.connectorType === "straight" || corners <= 0
      ? "straightConnector1"
      : (BENT_PRESET_BY_CORNERS[Math.min(4, corners)] ?? "bentConnector3");
  const minX = Math.min(object.startPoint.x, object.endPoint.x);
  const minY = Math.min(object.startPoint.y, object.endPoint.y);
  return {
    type: "connector",
    refId: object.id,
    name: object.name,
    frame: {
      x: pxToEmu(minX),
      y: pxToEmu(minY),
      cx: pxToEmu(Math.abs(object.endPoint.x - object.startPoint.x)),
      cy: pxToEmu(Math.abs(object.endPoint.y - object.startPoint.y)),
    },
    preset,
    flipH: object.endPoint.x < object.startPoint.x,
    flipV: object.endPoint.y < object.startPoint.y,
    // Only attached endpoints get a semantic connection; free endpoints
    // rely on the geometry (frame + flips) alone.
    start: object.start.objectId
      ? { refId: object.start.objectId, siteIndex: SITE_INDEX[object.start.site] }
      : undefined,
    end: object.end.objectId
      ? { refId: object.end.objectId, siteIndex: SITE_INDEX[object.end.site] }
      : undefined,
    lineColor: hex(object.lineColor),
    lineWidthEmu: pxToEmu(object.lineWidth),
    startArrow: arrowDoc(object.startArrow),
    endArrow: arrowDoc(object.endArrow),
  };
}

/**
 * Group children are exported with ABSOLUTE slide coordinates: the generator
 * writes the group's child offset (chOff/chExt) equal to the group frame, so
 * child transforms stay in the same coordinate space as the slide — a 1:1
 * mapping from the editor model, which also stores absolute coordinates.
 */
async function groupChild(object: GroupObject, options: ExportOptions): Promise<GroupDoc> {
  return {
    type: "group",
    refId: object.id,
    name: object.name,
    frame: frame(boundingBox(object.children.map(objectBounds))),
    children: await Promise.all(
      object.children
        // Connectors never live inside groups (the store keeps them
        // top-level); the filter narrows the child type for mapping.
        .filter((child): child is LeafObject | GroupObject => child.type !== "connector")
        .map(
          (child): Promise<SlideChildDoc> =>
            child.type === "group" ? groupChild(child, options) : leafChild(child, options),
        ),
    ),
  };
}

export async function deckToPresentationDoc(
  deck: Deck,
  options: ExportOptions = {},
): Promise<PresentationDoc> {
  return {
    title: deck.title,
    slides: await Promise.all(
      deck.slides.map(async (slide) => ({
        background: hex(slide.background),
        children: await Promise.all(
          slide.objects.map(async (object): Promise<SlideChildDoc> => {
            if (object.type === "group") {
              return groupChild(object, options);
            }
            if (object.type === "connector") {
              return connectorChild(object);
            }
            return leafChild(object, options);
          }),
        ),
      })),
    ),
    embeddedFonts: options.embeddedFonts,
  };
}

export async function exportDeckToPptxBlob(deck: Deck, options: ExportOptions = {}): Promise<Blob> {
  return generatePresentation(
    await deckToPresentationDoc(deck, { rasterize: rasterizeChartToPng, ...options }),
  );
}

export function sanitizeFileName(name: string): string {
  return name.replaceAll(/[\\/:*?"<>|]/g, "_").trim() || "presentation";
}

/** Extension used for exported files (the content is a regular .pptx). */
export const EXPORT_FILE_EXTENSION = ".my.pptx";

export interface DownloadOptions extends ExportOptions {
  /** File name without the extension; defaults to the deck title. */
  fileName?: string;
}

export async function downloadDeckAsPptx(deck: Deck, options: DownloadOptions = {}): Promise<void> {
  const { fileName, ...exportOptions } = options;
  const blob = await exportDeckToPptxBlob(deck, exportOptions);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileName(fileName ?? deck.title)}${EXPORT_FILE_EXTENSION}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
