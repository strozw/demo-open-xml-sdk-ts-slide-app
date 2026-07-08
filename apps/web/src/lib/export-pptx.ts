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
  return {
    anchor: BODY_ANCHOR[content.verticalAlign],
    paragraphs: content.text.split("\n").map((line) => ({
      align: PARAGRAPH_ALIGN[content.align],
      runs: [
        {
          text: line,
          sizePt: content.fontSize,
          bold: content.bold,
          italic: content.italic,
          color: hex(content.color),
        },
      ],
    })),
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

async function chartChild(object: ChartObject, rasterize?: ChartRasterizer): Promise<ChartDoc> {
  // The full editor model rides along as re-edit metadata: on the shape's
  // extLst always, and inside the PNG itself for image-exported charts.
  const reEditData = JSON.stringify(object);
  let image: ChartDoc["image"];
  if (object.exportAsImage && rasterize) {
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

async function leafChild(
  object: LeafObject,
  rasterize?: ChartRasterizer,
): Promise<ShapeDoc | ChartDoc> {
  switch (object.type) {
    case "shape":
      return shapeChild(object);
    case "text":
      return textChild(object);
    case "chart":
      return chartChild(object, rasterize);
  }
}

/**
 * Group children are exported with ABSOLUTE slide coordinates: the generator
 * writes the group's child offset (chOff/chExt) equal to the group frame, so
 * child transforms stay in the same coordinate space as the slide — a 1:1
 * mapping from the editor model, which also stores absolute coordinates.
 */
async function groupChild(object: GroupObject, rasterize?: ChartRasterizer): Promise<GroupDoc> {
  return {
    type: "group",
    name: object.name,
    frame: frame(boundingBox(object.children.map(objectBounds))),
    children: await Promise.all(
      object.children.map(
        (child): Promise<SlideChildDoc> =>
          child.type === "group" ? groupChild(child, rasterize) : leafChild(child, rasterize),
      ),
    ),
  };
}

export async function deckToPresentationDoc(
  deck: Deck,
  rasterize?: ChartRasterizer,
): Promise<PresentationDoc> {
  return {
    title: deck.title,
    slides: await Promise.all(
      deck.slides.map(async (slide) => ({
        background: hex(slide.background),
        children: await Promise.all(
          slide.objects.map(
            (object): Promise<SlideChildDoc> =>
              object.type === "group"
                ? groupChild(object, rasterize)
                : leafChild(object, rasterize),
          ),
        ),
      })),
    ),
  };
}

export async function exportDeckToPptxBlob(
  deck: Deck,
  rasterize: ChartRasterizer = rasterizeChartToPng,
): Promise<Blob> {
  return generatePresentation(await deckToPresentationDoc(deck, rasterize));
}

export async function downloadDeckAsPptx(deck: Deck): Promise<void> {
  const blob = await exportDeckToPptxBlob(deck);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${deck.title.replaceAll(/[\\/:*?"<>|]/g, "_") || "presentation"}.pptx`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
