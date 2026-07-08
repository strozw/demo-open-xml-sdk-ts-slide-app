"use client";

import type { ChartObject, ChartSeries } from "./types";

/** Office theme accent1-6 — the colors PowerPoint chart styles cycle through. */
const ACCENT_COLORS = ["#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"];

const GRAYSCALE_COLORS = ["#7f7f7f", "#a5a5a5", "#c9c9c9", "#8c8c8c", "#b7b7b7", "#d9d9d9"];

function parseHexColor(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function mixColor(hex: string, target: string, ratio: number): string {
  const [r1, g1, b1] = parseHexColor(hex);
  const [r2, g2, b2] = parseHexColor(target);
  const channel = (a: number, b: number) =>
    Math.round(a + (b - a) * ratio)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}

function monochromeShades(base: string): string[] {
  return [
    base,
    mixColor(base, "#ffffff", 0.35),
    mixColor(base, "#000000", 0.25),
    mixColor(base, "#ffffff", 0.6),
    mixColor(base, "#000000", 0.45),
    mixColor(base, "#ffffff", 0.15),
  ];
}

export interface ChartTheme {
  /** Series color cycle derived from the chart style column. */
  colors: string[];
  /** Chart area background derived from the chart style row. */
  background: string;
  border: string;
  text: string;
  axis: string;
  grid: string;
}

/**
 * Approximates PowerPoint's classic chart styles (`c:style` 1-48): the
 * column `(style-1) % 8` picks the color scheme (grays, multi-accent,
 * accent1-6 monochrome) and the last two rows use gray / dark backgrounds.
 */
export function chartTheme(style: number | undefined): ChartTheme {
  const light = {
    background: "#ffffff",
    border: "#e4e4e7",
    text: "#3f3f46",
    axis: "#a1a1aa",
    grid: "#d4d4d8",
  };
  if (style === undefined || style < 1 || style > 48) {
    return { colors: ACCENT_COLORS, ...light };
  }
  const column = (style - 1) % 8;
  const row = Math.floor((style - 1) / 8);
  const colors =
    column === 0
      ? GRAYSCALE_COLORS
      : column === 1
        ? ACCENT_COLORS
        : monochromeShades(ACCENT_COLORS[column - 2]!);
  if (row === 4) {
    return { colors, ...light, background: "#f2f2f2", border: "#d4d4d8" };
  }
  if (row === 5) {
    return {
      colors,
      background: "#262626",
      border: "#171717",
      text: "#e5e5e5",
      axis: "#737373",
      grid: "#404040",
    };
  }
  return { colors, ...light };
}

interface PlotFrame {
  left: number;
  top: number;
  plotWidth: number;
  plotHeight: number;
}

interface SeriesProps {
  chart: ChartObject;
  frame: PlotFrame;
  theme: ChartTheme;
}

interface AxisScale {
  /** Axis maximum, rounded up to the next "nice" step like PowerPoint does. */
  max: number;
  ticks: number[];
}

/** PowerPoint-style automatic axis scale: steps of 1/2/5 × 10^n from zero. */
function axisScale(rawMax: number): AxisScale {
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return { max: 1, ticks: [0, 0.5, 1] };
  }
  const roughStep = rawMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  const step = magnitude * (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1);
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }
  return { max, ticks };
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function valueScale(chart: ChartObject): AxisScale {
  return axisScale(Math.max(0, ...chart.series.flatMap((s) => s.values)));
}

/** Value-axis maximum; plots scale to this so bars line up with the ticks. */
function maxValue(chart: ChartObject): number {
  return valueScale(chart).max;
}

function ColumnBars({ chart, frame, theme }: SeriesProps) {
  const { left, top, plotWidth, plotHeight } = frame;
  const max = maxValue(chart);
  const categoryCount = Math.max(1, chart.categories.length);
  const groupWidth = plotWidth / categoryCount;
  const barWidth = (groupWidth * 0.7) / Math.max(1, chart.series.length);
  return (
    <g>
      {chart.series.map((series, si) =>
        series.values.slice(0, categoryCount).map((value, ci) => {
          const height = Math.max(0, (value / max) * plotHeight);
          return (
            <rect
              key={`${si}-${ci}`}
              x={left + ci * groupWidth + groupWidth * 0.15 + si * barWidth}
              y={top + plotHeight - height}
              width={Math.max(1, barWidth - 2)}
              height={height}
              fill={theme.colors[si % theme.colors.length]}
            />
          );
        }),
      )}
    </g>
  );
}

