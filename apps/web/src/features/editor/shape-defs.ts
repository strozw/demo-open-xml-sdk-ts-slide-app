import {
  createId,
  createTextContent,
  type ChartKind,
  type ChartObject,
  type ShapeKind,
  type ShapeObject,
  type TextObject,
} from "./types";

export interface ShapeDefinition {
  kind: ShapeKind;
  label: string;
  /** Preset geometry name used by DrawingML (`a:prstGeom@prst`). */
  presetGeometry: string;
  /** Polygon points in a 0..1 unit square, or null for rect/roundRect/ellipse. */
  polygon: readonly (readonly [number, number])[] | null;
}

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  { kind: "rect", label: "長方形", presetGeometry: "rect", polygon: null },
  { kind: "roundRect", label: "角丸四角形", presetGeometry: "roundRect", polygon: null },
  { kind: "ellipse", label: "楕円", presetGeometry: "ellipse", polygon: null },
  {
    kind: "triangle",
    label: "三角形",
    presetGeometry: "triangle",
    polygon: [
      [0.5, 0],
      [1, 1],
      [0, 1],
    ],
  },
  {
    kind: "diamond",
    label: "ひし形",
    presetGeometry: "diamond",
    polygon: [
      [0.5, 0],
      [1, 0.5],
      [0.5, 1],
      [0, 0.5],
    ],
  },
  {
    kind: "rightArrow",
    label: "右矢印",
    presetGeometry: "rightArrow",
    polygon: [
      [0, 0.25],
      [0.6, 0.25],
      [0.6, 0],
      [1, 0.5],
      [0.6, 1],
      [0.6, 0.75],
      [0, 0.75],
    ],
  },
  {
    kind: "star5",
    label: "星",
    presetGeometry: "star5",
    polygon: [
      [0.5, 0],
      [0.62, 0.36],
      [1, 0.38],
      [0.7, 0.61],
      [0.81, 0.97],
      [0.5, 0.75],
      [0.19, 0.97],
      [0.3, 0.61],
      [0, 0.38],
      [0.38, 0.36],
    ],
  },
  {
    kind: "hexagon",
    label: "六角形",
    presetGeometry: "hexagon",
    polygon: [
      [0.22, 0],
      [0.78, 0],
      [1, 0.5],
      [0.78, 1],
      [0.22, 1],
      [0, 0.5],
    ],
  },
];

export function shapeDefinition(kind: ShapeKind): ShapeDefinition {
  return SHAPE_DEFINITIONS.find((d) => d.kind === kind) ?? SHAPE_DEFINITIONS[0]!;
}

const SHAPE_FILLS = ["#4472c4", "#ed7d31", "#70ad47", "#ffc000", "#5b9bd5", "#a855f7"];
let shapeCount = 0;

export function createShapeObject(kind: ShapeKind): ShapeObject {
  shapeCount += 1;
  const definition = shapeDefinition(kind);
  return {
    id: createId("object"),
    name: `${definition.label} ${shapeCount}`,
    type: "shape",
    shape: kind,
    x: 120 + (shapeCount % 5) * 40,
    y: 100 + (shapeCount % 5) * 30,
    width: 260,
    height: 160,
    fill: SHAPE_FILLS[shapeCount % SHAPE_FILLS.length]!,
    outlineColor: "#1f2937",
    outlineWidth: 1,
    text: createTextContent({ color: "#ffffff" }),
  };
}

let textCount = 0;

export function createTextObject(): TextObject {
  textCount += 1;
  return {
    id: createId("object"),
    name: `テキスト ${textCount}`,
    type: "text",
    x: 160 + (textCount % 5) * 40,
    y: 140 + (textCount % 5) * 30,
    width: 420,
    height: 90,
    text: createTextContent({
      text: "テキストを入力",
      align: "left",
      verticalAlign: "top",
      color: "#1a1a2e",
      fontSize: 24,
    }),
  };
}

export const CHART_DEFINITIONS: readonly { kind: ChartKind; label: string }[] = [
  { kind: "column", label: "縦棒グラフ" },
  { kind: "bar", label: "横棒グラフ" },
  { kind: "line", label: "折れ線グラフ" },
  { kind: "area", label: "面グラフ" },
  { kind: "pie", label: "円グラフ" },
  { kind: "doughnut", label: "ドーナツグラフ" },
  { kind: "scatter", label: "散布図" },
  { kind: "radar", label: "レーダーチャート" },
  { kind: "bubble", label: "バブルチャート" },
  { kind: "stock", label: "株価チャート" },
  { kind: "surface", label: "等高線グラフ" },
];

export function chartLabel(kind: ChartKind): string {
  return CHART_DEFINITIONS.find((d) => d.kind === kind)?.label ?? kind;
}

let chartCount = 0;

function defaultChartData(kind: ChartKind): Pick<ChartObject, "title" | "categories" | "series"> {
  if (kind === "bubble") {
    return {
      title: "売上と利益",
      categories: [],
      series: [
        {
          id: createId("series"),
          name: "製品A",
          values: [5, 15, 10, 25],
          xValues: [10, 20, 30, 40],
          bubbleSizes: [100, 200, 150, 300],
        },
        {
          id: createId("series"),
          name: "製品B",
          values: [8, 12, 18, 22],
          xValues: [15, 25, 35, 45],
          bubbleSizes: [120, 180, 220, 280],
        },
      ],
    };
  }
  if (kind === "stock") {
    // Stock charts require the series order High / Low / Close.
    return {
      title: "株価推移",
      categories: ["月", "火", "水", "木", "金"],
      series: [
        { id: createId("series"), name: "高値", values: [105, 108, 112, 110, 115] },
        { id: createId("series"), name: "安値", values: [98, 103, 106, 105, 110] },
        { id: createId("series"), name: "終値", values: [103, 106, 110, 108, 113] },
      ],
    };
  }
  return {
    title: "売上推移",
    categories: ["Q1", "Q2", "Q3", "Q4"],
    series: [
      { id: createId("series"), name: "2025年", values: [120, 180, 150, 210] },
      { id: createId("series"), name: "2026年", values: [160, 200, 190, 250] },
    ],
  };
}

export function createChartObject(kind: ChartKind): ChartObject {
  chartCount += 1;
  return {
    id: createId("object"),
    name: `${chartLabel(kind)} ${chartCount}`,
    type: "chart",
    chartType: kind,
    x: 180 + (chartCount % 4) * 40,
    y: 120 + (chartCount % 4) * 30,
    width: 480,
    height: 320,
    ...defaultChartData(kind),
    showLegend: true,
  };
}
