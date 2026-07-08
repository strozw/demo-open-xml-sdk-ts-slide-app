"use client";

import type { CSSProperties } from "react";

import { ChartPreview } from "./chart-preview";
import { fontDefinition, segmentByStyle } from "./fonts";
import { shapeDefinition } from "./shape-defs";
import type { GroupObject, ShapeObject, SlideObject, TextContent, TextVAlign } from "./types";

const VERTICAL_ALIGN_TO_FLEX: Record<TextVAlign, CSSProperties["justifyContent"]> = {
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

  let element: React.ReactNode;
  if (object.shape === "ellipse") {
    element = (
      <ellipse
        cx={width / 2}
        cy={height / 2}
        rx={width / 2 - strokeWidth / 2}
        ry={height / 2 - strokeWidth / 2}
        fill={object.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  } else if (definition.polygon) {
    const points = definition.polygon.map(([px, py]) => `${px * width},${py * height}`).join(" ");
    element = (
      <polygon points={points} fill={object.fill} stroke={stroke} strokeWidth={strokeWidth} />
    );
  } else {
    // PowerPoint's roundRect default corner radius is adj=16667 (1/6 of the
    // shorter side).
    const radius = object.shape === "roundRect" ? Math.min(width, height) / 6 : 0;
    element = (
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={width - strokeWidth}
        height={height - strokeWidth}
        rx={radius}
        fill={object.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none">
      {element}
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
