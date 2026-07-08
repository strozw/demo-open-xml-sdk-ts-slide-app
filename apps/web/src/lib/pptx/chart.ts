/**
 * DrawingML chart part builder (`ppt/charts/chartN.xml`).
 *
 * Category / value data is embedded as literal caches (`c:strLit` /
 * `c:numLit`), so no spreadsheet part is required; PowerPoint creates one on
 * demand when the user edits the chart data.
 */
import { A, C, R, XDeclaration, XDocument, XElement } from "openxmlsdkts";

import type { ChartDoc, ChartSeriesDoc } from "./types";
import { attr, xmlnsDecl } from "./xml";

const CAT_AX_ID = 111111111;
const VAL_AX_ID = 222222222;
const SER_AX_ID = 333333333;

function numLit(values: readonly number[]): XElement {
  return new XElement(
    C.numLit,
    new XElement(C.formatCode, "General"),
    new XElement(C.ptCount, attr("val", values.length)),
    values.map(
      (value, index) => new XElement(C.pt, attr("idx", index), new XElement(C.v, String(value))),
    ),
  );
}

function strLit(values: readonly string[]): XElement {
  return new XElement(
    C.strLit,
    new XElement(C.ptCount, attr("val", values.length)),
    values.map((value, index) => new XElement(C.pt, attr("idx", index), new XElement(C.v, value))),
  );
}

function seriesHeader(series: ChartSeriesDoc, index: number): XElement[] {
  return [
    new XElement(C.idx, attr("val", index)),
    new XElement(C.order, attr("val", index)),
    new XElement(C.tx, new XElement(C.v, series.name)),
  ];
}

function catVal(chart: ChartDoc, series: ChartSeriesDoc): XElement[] {
  return [
    new XElement(C.cat, strLit(chart.categories)),
    new XElement(C.val, numLit(series.values)),
  ];
}

/** `<c:marker><c:symbol val="none"/></c:marker>` (line-family series). */
function noMarker(): XElement {
  return new XElement(C.marker, new XElement(C.symbol, attr("val", "none")));
}

/** `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>` — hides the series line. */
function noLine(): XElement {
  return new XElement(C.spPr, new XElement(A.ln, new XElement(A.noFill)));
}

function categoryAxis(position: "b" | "l"): XElement {
  return new XElement(
    C.catAx,
    new XElement(C.axId, attr("val", CAT_AX_ID)),
    new XElement(C.scaling, new XElement(C.orientation, attr("val", "minMax"))),
    new XElement(C.delete, attr("val", 0)),
    new XElement(C.axPos, attr("val", position)),
    new XElement(C.crossAx, attr("val", VAL_AX_ID)),
  );
}

function valueAxis(position: "b" | "l", crossAxId: number = CAT_AX_ID): XElement {
  return new XElement(
    C.valAx,
    new XElement(C.axId, attr("val", VAL_AX_ID)),
    new XElement(C.scaling, new XElement(C.orientation, attr("val", "minMax"))),
    new XElement(C.delete, attr("val", 0)),
    new XElement(C.axPos, attr("val", position)),
    new XElement(C.crossAx, attr("val", crossAxId)),
  );
}

/** Scatter/bubble use two value axes; the X axis carries the category id. */
function xValueAxis(): XElement {
  return new XElement(
    C.valAx,
    new XElement(C.axId, attr("val", CAT_AX_ID)),
    new XElement(C.scaling, new XElement(C.orientation, attr("val", "minMax"))),
    new XElement(C.delete, attr("val", 0)),
    new XElement(C.axPos, attr("val", "b")),
    new XElement(C.crossAx, attr("val", VAL_AX_ID)),
  );
}

function seriesAxis(): XElement {
  return new XElement(
    C.serAx,
    new XElement(C.axId, attr("val", SER_AX_ID)),
    new XElement(C.scaling, new XElement(C.orientation, attr("val", "minMax"))),
    new XElement(C.delete, attr("val", 0)),
    new XElement(C.axPos, attr("val", "b")),
    new XElement(C.crossAx, attr("val", VAL_AX_ID)),
  );
}

function axisIds(...ids: number[]): XElement[] {
  return ids.map((id) => new XElement(C.axId, attr("val", id)));
}

/** X values for scatter series derived from editor categories (1-based). */
function scatterXValues(chart: ChartDoc, series: ChartSeriesDoc): number[] {
  return series.values.map((_, index) => {
    const category = chart.categories[index];
    const numeric = category === undefined ? Number.NaN : Number(category);
    return Number.isFinite(numeric) ? numeric : index + 1;
  });
}