function HorizontalBars({ chart, frame, theme }: SeriesProps) {
  const { left, top, plotWidth, plotHeight } = frame;
  const max = maxValue(chart);
  const categoryCount = Math.max(1, chart.categories.length);
  const groupHeight = plotHeight / categoryCount;
  const barHeight = (groupHeight * 0.7) / Math.max(1, chart.series.length);
  return (
    <g>
      {chart.series.map((series, si) =>
        series.values
          .slice(0, categoryCount)
          .map((value, ci) => (
            <rect
              key={`${si}-${ci}`}
              x={left}
              y={top + ci * groupHeight + groupHeight * 0.15 + si * barHeight}
              width={Math.max(0, (value / max) * plotWidth)}
              height={Math.max(1, barHeight - 2)}
              fill={theme.colors[si % theme.colors.length]}
            />
          )),
      )}
    </g>
  );
}

function seriesPoints(
  values: readonly number[],
  count: number,
  max: number,
  frame: PlotFrame,
): [number, number][] {
  const { left, top, plotWidth, plotHeight } = frame;
  const step = count <= 1 ? 0 : plotWidth / (count - 1);
  return values
    .slice(0, count)
    .map((value, index) => [left + index * step, top + plotHeight - (value / max) * plotHeight]);
}

function LineSeries({ chart, frame, theme, filled }: SeriesProps & { filled: boolean }) {
  const max = maxValue(chart);
  const count = Math.max(1, chart.categories.length);
  return (
    <g>
      {chart.series.map((series, si) => {
        const points = seriesPoints(series.values, count, max, frame);
        const color = theme.colors[si % theme.colors.length];
        const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
        const area = `${path} L${frame.left + frame.plotWidth},${frame.top + frame.plotHeight} L${frame.left},${frame.top + frame.plotHeight} Z`;
        return (
          <g key={si}>
            {filled ? <path d={area} fill={color} opacity={0.45} /> : null}
            <path d={path} fill="none" stroke={color} strokeWidth={2.5} />
            {points.map(([x, y], pi) => (
              <circle key={pi} cx={x} cy={y} r={3} fill={color} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

function ScatterSeries({ chart, frame, theme }: SeriesProps) {
  const max = maxValue(chart);
  const count = Math.max(1, chart.categories.length);
  return (
    <g>
      {chart.series.map((series, si) =>
        seriesPoints(series.values, count, max, frame).map(([x, y], pi) => (
          <circle
            key={`${si}-${pi}`}
            cx={x}
            cy={y}
            r={4.5}
            fill={theme.colors[si % theme.colors.length]}
          />
        )),
      )}
    </g>
  );
}

function bubblePoints(series: ChartSeries): { x: number; y: number; size: number }[] {
  return series.values.map((y, i) => ({
    x: series.xValues?.[i] ?? i + 1,
    y,
    size: series.bubbleSizes?.[i] ?? 100,
  }));
}

/** Shared X/Y axis scales so the bubble plot and its tick labels agree. */
function bubbleScales(chart: ChartObject): { x: AxisScale; y: AxisScale } {
  const flat = chart.series.flatMap(bubblePoints);
  return {
    x: axisScale(Math.max(0, ...flat.map((p) => p.x))),
    y: axisScale(Math.max(0, ...flat.map((p) => p.y))),
  };
}

function BubbleSeries({ chart, frame, theme }: SeriesProps) {
  const points = chart.series.map(bubblePoints);
  const flat = points.flat();
  const { x, y } = bubbleScales(chart);
  const maxX = x.max;
  const maxY = y.max;
  const maxSize = Math.max(1, ...flat.map((p) => p.size));
  const maxRadius = Math.min(frame.plotWidth, frame.plotHeight) / 7;
  return (
    <g>
      {points.map((seriesPointsList, si) =>
        seriesPointsList.map((point, pi) => (
          <circle
            key={`${si}-${pi}`}
            cx={frame.left + (point.x / maxX) * frame.plotWidth}
            cy={frame.top + frame.plotHeight - (point.y / maxY) * frame.plotHeight}
            r={Math.max(3, Math.sqrt(point.size / maxSize) * maxRadius)}
            fill={theme.colors[si % theme.colors.length]}
            opacity={0.75}
          />
        )),
      )}
    </g>
  );
}

/** High-low bars with a close tick, reading the series in High/Low/Close order. */
function StockSeries({ chart, frame, theme }: SeriesProps) {
  const max = maxValue(chart);
  const count = Math.max(1, chart.categories.length);
  const [high, low, close] = chart.series;
  const step = frame.plotWidth / count;
  const yFor = (value: number) => frame.top + frame.plotHeight - (value / max) * frame.plotHeight;
  const closeColor = theme.colors[1 % theme.colors.length];
  return (
    <g>
      {Array.from({ length: count }, (_, ci) => {
        const x = frame.left + step * (ci + 0.5);
        const highValue = high?.values[ci];
        const lowValue = low?.values[ci];
        const closeValue = close?.values[ci];
        return (
          <g key={ci}>
            {highValue !== undefined && lowValue !== undefined ? (
              <line
                x1={x}
                y1={yFor(highValue)}
                x2={x}
                y2={yFor(lowValue)}
                stroke={theme.text}
                strokeWidth={1.5}
              />
            ) : null}
            {closeValue !== undefined ? (
              <line
                x1={x - 4}
                y1={yFor(closeValue)}
                x2={x + 4}
                y2={yFor(closeValue)}
                stroke={closeColor}
                strokeWidth={2.5}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/** Approximates a surface chart as translucent stacked bands per series. */
function SurfaceSeries({ chart, frame, theme }: SeriesProps) {
  const max = maxValue(chart);
  const count = Math.max(1, chart.categories.length);
  return (
    <g>
      {chart.series.map((series, si) => {
        const points = seriesPoints(series.values, count, max, frame);
        const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
        const area = `${path} L${frame.left + frame.plotWidth},${frame.top + frame.plotHeight} L${frame.left},${frame.top + frame.plotHeight} Z`;
        const color = theme.colors[si % theme.colors.length];
        return (
          <g key={si}>
            <path d={area} fill={color} opacity={0.55} />
            <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
          </g>
        );
      })}
    </g>
  );
}

function polarPoint(cx: number, cy: number, radius: number, fraction: number): [number, number] {
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function PieSlices({ chart, frame, theme, doughnut }: SeriesProps & { doughnut: boolean }) {
  const values = chart.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
  const cx = frame.left + frame.plotWidth / 2;
  const cy = frame.top + frame.plotHeight / 2;
  const radius = Math.min(frame.plotWidth, frame.plotHeight) / 2;
  const segments: { start: number; end: number }[] = [];
  for (const value of values) {
    const start = segments.at(-1)?.end ?? 0;
    segments.push({ start, end: start + Math.max(0, value) / total });
  }
  return (
    <g>
      {segments.map(({ start, end }, index) => {
        const [sx, sy] = polarPoint(cx, cy, radius, start);
        const [ex, ey] = polarPoint(cx, cy, radius, end);
        const largeArc = end - start > 0.5 ? 1 : 0;
        return (
          <path
            key={index}
            d={`M${cx},${cy} L${sx},${sy} A${radius},${radius} 0 ${largeArc} 1 ${ex},${ey} Z`}
            fill={theme.colors[index % theme.colors.length]}
            stroke={theme.background}
            strokeWidth={1.5}
          />
        );
      })}
      {doughnut ? <circle cx={cx} cy={cy} r={radius * 0.5} fill={theme.background} /> : null}
    </g>
  );
}

function RadarSeries({ chart, frame, theme }: SeriesProps) {
  const max = maxValue(chart);
  const count = Math.max(3, chart.categories.length);
  const cx = frame.left + frame.plotWidth / 2;
  const cy = frame.top + frame.plotHeight / 2;
  const radius = Math.min(frame.plotWidth, frame.plotHeight) / 2;
  const spokes = Array.from({ length: count }, (_, i) => polarPoint(cx, cy, radius, i / count));
  return (
    <g>
      {[0.33, 0.66, 1].map((ring) => (
        <polygon
          key={ring}
          points={Array.from({ length: count }, (_, i) =>
            polarPoint(cx, cy, radius * ring, i / count).join(","),
          ).join(" ")}
          fill="none"
          stroke={theme.grid}
        />
      ))}
      {spokes.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={theme.grid} />
      ))}
      {chart.series.map((series, si) => (
        <polygon
          key={si}
          points={Array.from({ length: count }, (_, i) =>
            polarPoint(cx, cy, ((series.values[i] ?? 0) / max) * radius, i / count).join(","),
          ).join(" ")}
          fill={theme.colors[si % theme.colors.length]}
          fillOpacity={0.25}
          stroke={theme.colors[si % theme.colors.length]}
          strokeWidth={2}
        />
      ))}
    </g>
  );
}

function CategoryLabels({
  chart,
  frame,
  theme,
  horizontal,
}: SeriesProps & { horizontal: boolean }) {
  const count = chart.categories.length;
  if (count === 0) {
    return null;
  }
  return (
    <g>
      {chart.categories.map((category, index) =>
        horizontal ? (
          <text
            key={index}
            x={frame.left - 4}
            y={frame.top + (frame.plotHeight / count) * (index + 0.5) + 3}
            textAnchor="end"
            fontSize={9}
            fill={theme.text}
          >
            {category}
          </text>
        ) : (
          <text
            key={index}
            x={frame.left + (frame.plotWidth / count) * (index + 0.5)}
            y={frame.top + frame.plotHeight + 12}
            textAnchor="middle"
            fontSize={9}
            fill={theme.text}
          >
            {category}
          </text>
        ),
      )}
    </g>
  );
}

/**
 * Value-axis tick labels. The exporter emits the axes without scale options,
 * so PowerPoint auto-computes the ticks — this mirrors that automatic scale.
 */
function ValueTicks({
  frame,
  theme,
  scale,
  horizontal,
}: {
  frame: PlotFrame;
  theme: ChartTheme;
  scale: AxisScale;
  horizontal: boolean;
}) {
  return (
    <g>
      {scale.ticks.map((tick) =>
        horizontal ? (
          <text
            key={tick}
            x={frame.left + (tick / scale.max) * frame.plotWidth}
            y={frame.top + frame.plotHeight + 12}
            textAnchor="middle"
            fontSize={9}
            fill={theme.text}
          >
            {formatTick(tick)}
          </text>
        ) : (
          <text
            key={tick}
            x={frame.left - 4}
            y={frame.top + frame.plotHeight - (tick / scale.max) * frame.plotHeight + 3}
            textAnchor="end"
            fontSize={9}
            fill={theme.text}
          >
            {formatTick(tick)}
          </text>
        ),
      )}
    </g>
  );
}

/** Lightweight SVG approximation of how PowerPoint renders the chart. */
export function ChartPreview({ chart }: { chart: ChartObject }) {
  const theme = chartTheme(chart.style);
  const width = Math.max(40, chart.width);
  const height = Math.max(40, chart.height);
  const titleHeight = chart.title ? 26 : 8;
  const legendHeight = chart.showLegend ? 22 : 6;
  const polar = chart.chartType === "pie" || chart.chartType === "doughnut";
  const axisChart = !polar && chart.chartType !== "radar";
  const isBar = chart.chartType === "bar";
  const isBubble = chart.chartType === "bubble";
  const hasCategoryAxis = axisChart && !isBubble;
  const catLabelHeight = hasCategoryAxis && chart.categories.length > 0 ? 14 : 0;
  // Vertical ticks for every axis chart except bar (its value axis is
  // horizontal); bubble additionally labels the numeric X axis.
  const verticalScale =
    axisChart && !isBar ? (isBubble ? bubbleScales(chart).y : valueScale(chart)) : undefined;
  const horizontalScale = isBar ? valueScale(chart) : isBubble ? bubbleScales(chart).x : undefined;
  const tickChars = verticalScale
    ? Math.max(...verticalScale.ticks.map((tick) => formatTick(tick).length))
    : 0;
  const leftMargin = polar ? 16 : isBar ? 52 : Math.max(34, tickChars * 5.5 + 10);
  const bottomLabelHeight = isBar || isBubble ? 14 : catLabelHeight;
  const frame: PlotFrame = {
    left: leftMargin,
    top: titleHeight + 4,
    plotWidth: width - leftMargin - (polar ? 16 : 10),
    plotHeight: height - titleHeight - legendHeight - 14 - bottomLabelHeight,
  };
  const legendLabels = polar ? chart.categories : chart.series.map((s) => s.name);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      role="img"
      aria-label={chart.title || "chart"}
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={theme.background}
        stroke={theme.border}
      />
      {chart.title ? (
        <text
          x={width / 2}
          y={17}
          textAnchor="middle"
          fontSize={13}
          fontWeight={600}
          fill={theme.text}
        >
          {chart.title}
        </text>
      ) : null}
      {axisChart ? (
        <g stroke={theme.axis} strokeWidth={1}>
          <line x1={frame.left} y1={frame.top} x2={frame.left} y2={frame.top + frame.plotHeight} />
          <line
            x1={frame.left}
            y1={frame.top + frame.plotHeight}
            x2={frame.left + frame.plotWidth}
            y2={frame.top + frame.plotHeight}
          />
        </g>
      ) : null}
      {chart.chartType === "column" ? (
        <ColumnBars chart={chart} frame={frame} theme={theme} />
      ) : null}
      {chart.chartType === "bar" ? (
        <HorizontalBars chart={chart} frame={frame} theme={theme} />
      ) : null}
      {chart.chartType === "line" ? (
        <LineSeries chart={chart} frame={frame} theme={theme} filled={false} />
      ) : null}
      {chart.chartType === "area" ? (
        <LineSeries chart={chart} frame={frame} theme={theme} filled />
      ) : null}
      {chart.chartType === "scatter" ? (
        <ScatterSeries chart={chart} frame={frame} theme={theme} />
      ) : null}
      {chart.chartType === "bubble" ? (
        <BubbleSeries chart={chart} frame={frame} theme={theme} />
      ) : null}
      {chart.chartType === "stock" ? (
        <StockSeries chart={chart} frame={frame} theme={theme} />
      ) : null}
      {chart.chartType === "surface" ? (
        <SurfaceSeries chart={chart} frame={frame} theme={theme} />
      ) : null}
      {polar ? (
        <PieSlices
          chart={chart}
          frame={frame}
          theme={theme}
          doughnut={chart.chartType === "doughnut"}
        />
      ) : null}
      {chart.chartType === "radar" ? (
        <RadarSeries chart={chart} frame={frame} theme={theme} />
      ) : null}
      {hasCategoryAxis ? (
        <CategoryLabels chart={chart} frame={frame} theme={theme} horizontal={isBar} />
      ) : null}
      {verticalScale ? (
        <ValueTicks frame={frame} theme={theme} scale={verticalScale} horizontal={false} />
      ) : null}
      {horizontalScale ? (
        <ValueTicks frame={frame} theme={theme} scale={horizontalScale} horizontal />
      ) : null}
      {chart.showLegend ? (
        <g>
          {legendLabels.map((label, index) => {
            const itemWidth = 74;
            const startX = width / 2 - (legendLabels.length * itemWidth) / 2;
            return (
              <g key={index} transform={`translate(${startX + index * itemWidth}, ${height - 16})`}>
                <rect width={9} height={9} fill={theme.colors[index % theme.colors.length]} />
                <text x={13} y={8.5} fontSize={10.5} fill={theme.text}>
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
    </svg>
  );
}
