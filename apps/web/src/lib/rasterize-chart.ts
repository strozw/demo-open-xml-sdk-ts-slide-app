/**
 * Renders a chart to a PNG in the browser by rasterizing the same SVG the
 * editor shows as its live preview (`ChartPreview`), so the exported image
 * matches the in-app appearance exactly.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartPreview } from "@/features/editor/chart-preview";
import type { ChartObject } from "@/features/editor/types";

/**
 * Produces raw PNG bytes as base64 (no `data:` prefix) at `scale`× the
 * chart's canvas size. Injectable so non-browser callers (the validation
 * script) can substitute a stub.
 */
export type ChartRasterizer = (chart: ChartObject, scale?: number) => Promise<string>;

export const rasterizeChartToPng: ChartRasterizer = async (chart, scale = 2) => {
  const markup = renderToStaticMarkup(createElement(ChartPreview, { chart }));

  // The preview svg sizes itself with width/height="100%"; an <img> needs
  // explicit pixel dimensions to rasterize at the right resolution.
  const svgDocument = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = svgDocument.documentElement;
  svg.setAttribute("width", String(chart.width));
  svg.setAttribute("height", String(chart.height));
  const source = new XMLSerializer().serializeToString(svg);

  const image = new Image();
  // encodeURIComponent keeps non-Latin-1 text (Japanese labels) intact.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("チャート画像のレンダリングに失敗しました")),
      { once: true },
    );
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(chart.width * scale));
  canvas.height = Math.max(1, Math.round(chart.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas 2D コンテキストを取得できませんでした");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
};