/** The plot-group element(s) plus axes, in plot-area order. */
function plotGroup(chart: ChartDoc): XElement[] {
  switch (chart.chartType) {
    case "column":
    case "bar": {
      const horizontal = chart.chartType === "bar";
      return [
        new XElement(
          C.barChart,
          new XElement(C.barDir, attr("val", horizontal ? "bar" : "col")),
          new XElement(C.grouping, attr("val", "clustered")),
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          new XElement(C.gapWidth, attr("val", 150)),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        categoryAxis(horizontal ? "l" : "b"),
        valueAxis(horizontal ? "b" : "l"),
      ];
    }
    case "line":
      return [
        new XElement(
          C.lineChart,
          new XElement(C.grouping, attr("val", "standard")),
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(
                C.ser,
                seriesHeader(series, index),
                catVal(chart, series),
                new XElement(C.smooth, attr("val", 0)),
              ),
          ),
          new XElement(C.marker, attr("val", 1)),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        categoryAxis("b"),
        valueAxis("l"),
      ];
    case "area":
      return [
        new XElement(
          C.areaChart,
          new XElement(C.grouping, attr("val", "standard")),
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        categoryAxis("b"),
        valueAxis("l"),
      ];
    case "pie":
      return [
        new XElement(
          C.pieChart,
          new XElement(C.varyColors, attr("val", 1)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          new XElement(C.firstSliceAng, attr("val", 0)),
        ),
      ];
    case "doughnut":
      return [
        new XElement(
          C.doughnutChart,
          new XElement(C.varyColors, attr("val", 1)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          new XElement(C.firstSliceAng, attr("val", 0)),
          new XElement(C.holeSize, attr("val", 50)),
        ),
      ];
    case "scatter":
      return [
        new XElement(
          C.scatterChart,
          new XElement(C.scatterStyle, attr("val", "marker")),
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(
                C.ser,
                seriesHeader(series, index),
                noLine(),
                new XElement(C.xVal, numLit(scatterXValues(chart, series))),
                new XElement(C.yVal, numLit(series.values)),
                new XElement(C.smooth, attr("val", 0)),
              ),
          ),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        xValueAxis(),
        valueAxis("l"),
      ];
    case "radar":
      return [
        new XElement(
          C.radarChart,
          new XElement(C.radarStyle, attr("val", "standard")),
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        categoryAxis("b"),
        valueAxis("l"),
      ];
    case "bubble":
      return [
        new XElement(
          C.bubbleChart,
          new XElement(C.varyColors, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(
                C.ser,
                seriesHeader(series, index),
                new XElement(C.xVal, numLit(series.xValues ?? series.values.map((_, i) => i + 1))),
                new XElement(C.yVal, numLit(series.values)),
                new XElement(
                  C.bubbleSize,
                  numLit(series.bubbleSizes ?? series.values.map(() => 100)),
                ),
                new XElement(C.bubble3D, attr("val", 0)),
              ),
          ),
          new XElement(C.bubbleScale, attr("val", 100)),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        xValueAxis(),
        valueAxis("l"),
      ];
    case "stock":
      return [
        new XElement(
          C.stockChart,
          // High / Low / Close line series with hidden lines and markers.
          chart.series.map(
            (series, index) =>
              new XElement(
                C.ser,
                seriesHeader(series, index),
                noLine(),
                noMarker(),
                catVal(chart, series),
                new XElement(C.smooth, attr("val", 0)),
              ),
          ),
          new XElement(C.hiLowLines),
          axisIds(CAT_AX_ID, VAL_AX_ID),
        ),
        categoryAxis("b"),
        valueAxis("l"),
      ];
    case "surface":
      return [
        new XElement(
          C.surfaceChart,
          new XElement(C.wireframe, attr("val", 0)),
          chart.series.map(
            (series, index) =>
              new XElement(C.ser, seriesHeader(series, index), catVal(chart, series)),
          ),
          axisIds(CAT_AX_ID, VAL_AX_ID, SER_AX_ID),
        ),
        categoryAxis("b"),
        valueAxis("l"),
        seriesAxis(),
      ];
  }
}

function titleElements(chart: ChartDoc): XElement[] {
  if (!chart.title) {
    return [new XElement(C.autoTitleDeleted, attr("val", 1))];
  }
  return [
    new XElement(
      C.title,
      new XElement(
        C.tx,
        new XElement(
          C.rich,
          new XElement(A.bodyPr),
          new XElement(A.lstStyle),
          new XElement(A.p, new XElement(A.r, new XElement(A.t, chart.title))),
        ),
      ),
      new XElement(C.overlay, attr("val", 0)),
    ),
    new XElement(C.autoTitleDeleted, attr("val", 0)),
  ];
}

/** Contour-style view for surface charts (`rotX` 90 looks straight down). */
function view3D(chart: ChartDoc): XElement | null {
  if (chart.chartType !== "surface") {
    return null;
  }
  return new XElement(
    C.view3D,
    new XElement(C.rotX, attr("val", 90)),
    new XElement(C.rotY, attr("val", 0)),
    new XElement(C.rAngAx, attr("val", 0)),
    new XElement(C.perspective, attr("val", 0)),
  );
}

export function buildChart(chart: ChartDoc): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      C.chartSpace,
      xmlnsDecl("c", C.namespace.namespaceName),
      xmlnsDecl("a", A.namespace.namespaceName),
      xmlnsDecl("r", R.namespace.namespaceName),
      new XElement(C.lang, attr("val", "ja-JP")),
      new XElement(C.roundedCorners, attr("val", 0)),
      chart.style === undefined ? null : new XElement(C.style, attr("val", chart.style)),
      new XElement(
        C.chart,
        titleElements(chart),
        view3D(chart),
        new XElement(C.plotArea, new XElement(C.layout), plotGroup(chart)),
        chart.showLegend
          ? new XElement(
              C.legend,
              new XElement(C.legendPos, attr("val", "r")),
              new XElement(C.overlay, attr("val", 0)),
            )
          : null,
        new XElement(C.plotVisOnly, attr("val", 1)),
        new XElement(C.dispBlanksAs, attr("val", "gap")),
      ),
    ),
  );
}
