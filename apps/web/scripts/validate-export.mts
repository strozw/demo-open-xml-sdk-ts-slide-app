/**
 * Validates the editor → PPTX mapping without a browser: builds a deck that
 * exercises shapes, text alignment, groups (absolute child coordinates), and
 * charts, generates the .pptx with the openxmlsdkts-based generator, and
 * asserts on the resulting OOXML parts.
 *
 * Note: the ltxmlts serializer emits single-quoted attributes and a space
 * before self-closing tags (`<a:off x='0' y='0' />`); assertions match that.
 *
 * Run with: pnpm test:export
 */
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

import { P, PmlPackage } from "openxmlsdkts";

import { deckToPresentationDoc } from "../src/lib/export-pptx";
import { deckFromPptxBlob } from "../src/lib/import-pptx";
import { generatePresentation } from "../src/lib/pptx";
import { CHART_META_EXT_URI, PNG_TEXT_KEYWORD, readChartMeta } from "../src/lib/pptx/chart-meta";
import { insertPngTextChunk, readPngTextChunk } from "../src/lib/png-text";
import type { ChartRasterizer } from "../src/lib/rasterize-chart";
import { createTextContent } from "../src/features/editor/types";
import type { ChartObject, Deck, LeafObject, TextContent } from "../src/features/editor/types";

const EMU_PER_PX = 9525;

// 1x1 transparent PNG — the Node validation has no canvas, so the browser
// rasterizer is replaced by a stub returning this fixed image.
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const stubRasterizer: ChartRasterizer = async () => ONE_BY_ONE_PNG_BASE64;

const deck: Deck = {
  title: "validation deck",
  slides: [
    {
      id: "s1",
      background: "#f5f5f4",
      objects: [
        {
          id: "o1",
          name: "Rounded",
          type: "shape",
          shape: "roundRect",
          x: 100,
          y: 50,
          width: 200,
          height: 100,
          fill: "#4472c4",
          outlineColor: "#1f2937",
          outlineWidth: 2,
          text: {
            text: "こんにちは",
            fontSize: 24,
            bold: true,
            italic: false,
            color: "#ffffff",
            align: "right",
            verticalAlign: "bottom",
          },
        },
        {
          id: "o2",
          name: "Text",
          type: "text",
          x: 400,
          y: 400,
          width: 300,
          height: 80,
          text: {
            text: "縦横位置の確認",
            fontSize: 18,
            bold: false,
            italic: true,
            color: "#111827",
            align: "center",
            verticalAlign: "center",
          },
        },
        {
          id: "g1",
          name: "Group",
          type: "group",
          x: 600,
          y: 100,
          width: 300,
          height: 200,
          children: [
            {
              id: "o3",
              name: "A",
              type: "shape",
              shape: "ellipse",
              x: 600,
              y: 100,
              width: 100,
              height: 100,
              fill: "#ed7d31",
              outlineColor: "#000000",
              outlineWidth: 0,
              text: {
                text: "",
                fontSize: 18,
                bold: false,
                italic: false,
                color: "#000000",
                align: "center",
                verticalAlign: "center",
              },
            },
            {
              id: "o4",
              name: "B",
              type: "shape",
              shape: "rect",
              x: 800,
              y: 200,
              width: 100,
              height: 100,
              fill: "#70ad47",
              outlineColor: "#000000",
              outlineWidth: 0,
              text: {
                text: "",
                fontSize: 18,
                bold: false,
                italic: false,
                color: "#000000",
                align: "center",
                verticalAlign: "center",
              },
            },
          ],
        },
        {
          id: "c1",
          name: "Chart",
          type: "chart",
          chartType: "column",
          x: 100,
          y: 300,
          width: 250,
          height: 200,
          title: "Sales",
          categories: ["Q1", "Q2"],
          series: [
            { id: "sr1", name: "A", values: [10, 20] },
            { id: "sr2", name: "B", values: [15, 5] },
          ],
          showLegend: true,
          style: 10,
        },
      ],
    },
    {
      id: "s2",
      background: "#ffffff",
      objects: [
        {
          id: "c2",
          name: "Pie",
          type: "chart",
          chartType: "pie",
          x: 200,
          y: 100,
          width: 400,
          height: 300,
          title: "Share",
          categories: ["A", "B", "C"],
          series: [{ id: "sr3", name: "Share", values: [50, 30, 20] }],
          showLegend: true,
        },
        {
          id: "c6",
          name: "ImageChart",
          type: "chart",
          chartType: "line",
          x: 700,
          y: 100,
          width: 300,
          height: 200,
          title: "画像で書き出す折れ線",
          categories: ["1月", "2月", "3月"],
          series: [{ id: "sr10", name: "推移", values: [3, 7, 5] }],
          showLegend: true,
          style: 3,
          exportAsImage: true,
        },
      ],
    },
    {
      id: "s3",
      background: "#ffffff",
      objects: [
        {
          id: "c3",
          name: "Bubble",
          type: "chart",
          chartType: "bubble",
          x: 50,
          y: 50,
          width: 300,
          height: 200,
          title: "Bubbles",
          categories: [],
          series: [
            {
              id: "sr4",
              name: "P",
              values: [5, 15, 10],
              xValues: [10, 20, 30],
              bubbleSizes: [100, 200, 150],
            },
          ],
          showLegend: true,
        },
        {
          id: "c4",
          name: "Stock",
          type: "chart",
          chartType: "stock",
          x: 400,
          y: 50,
          width: 300,
          height: 200,
          title: "Stock",
          categories: ["Mon", "Tue"],
          series: [
            { id: "sr5", name: "High", values: [105, 108] },
            { id: "sr6", name: "Low", values: [98, 103] },
            { id: "sr7", name: "Close", values: [103, 106] },
          ],
          showLegend: false,
        },
        {
          id: "c5",
          name: "Surface",
          type: "chart",
          chartType: "surface",
          x: 50,
          y: 300,
          width: 300,
          height: 200,
          title: "Surface",
          categories: ["Jan", "Feb", "Mar"],
          series: [
            { id: "sr8", name: "North", values: [5, 8, 15] },
            { id: "sr9", name: "South", values: [20, 22, 25] },
          ],
          showLegend: true,
        },
      ],
    },
  ],
};

