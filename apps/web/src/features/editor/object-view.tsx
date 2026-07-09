"use client";

import type { CSSProperties } from "react";

import { ChartPreview } from "./chart-preview";
import { fontDefinition, segmentByStyle } from "./fonts";
import { connectorRoutePoints } from "./geometry";
import { shapeDefinition } from "./shape-defs";
import type {
  ArrowEnd,
  ConnectorObject,
  GroupObject,
  ImageObject,
  ShapeObject,
  SlideObject,
  TextContent,
  TextVAlign,
} from "./types";

export const VERTICAL_ALIGN_TO_FLEX: Record<TextVAlign, CSSProperties["justifyContent"]> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

function TextBlock({ content }: { content: TextContent }) {
  if (!content.text) {
    return null;
  }
  // Consecutive same-style characters render as one span; newlines stay
  // inside segments and are honored by white-space: pre-wrap.
  const segments = segmentByStyle(content, content.text, 0);
  return (
    <div
      className="pointer-events-none absolute inset-0 flex flex-col overflow-hidden px-2 py-1"
      style={{ justifyContent: VERTICAL_ALIGN_TO_FLEX[content.verticalAlign] }}
    >
      <div
        className="w-full whitespace-pre-wrap break-words"
        style={{ textAlign: content.align, lineHeight: 1.25 }}
      >
        {segments.map((segment, index) => (
          <span
            key={index}
            style={{
              fontFamily: fontDefinition(segment.style.fontFamily)?.css,
              fontSize: segment.style.fontSize,
              color: segment.style.color,
              fontWeight: segment.style.bold ? 700 : 400,
              fontStyle: segment.style.italic ? "italic" : "normal",
            }}
          >
            {segment.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShapeSvg({ object }: { object: ShapeObject }) {
  const definition = shapeDefinition(object.shape);
  const stroke = object.outlineWidth > 0 ? object.outlineColor : "none";
  const strokeWidth = object.outlineWidth;
  const width = Math.max(1, object.width);
  const height = Math.max(1, object.height);

  // Matches how PowerPoint draws a:ln: the geometry keeps its full size and
  // the stroke straddles the outline (half inside, half outside), so the
  // border stays perfectly uniform for any shape. The svg must not clip
  // (overflow visible) or the outer half would be cut off unevenly; round
  // joins keep sharp vertices (star points etc.) from being flattened by
  // the default miter limit.
  const strokeProps = {
    fill: object.fill,
    stroke,
    strokeWidth,
    strokeLinejoin: "round",
  } as const;

  let element: React.ReactNode;
  if (object.shape === "ellipse") {
    element = (
      <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} {...strokeProps} />
    );
  } else if (definition.polygon) {
    const points = definition.polygon.map(([px, py]) => `${px * width},${py * height}`).join(" ");
    element = <polygon points={points} {...strokeProps} />;
  } else {
    // PowerPoint's roundRect default corner radius is adj=16667 (1/6 of the
    // shorter side).
    const radius = object.shape === "roundRect" ? Math.min(width, height) / 6 : 0;
    element = <rect x={0} y={0} width={width} height={height} rx={radius} {...strokeProps} />;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      {element}
    </svg>
  );
}

const ARROW_MARKER_SIZE: Record<ArrowEnd["size"], number> = {
  small: 4,
  medium: 6.5,
  large: 9,
};

/** SVG marker element for an arrowhead, or null when the end has none. */
function arrowMarker(id: string, arrow: ArrowEnd, color: string): React.ReactNode {
  if (arrow.type === "none") {
    return null;
  }
  const size = ARROW_MARKER_SIZE[arrow.size];
  // viewBox 0 0 10 10, pointing right (tip at x=10); auto-start-reverse
  // flips it for the start end.
  let shape: React.ReactNode;
  let refX = 9;
  switch (arrow.type) {
    case "triangle":
      shape = <path d="M0,0 L10,5 L0,10 Z" fill={color} />;
      break;
    case "stealth":
      shape = <path d="M0,0 L10,5 L0,10 L3,5 Z" fill={color} />;
      break;
    case "arrow":
      shape = <path d="M0,1 L10,5 L0,9" fill="none" stroke={color} strokeWidth={2} />;
      break;
    case "diamond":
      shape = <path d="M5,0 L10,5 L5,10 L0,5 Z" fill={color} />;
      refX = 5;
      break;
    case "oval":
      shape = <circle cx={5} cy={5} r={4.5} fill={color} />;
      refX = 5;
      break;
    default:
      return null;
  }
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX={refX}
      refY={5}
      markerWidth={size}
      markerHeight={size}
      orient="auto-start-reverse"
    >
      {shape}
    </marker>
  );
}

/**
 * Connector rendering: a straight segment, or an orthogonal route whose
 * corner count adapts to the endpoint geometry (see `connectorRoutePoints`),
 * drawn in the connector's own frame (local coordinates).
 */
function ConnectorView({ object }: { object: ConnectorObject }) {
  const width = Math.max(1, object.width);
  const height = Math.max(1, object.height);
  const points = connectorRoutePoints(object);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x - object.x} ${point.y - object.y}`)
    .join(" ");
  const startId = `connector-arrow-start-${object.id}`;
  const endId = `connector-arrow-end-${object.id}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      <defs>
        {arrowMarker(startId, object.startArrow, object.lineColor)}
        {arrowMarker(endId, object.endArrow, object.lineColor)}
      </defs>
      <path
        d={path}
        fill="none"
        stroke={object.lineColor}
        strokeWidth={object.lineWidth}
        strokeLinejoin="round"
        markerStart={object.startArrow.type === "none" ? undefined : `url(#${startId})`}
        markerEnd={object.endArrow.type === "none" ? undefined : `url(#${endId})`}
      />
    </svg>
  );
}

export function ObjectContent({
  object,
  hideTextObjectId,
}: {
  object: SlideObject;
  /** Text of this object is hidden while it is being edited in place. */
  hideTextObjectId?: string;
}) {
  const textHidden = object.id === hideTextObjectId;
  switch (object.type) {
    case "shape":
      return (
        <>
          <ShapeSvg object={object} />
          {textHidden ? null : <TextBlock content={object.text} />}
        </>
      );
    case "text":
      return textHidden ? null : <TextBlock content={object.text} />;
    case "chart":
      return <ChartPreview chart={object} />;
    case "group":
      return <GroupContent group={object} hideTextObjectId={hideTextObjectId} />;
    case "connector":
      return <ConnectorView object={object} />;
    case "image":
      return <ImageView object={object} />;
    default:
      return null;
  }
}

function ImageView({ object }: { object: ImageObject }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URL, no optimization needed
    <img
      src={`data:${object.mimeType};base64,${object.dataBase64}`}
      alt={object.name}
      draggable={false}
      className="pointer-events-none h-full w-full select-none"
      style={{ objectFit: "fill" }}
    />
  );
}

function GroupContent({
  group,
  hideTextObjectId,
}: {
  group: GroupObject;
  hideTextObjectId?: string;
}) {
  // Children carry absolute slide coordinates; offset them into the group's
  // local frame for rendering.
  return (
    <div className="absolute inset-0">
      {group.children.map((child) => (
        <div
          key={child.id}
          className="absolute"
          style={{
            left: child.x - group.x,
            top: child.y - group.y,
            width: child.width,
            height: child.height,
          }}
        >
          <ObjectContent object={child} hideTextObjectId={hideTextObjectId} />
        </div>
      ))}
    </div>
  );
}
