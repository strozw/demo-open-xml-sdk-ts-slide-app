import { fontDefinition, segmentByStyle } from "@/features/editor/fonts";
import { boundingBox, objectBounds } from "@/features/editor/geometry";
import { shapeDefinition } from "@/features/editor/shape-defs";
import type {
  ChartObject,
  Deck,
  GroupObject,
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
  FrameEmu,
  GroupDoc,
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

async function leafChild(object: LeafObject, options: ExportOptions): Promise<ShapeDoc | ChartDoc> {
  switch (object.type) {
    case "shape":
      return shapeChild(object);
    case "text":
      return textChild(object);
    case "chart":
      return chartChild(object, options);
  }
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
    name: object.name,
    frame: frame(boundingBox(object.children.map(objectBounds))),
    children: await Promise.all(
      object.children.map(
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
          slide.objects.map(
            (object): Promise<SlideChildDoc> =>
              object.type === "group" ? groupChild(object, options) : leafChild(object, options),
          ),
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

export interface DownloadOptions extends ExportOptions {
  /** File name without the .pptx extension; defaults to the deck title. */
  fileName?: string;
}

export async function downloadDeckAsPptx(deck: Deck, options: DownloadOptions = {}): Promise<void> {
  const { fileName, ...exportOptions } = options;
  const blob = await exportDeckToPptxBlob(deck, exportOptions);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFileName(fileName ?? deck.title)}.pptx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