// Minimal ZIP central-directory reader: enough to list entries and inflate
// one file, so the validation has no extra dependencies.
function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const eocdIndex = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocdIndex >= 0, "ZIP end-of-central-directory record not found");
  const count = buffer.readUInt16LE(eocdIndex + 10);
  let offset = buffer.readUInt32LE(eocdIndex + 16);
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "bad central directory signature");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const blob = await generatePresentation(await deckToPresentationDoc(deck, stubRasterizer));
const buffer = Buffer.from(await blob.arrayBuffer());
const entries = readZipEntries(buffer);

const names = [...entries.keys()].filter((name) => !name.endsWith("/"));
assert.ok(names.includes("ppt/presentation.xml"), "presentation.xml missing");
assert.ok(names.includes("ppt/slideMasters/slideMaster1.xml"), "slideMaster1.xml missing");
assert.ok(names.includes("ppt/slideLayouts/slideLayout1.xml"), "slideLayout1.xml missing");
assert.ok(names.includes("ppt/theme/theme1.xml"), "theme1.xml missing");
assert.ok(names.includes("ppt/slides/slide1.xml"), "slide1.xml missing");
assert.ok(names.includes("ppt/slides/slide2.xml"), "slide2.xml missing");
assert.ok(
  names.some((name) => /ppt\/charts\/chart\d+\.xml/.test(name)),
  "chart XML part missing",
);

// Package plumbing: canonical default namespaces (no auto-generated p0:
// prefixes) in the content types and relationship parts.
const contentTypes = entries.get("[Content_Types].xml")!.toString("utf8");
assert.ok(contentTypes.includes("<Types xmlns="), "content types root not canonical");
assert.ok(!contentTypes.includes("p0:"), "content types has auto-generated prefix");
const packageRels = entries.get("_rels/.rels")!.toString("utf8");
assert.ok(packageRels.includes("<Relationships xmlns="), "package rels root not canonical");
assert.ok(
  packageRels.includes("Target='ppt/presentation.xml'"),
  "officeDocument relationship missing",
);
const slide1Rels = entries.get("ppt/slides/_rels/slide1.xml.rels")!.toString("utf8");
assert.ok(
  slide1Rels.includes("Target='../slideLayouts/slideLayout1.xml'"),
  "slide → layout relationship missing",
);
assert.ok(
  slide1Rels.includes("Target='../charts/chart1.xml'"),
  "slide → chart relationship missing",
);

const slide1 = entries.get("ppt/slides/slide1.xml")!.toString("utf8");
const slide2 = entries.get("ppt/slides/slide2.xml")!.toString("utf8");

// Shape frame is converted from px to EMU.
assert.ok(slide1.includes(`<a:off x='${100 * EMU_PER_PX}' y='${50 * EMU_PER_PX}' />`), "shape off");
assert.ok(
  slide1.includes(`<a:ext cx='${200 * EMU_PER_PX}' cy='${100 * EMU_PER_PX}' />`),
  "shape ext",
);
assert.ok(slide1.includes("prst='roundRect'"), "roundRect geometry");
assert.ok(slide1.includes("<a:srgbClr val='4472C4' />"), "shape fill");

