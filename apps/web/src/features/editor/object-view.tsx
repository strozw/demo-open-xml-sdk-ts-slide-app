"use client";

import type { CSSProperties } from "react";

import { ChartPreview } from "./chart-preview";
import { fontDefinition, segmentByStyle } from "./fonts";
import { shapeDefinition } from "./shape-defs";
import type {
  ConnectorObject,
  GroupObject,
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

/**
 * Connector rendering: a straight line or an H-V-H elbow (matching
 * bentConnector3 with its default 50% bend) between the derived endpoints,
 * drawn in the connector's own frame (local coordinates).
 */
function ConnectorView({ object }: { object: ConnectorObject }) {
  const width = Math.max(1, object.width);
  const height = Math.max(1, object.height);
  const sx = object.startPoint.x - object.x;
  const sy = object.startPoint.y - object.y;
  const ex = object.endPoint.x - object.x;
  const ey = object.endPoint.y - object.y;
  const midX = (sx + ex) / 2;
  const path =
    object.connectorType === "bent"
      ? `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ey} L ${ex} ${ey}`
      : `M ${sx} ${sy} L ${ex} ${ey}`;
  const markerId = `connector-arrow-${object.id}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      {object.arrowEnd ? (
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={object.lineColor} />
          </marker>
        </defs>
      ) : null}
      <path
        d={path}
        fill="none"
        stroke={object.lineColor}
        strokeWidth={object.lineWidth}
        strokeLinejoin="round"
        markerEnd={object.arrowEnd ? `url(#${markerId})` : undefined}
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
    default:
      return null;
  }
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