// Outline: 2px → 19050 EMU.
assert.ok(slide1.includes(`<a:ln w='${2 * EMU_PER_PX}'>`), "outline width");

// Text: vertical anchor bottom + right alignment + bold 24pt run.
assert.ok(slide1.includes("anchor='b'"), "anchor bottom");
assert.ok(slide1.includes("algn='r'"), "align right");
assert.ok(slide1.includes("sz='2400' b='1'"), "bold 24pt run");
assert.ok(slide1.includes("こんにちは"), "shape text");

// Text box: centered anchor/alignment, italic run, no fill.
assert.ok(slide1.includes("anchor='ctr'"), "anchor center");
assert.ok(slide1.includes("algn='ctr'"), "align center");
assert.ok(slide1.includes("i='1'"), "italic run");
assert.ok(slide1.includes("<a:noFill />"), "text box has no fill");
assert.ok(slide1.includes("txBox='1'"), "text box marker");

// Group: frame == child bounding box, chOff == off (absolute child coords).
const groupXfrm =
  `<a:off x='${600 * EMU_PER_PX}' y='${100 * EMU_PER_PX}' />` +
  `<a:ext cx='${300 * EMU_PER_PX}' cy='${200 * EMU_PER_PX}' />` +
  `<a:chOff x='${600 * EMU_PER_PX}' y='${100 * EMU_PER_PX}' />` +
  `<a:chExt cx='${300 * EMU_PER_PX}' cy='${200 * EMU_PER_PX}' />`;
assert.ok(slide1.includes(groupXfrm), "group chOff/chExt must equal the absolute frame");
assert.ok(
  slide1.includes(`<a:off x='${800 * EMU_PER_PX}' y='${200 * EMU_PER_PX}' />`),
  "group child keeps absolute coordinates",
);

// Charts are referenced via graphicFrame on both slides.
assert.ok(slide1.includes("graphicFrame"), "chart graphicFrame on slide 1");
assert.ok(slide2.includes("graphicFrame"), "chart graphicFrame on slide 2");
assert.ok(slide1.includes("<c:chart"), "chart reference element on slide 1");

// Chart parts contain the right plot types and data.
const chartXmls = names
  .filter((name) => /ppt\/charts\/chart\d+\.xml/.test(name))
  .map((name) => entries.get(name)!.toString("utf8"));
assert.equal(chartXmls.length, 5, "five chart parts");
const allCharts = chartXmls.join("\n");
assert.ok(allCharts.includes("<c:barChart>"), "column chart part");
assert.ok(allCharts.includes("<c:pieChart>"), "pie chart part");
assert.ok(allCharts.includes("Q1"), "chart categories");
assert.ok(allCharts.includes("<c:v>20</c:v>"), "chart values");

// Chart style (c:style), carried through from the editor's style picker.
assert.ok(allCharts.includes("<c:style val='10' />"), "chart style value");

// Bubble chart: xVal / yVal / bubbleSize instead of categories.
assert.ok(allCharts.includes("<c:bubbleChart>"), "bubble chart part");
const bubbleXml = chartXmls.find((xml) => xml.includes("<c:bubbleChart>"))!;
assert.ok(bubbleXml.includes("<c:xVal>"), "bubble xVal");
assert.ok(bubbleXml.includes("<c:yVal>"), "bubble yVal");
assert.ok(bubbleXml.includes("<c:bubbleSize>"), "bubble size");
assert.ok(bubbleXml.includes("<c:v>200</c:v>"), "bubble size values");

// Stock and surface chart types.
assert.ok(allCharts.includes("<c:stockChart>"), "stock chart part");
assert.ok(allCharts.includes("<c:surfaceChart>"), "surface chart part");
const stockXml = chartXmls.find((xml) => xml.includes("<c:stockChart>"))!;
assert.ok(!stockXml.includes("<c:legend>"), "stock chart hides the legend");
assert.ok(stockXml.includes("<c:hiLowLines"), "stock chart draws high-low lines");
const surfaceXml = chartXmls.find((xml) => xml.includes("<c:surfaceChart>"))!;
assert.ok(surfaceXml.includes("<c:serAx>"), "surface chart has a series axis");

// Slide background color.
assert.ok(slide1.includes("<a:srgbClr val='F5F5F4' />"), "slide background fill");

// ---- Image-exported chart (p:pic + PNG media part + re-edit metadata) ----

// PNG chunk helpers round-trip in isolation.
const sampleJson = JSON.stringify({ hello: "世界", n: [1, 2, 3] });
assert.equal(
  readPngTextChunk(
    insertPngTextChunk(Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"), PNG_TEXT_KEYWORD, sampleJson),
    PNG_TEXT_KEYWORD,
  ),
  sampleJson,
  "iTXt chunk round-trip",
);

const imageChart = deck.slides[1]!.objects[1] as ChartObject;

// Media part, content type, and slide relationship.
assert.ok(names.includes("ppt/media/image1.png"), "chart PNG media part missing");
assert.ok(
  contentTypes.includes("PartName='/ppt/media/image1.png' ContentType='image/png'"),
  "png content type override missing",
);
const slide2Rels = entries.get("ppt/slides/_rels/slide2.xml.rels")!.toString("utf8");
assert.ok(
  slide2Rels.includes("relationships/image' Target='../media/image1.png'"),
  "slide → image relationship missing",
);

// The image chart is a p:pic (not a graphicFrame) with the metadata ext.
assert.ok(slide2.includes("<p:pic>"), "p:pic element for image chart");
assert.ok(slide2.includes("r:embed='rId"), "blip embed relationship");
assert.ok(slide2.includes(`uri='${CHART_META_EXT_URI}'`), "chart meta ext uri");
const nativeChartCount = (slide2.match(/<p:graphicFrame>/g) ?? []).length;
assert.equal(nativeChartCount, 1, "image chart must not also emit a graphicFrame");

// The PNG inside the package carries the editor JSON in its iTXt chunk.
const pngEntry = new Uint8Array(entries.get("ppt/media/image1.png")!);
const pngMeta = readPngTextChunk(pngEntry, PNG_TEXT_KEYWORD);
assert.ok(pngMeta, "PNG iTXt metadata missing");
assert.deepEqual(JSON.parse(pngMeta), imageChart, "PNG metadata restores the chart object");

// Round trip: the generated package opens with openxmlsdkts itself and the
// presentation part resolves through the officeDocument relationship.
const reopened = await PmlPackage.open(blob);
const presentationPart = await reopened.presentationPart();
assert.ok(presentationPart, "reopened package has a presentation part");
const reopenedXml = (await presentationPart.getXDocument()).toString();
assert.ok(reopenedXml.includes("sldIdLst"), "reopened presentation lists slides");

// extLst metadata is readable back through the XML API, on both the p:pic
// and a native chart's p:graphicFrame.
const reopenedSlide2 = await reopened.getPartByUri("/ppt/slides/slide2.xml")!.getXDocument();
const picCNvPr = reopenedSlide2.root!.descendants(P.pic)[0]!.element(P.nvPicPr)!.element(P.cNvPr)!;
const picMeta = readChartMeta(picCNvPr);
assert.ok(picMeta, "p:pic extLst metadata missing");
assert.deepEqual(JSON.parse(picMeta), imageChart, "p:pic extLst metadata restores the chart");
const frameCNvPr = reopenedSlide2
  .root!.descendants(P.graphicFrame)[0]!
  .element(P.nvGraphicFramePr)!
  .element(P.cNvPr)!;
const frameMeta = readChartMeta(frameCNvPr);
assert.ok(frameMeta, "graphicFrame extLst metadata missing");
assert.deepEqual(
  JSON.parse(frameMeta),
  deck.slides[1]!.objects[0],
  "graphicFrame extLst metadata restores the chart",
);

// ---- Full import round-trip -------------------------------------------
// Opening the generated file restores the editor model. Ids are regenerated
// on import and empty-text styling is not serialized, so both sides are
// normalized before comparing.
function normalizeDeck(source: Deck): Deck {
  const clone = structuredClone(source);
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `id-${counter}`;
  };
  const normalizeText = (content: TextContent): TextContent =>
    content.text ? content : { ...createTextContent(), text: "" };
  const normalizeLeaf = (object: LeafObject): void => {
    object.id = nextId();
    if (object.type === "shape" || object.type === "text") {
      object.text = normalizeText(object.text);
    } else if (object.type === "chart") {
      for (const series of object.series) {
        series.id = nextId();
      }
    }
  };
  for (const slide of clone.slides) {
    slide.id = nextId();
    for (const object of slide.objects) {
      if (object.type === "group") {
        object.id = nextId();
        object.children.forEach(normalizeLeaf);
      } else {
        normalizeLeaf(object);
      }
    }
  }
  return clone;
}

const importedDeck = await deckFromPptxBlob(blob);
assert.deepEqual(
  normalizeDeck(importedDeck),
  normalizeDeck(deck),
  "full import round-trip restores the deck",
);

console.log(`ok - ${names.length} parts, slide/group/text/chart/import assertions all passed`);
