"use client";

import * as React from "react";

import {
  hitChain,
  maxSelectedDepth,
  normalizeRect,
  objectBounds,
  pointInRect,
  rectsIntersect,
  sitePoint,
  siteToward,
  connectorHandles,
  connectorRoutePoints,
  type ConnectorHandleKind,
} from "./geometry";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu";

import { fontDefinition, remapCharStyles, segmentByStyle } from "./fonts";
import { ObjectContextMenuItems } from "./object-context-menu";
import { ObjectContent, VERTICAL_ALIGN_TO_FLEX } from "./object-view";
import {
  findObjectDeep,
  useCurrentSlide,
  useEditorDispatch,
  useEditorState,
  useSelectedObjects,
} from "./store";
import {
  createId,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type ConnectionSite,
  type ConnectorEndpoint,
  type ConnectorObject,
  type Rect,
  type ShapeObject,
  type SlideObject,
  type TextObject,
} from "./types";

const CONNECTION_SITES: readonly ConnectionSite[] = ["top", "right", "bottom", "left"];

/** Re-attach target while dragging a connector endpoint. */
interface ConnectorDropCandidate {
  objectId: string;
  site: ConnectionSite;
  point: Point;
  bounds: Rect;
}

interface ConnectorDrag {
  connectorId: string;
  endpoint: "start" | "end";
  point: Point;
  candidate: ConnectorDropCandidate | null;
}

/** Connection sites of a hover candidate; the nearest one is emphasized. */
function CandidateSites({ candidate }: { candidate: ConnectorDropCandidate }) {
  return (
    <>
      {CONNECTION_SITES.map((site) => {
        const point = sitePoint(candidate.bounds, site);
        const active = site === candidate.site;
        return (
          <circle
            key={site}
            cx={point.x}
            cy={point.y}
            r={active ? 6 : 4}
            fill={active ? "#2563eb" : "#ffffff"}
            stroke="#2563eb"
            strokeWidth={1.5}
          />
        );
      })}
    </>
  );
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const RESIZE_HANDLES: readonly { handle: ResizeHandle; left: number; top: number }[] = [
  { handle: "nw", left: 0, top: 0 },
  { handle: "n", left: 0.5, top: 0 },
  { handle: "ne", left: 1, top: 0 },
  { handle: "e", left: 1, top: 0.5 },
  { handle: "se", left: 1, top: 1 },
  { handle: "s", left: 0.5, top: 1 },
  { handle: "sw", left: 0, top: 1 },
  { handle: "w", left: 0, top: 0.5 },
];

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const MIN_OBJECT_SIZE = 24;

interface Point {
  x: number;
  y: number;
}

/**
 * Pointer-session bookkeeping lives in a ref (mutated only inside event
 * handlers) so rapid pointermove events never read stale React state; only
 * the marquee rectangle is mirrored into state because it is rendered.
 */
type PointerSession =
  | { mode: "idle" }
  | { mode: "marquee"; start: Point }
  | { mode: "move"; last: Point }
  | { mode: "resize"; objectId: string; handle: ResizeHandle; startFrame: Rect; start: Point }
  | { mode: "connector-endpoint" }
  | { mode: "connector-handle"; connectorId: string; handleKind: ConnectorHandleKind }
  | { mode: "draw-line"; start: Point };

function resizeFrame(startFrame: Rect, handle: ResizeHandle, dx: number, dy: number): Rect {
  let { x, y, width, height } = startFrame;
  if (handle.includes("e")) {
    width = Math.max(MIN_OBJECT_SIZE, startFrame.width + dx);
  }
  if (handle.includes("s")) {
    height = Math.max(MIN_OBJECT_SIZE, startFrame.height + dy);
  }
  if (handle.includes("w")) {
    width = Math.max(MIN_OBJECT_SIZE, startFrame.width - dx);
    x = startFrame.x + startFrame.width - width;
  }
  if (handle.includes("n")) {
    height = Math.max(MIN_OBJECT_SIZE, startFrame.height - dy);
    y = startFrame.y + startFrame.height - height;
  }
  return { x, y, width, height };
}

export function SlideCanvas() {
  const slide = useCurrentSlide();
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selectedObjects = useSelectedObjects();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const editingTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  const sessionRef = React.useRef<PointerSession>({ mode: "idle" });
  const [scale, setScale] = React.useState(0.6);
  const [marquee, setMarquee] = React.useState<{ start: Point; current: Point } | null>(null);
  const [connectorDrag, setConnectorDrag] = React.useState<ConnectorDrag | null>(null);
  const [drawing, setDrawing] = React.useState<{ start: Point; current: Point } | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      const next = Math.min((width - 48) / SLIDE_WIDTH, (height - 48) / SLIDE_HEIGHT);
      setScale(Math.max(0.1, Math.min(next, 1.5)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const toSlidePoint = (event: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / scale,
      y: (event.clientY - rect.top) / scale,
    };
  };

  const marqueeRect = marquee ? normalizeRect(marquee.start, marquee.current) : null;

  const marqueeHits = new Set<string>();
  if (marqueeRect) {
    for (const object of slide.objects) {
      if (rectsIntersect(marqueeRect, objectBounds(object))) {
        marqueeHits.add(object.id);
      }
    }
  }
  const selectedSet = new Set(state.selectedIds);

  /** Starts drawing a line with the armed tool from the given slide point. */
  const beginDrawLine = (event: React.PointerEvent<HTMLDivElement>) => {
    canvasRef.current?.setPointerCapture(event.pointerId);
    const point = toSlidePoint(event);
    sessionRef.current = { mode: "draw-line", start: point };
    setDrawing({ start: point, current: point });
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (state.pendingLine) {
      beginDrawLine(event);
      return;
    }
    const point = toSlidePoint(event);
    sessionRef.current = { mode: "marquee", start: point };
    setMarquee({ start: point, current: point });
  };

  const handleObjectPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    object: SlideObject,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    // A line can start on top of an object (it attaches to it on release).
    if (state.pendingLine) {
      beginDrawLine(event);
      return;
    }
    canvasRef.current?.setPointerCapture(event.pointerId);
    if (event.shiftKey) {
      dispatch({ type: "toggle-selected", id: object.id });
    } else {
      // When the selection has descended into this group (via double-click),
      // a plain click keeps working at that depth: it targets the object at
      // the same nesting level under the cursor, so nested children can be
      // clicked between siblings and dragged without leaving the group.
      const depth = maxSelectedDepth(object, selectedSet);
      const chain = depth > 0 ? hitChain(object, toSlidePoint(event)) : [object];
      const target = chain[Math.min(Math.max(depth, 0), chain.length - 1)]!;
      if (!state.selectedIds.includes(target.id)) {
        dispatch({ type: "set-selection", ids: [target.id] });
      }
    }
    sessionRef.current = { mode: "move", last: toSlidePoint(event) };
  };

  /**
   * Double-click descends the selection one nesting level: with the group
   * selected it selects the direct child under the cursor; if that child is
   * itself a group, the next double-click selects inside it, and so on.
   *
   * The handler lives on the CANVAS element, not the object wrappers:
   * pointer capture (set on pointerdown for dragging) retargets the
   * compatibility mouse events — including dblclick — to the capturing
   * canvas, so a wrapper-level onDoubleClick would never fire. The hit
   * object is resolved from coordinates instead.
   */
  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const point = toSlidePoint(event);
    // Front-most top-level object under the cursor.
    const object = slide.objects.findLast((candidate) =>
      pointInRect(point, objectBounds(candidate)),
    );
    if (!object) {
      return;
    }
    const chain = object.type === "group" ? hitChain(object, point) : [object];
    let deepestSelected = -1;
    chain.forEach((node, index) => {
      if (selectedSet.has(node.id)) {
        deepestSelected = index;
      }
    });
    const target = chain[Math.min(deepestSelected + 1, chain.length - 1)]!;
    // Once the descent has reached a shape / text box (or the double-click
    // hit one directly), the next double-click starts in-place text editing.
    const atDeepest = deepestSelected === chain.length - 1;
    if ((target.type === "shape" || target.type === "text") && (chain.length === 1 || atDeepest)) {
      dispatch({ type: "start-text-edit", id: target.id });
      return;
    }
    if (!state.selectedIds.includes(target.id) || state.selectedIds.length !== 1) {
      dispatch({ type: "set-selection", ids: [target.id] });
    }
  };

  /** Deepest connectable object under the point + its nearest site. */
  const findDropCandidate = (point: Point): ConnectorDropCandidate | null => {
    const topLevel = slide.objects.findLast(
      (candidate) => candidate.type !== "connector" && pointInRect(point, objectBounds(candidate)),
    );
    if (!topLevel) {
      return null;
    }
    const chain = topLevel.type === "group" ? hitChain(topLevel, point) : [topLevel];
    const target = chain.at(-1)!;
    const bounds = objectBounds(target);
    let best: { site: ConnectionSite; point: Point; distance: number } | null = null;
    for (const site of CONNECTION_SITES) {
      const candidatePoint = sitePoint(bounds, site);
      const distance = (candidatePoint.x - point.x) ** 2 + (candidatePoint.y - point.y) ** 2;
      if (!best || distance < best.distance) {
        best = { site, point: candidatePoint, distance };
      }
    }
    return { objectId: target.id, site: best!.site, point: best!.point, bounds };
  };

  const handleConnectorEndpointDown = (
    event: React.PointerEvent<HTMLDivElement>,
    connector: ConnectorObject,
    endpoint: "start" | "end",
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    sessionRef.current = { mode: "connector-endpoint" };
    const point = toSlidePoint(event);
    setConnectorDrag({
      connectorId: connector.id,
      endpoint,
      point,
      candidate: findDropCandidate(point),
    });
  };

  const handleConnectorHandleDown = (
    event: React.PointerEvent<HTMLDivElement>,
    connector: ConnectorObject,
    handleKind: ConnectorHandleKind,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    sessionRef.current = { mode: "connector-handle", connectorId: connector.id, handleKind };
  };

  const handleResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    objectId: string,
    handle: ResizeHandle,
    startFrame: Rect,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    sessionRef.current = {
      mode: "resize",
      objectId,
      handle,
      startFrame,
      start: toSlidePoint(event),
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (session.mode === "idle") {
      return;
    }
    const point = toSlidePoint(event);
    if (session.mode === "marquee") {
      setMarquee({ start: session.start, current: point });
    } else if (session.mode === "move") {
      const dx = point.x - session.last.x;
      const dy = point.y - session.last.y;
      if (dx !== 0 || dy !== 0) {
        sessionRef.current = { mode: "move", last: point };
        dispatch({ type: "move-selected", dx, dy });
      }
    } else if (session.mode === "resize") {
      const frame = resizeFrame(
        session.startFrame,
        session.handle,
        point.x - session.start.x,
        point.y - session.start.y,
      );
      dispatch({ type: "resize-object", id: session.objectId, frame });
    } else if (session.mode === "connector-endpoint") {
      setConnectorDrag((previous) =>
        previous ? { ...previous, point, candidate: findDropCandidate(point) } : previous,
      );
    } else if (session.mode === "connector-handle") {
      const connector = slide.objects.find((candidate) => candidate.id === session.connectorId);
      if (connector?.type === "connector") {
        const handle = connectorHandles(connector).find((item) => item.kind === session.handleKind);
        if (handle) {
          const patch = handle.patchFor(handle.axis === "x" ? point.x : point.y);
          dispatch({ type: "update-object", id: connector.id, patch });
        }
      }
    } else if (session.mode === "draw-line") {
      setDrawing((previous) => (previous ? { ...previous, current: point } : previous));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (session.mode === "draw-line") {
      const end = toSlidePoint(event);
      const start = session.start;
      const dragged = Math.hypot(end.x - start.x, end.y - start.y) >= 8;
      if (dragged && state.pendingLine) {
        // Attach each end to the object / site under it, or leave it free.
        const startCandidate = findDropCandidate(start);
        const endCandidate = findDropCandidate(end);
        const startResolved = startCandidate?.point ?? start;
        const endResolved = endCandidate?.point ?? end;
        const startEndpoint: ConnectorEndpoint = startCandidate
          ? { objectId: startCandidate.objectId, site: startCandidate.site }
          : { site: siteToward(startResolved, endResolved), point: startResolved };
        const endEndpoint: ConnectorEndpoint = endCandidate
          ? { objectId: endCandidate.objectId, site: endCandidate.site }
          : { site: siteToward(endResolved, startResolved), point: endResolved };
        dispatch({
          type: "add-line",
          connector: {
            id: createId("object"),
            name: "コネクタ",
            type: "connector",
            connectorType: state.pendingLine,
            start: startEndpoint,
            end: endEndpoint,
            startPoint: startResolved,
            endPoint: endResolved,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            lineColor: "#1f2937",
            lineWidth: 2,
            arrowEnd: true,
          },
        });
      } else {
        // A click without a drag just disarms the tool.
        dispatch({ type: "cancel-line-tool" });
      }
      setDrawing(null);
      sessionRef.current = { mode: "idle" };
      return;
    }
    if (session.mode === "connector-endpoint") {
      const connector = slide.objects.find(
        (candidate) => candidate.id === connectorDrag?.connectorId,
      );
      if (connectorDrag && connector?.type === "connector") {
        const endpoint = connectorDrag.endpoint;
        const other = endpoint === "start" ? connector.endPoint : connector.startPoint;
        const dropped = connectorDrag.point;
        // Over a connectable object → attach to its nearest site; dropped in
        // empty space → detach into a free endpoint at the cursor.
        const patch: ConnectorEndpoint = connectorDrag.candidate
          ? { objectId: connectorDrag.candidate.objectId, site: connectorDrag.candidate.site }
          : { site: siteToward(dropped, other), point: dropped };
        dispatch({ type: "update-object", id: connector.id, patch: { [endpoint]: patch } });
      }
      setConnectorDrag(null);
      sessionRef.current = { mode: "idle" };
      return;
    }
    if (session.mode === "marquee") {
      const rect = normalizeRect(session.start, toSlidePoint(event));
      if (rect.width < 3 && rect.height < 3) {
        dispatch({ type: "set-selection", ids: [] });
      } else {
        const hits: string[] = [];
        for (const object of slide.objects) {
          if (rectsIntersect(rect, objectBounds(object))) {
            hits.push(object.id);
          }
        }
        dispatch({ type: "set-selection", ids: hits });
      }
      setMarquee(null);
    }
    sessionRef.current = { mode: "idle" };
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (target?.isContentEditable) {
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        dispatch({ type: "delete-selected" });
      } else if (event.key === "Escape") {
        dispatch({ type: "cancel-line-tool" });
        dispatch({ type: "set-selection", ids: [] });
      } else if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        dispatch({ type: "move-selected", dx, dy });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  // Selection can point at objects nested inside groups (object tree /
  // double-click), so resolve deeply for resize handles and outlines.
  const singleSelected = selectedObjects.length === 1 ? selectedObjects[0] : undefined;
  const topLevelIds = new Set(slide.objects.map((object) => object.id));
  const nestedSelected = selectedObjects.filter((object) => !topLevelIds.has(object.id));

  // Connector whose endpoint is currently being dragged (for the preview).
  const draggedConnector =
    connectorDrag &&
    (slide.objects.find(
      (candidate) => candidate.id === connectorDrag.connectorId && candidate.type === "connector",
    ) as ConnectorObject | undefined);

  // The object whose text is being edited in place (shape or text box).
  const editingObject = state.textEditing
    ? (findObjectDeep(slide.objects, state.textEditing.objectId) as
        | ShapeObject
        | TextObject
        | undefined)
    : undefined;

  const handleEditingTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editingObject) {
      return;
    }
    dispatch({
      type: "update-object",
      id: editingObject.id,
      patch: {
        text: {
          ...editingObject.text,
          text: event.target.value,
          charStyles: remapCharStyles(
            editingObject.text.text,
            event.target.value,
            editingObject.text.charStyles,
          ),
        },
      },
    });
  };

  const handleEditingSelect = (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    dispatch({
      type: "set-text-selection",
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
  };

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/60"
      data-testid="canvas-container"
    >
      <div
        style={{
          width: SLIDE_WIDTH * scale,
          height: SLIDE_HEIGHT * scale,
        }}
      >
        <div
          ref={canvasRef}
          data-testid="slide-canvas"
          className="relative shadow-lg ring-1 ring-border select-none"
          style={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundColor: slide.background,
            touchAction: "none",
            cursor: state.pendingLine ? "crosshair" : undefined,
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={handleCanvasDoubleClick}
        >
          {slide.objects.map((object) => {
            const selected = selectedSet.has(object.id) || marqueeHits.has(object.id);
            return (
              <ContextMenu key={object.id}>
                <ContextMenuTrigger asChild>
                  <div
                    data-object-id={object.id}
                    className="absolute"
                    style={{
                      left: object.x,
                      top: object.y,
                      width: object.width,
                      height: object.height,
                      cursor: "move",
                      // Connectors get a line-shaped highlight instead of a
                      // bounding rectangle (drawn as an overlay below).
                      outline:
                        selected && object.type !== "connector" ? "2px solid #2563eb" : undefined,
                      outlineOffset: 1,
                    }}
                    onPointerDown={(event) => handleObjectPointerDown(event, object)}
                    onContextMenu={() => {
                      // Menu actions operate on the selection: right-clicking
                      // an unselected object selects it first.
                      if (!state.selectedIds.includes(object.id)) {
                        dispatch({ type: "set-selection", ids: [object.id] });
                      }
                    }}
                  >
                    <ObjectContent object={object} hideTextObjectId={editingObject?.id} />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ObjectContextMenuItems object={object} includeOrdering />
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {editingObject ? (
            // WYSIWYG in-place editor: the textarea owns input, caret and
            // selection but draws its text transparent; a mirror div behind
            // it renders the same text with the real (per-character) styles.
            // The mirror sits in normal flow and defines the text block's
            // height, the textarea is stretched exactly over it, and the
            // outer flex box applies the same vertical anchor (top / center
            // / bottom) as the canvas rendering, so the edited text sits
            // where it will be displayed.
            <div
              className="absolute z-20 flex flex-col overflow-hidden px-2 py-1 outline-2 outline-blue-500"
              style={{
                left: editingObject.x,
                top: editingObject.y,
                width: editingObject.width,
                height: editingObject.height,
                justifyContent: VERTICAL_ALIGN_TO_FLEX[editingObject.text.verticalAlign],
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
                // Clicking the blank area around the text keeps the editor
                // focused instead of falling through to the canvas.
                if (event.target !== editingTextareaRef.current) {
                  editingTextareaRef.current?.focus();
                }
              }}
            >
              <div className="relative w-full">
                <div
                  aria-hidden
                  className="w-full whitespace-pre-wrap break-words"
                  style={{ textAlign: editingObject.text.align, lineHeight: 1.25 }}
                >
                  {segmentByStyle(editingObject.text, editingObject.text.text, 0).map(
                    (segment, index) => (
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
                    ),
                  )}
                  {/* Zero-width sentinel: keeps one line box for empty text
                      and gives a trailing newline its own line height, so
                      the mirror height always matches the textarea's. */}
                  <span style={{ fontSize: editingObject.text.fontSize }}>{"​"}</span>
                </div>
                <textarea
                  // Remount per object so autoFocus fires for each session.
                  key={editingObject.id}
                  ref={editingTextareaRef}
                  autoFocus
                  data-testid="inline-text-editor"
                  value={editingObject.text.text}
                  onChange={handleEditingTextChange}
                  onSelect={handleEditingSelect}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      dispatch({ type: "end-text-edit" });
                    }
                  }}
                  className="absolute inset-0 h-full w-full resize-none overflow-hidden rounded-none border-none bg-transparent p-0 text-transparent outline-none selection:bg-blue-500/25 selection:text-transparent"
                  style={{
                    fontSize: editingObject.text.fontSize,
                    caretColor: editingObject.text.color,
                    textAlign: editingObject.text.align,
                    fontWeight: editingObject.text.bold ? 700 : 400,
                    fontStyle: editingObject.text.italic ? "italic" : "normal",
                    lineHeight: 1.25,
                    fontFamily: fontDefinition(editingObject.text.fontFamily)?.css,
                  }}
                />
              </div>
            </div>
          ) : null}

          {nestedSelected.map((object) => (
            <div
              key={`nested-selection-${object.id}`}
              data-testid={`nested-selection-${object.id}`}
              className="pointer-events-none absolute"
              style={{
                left: object.x,
                top: object.y,
                width: object.width,
                height: object.height,
                outline: "2px solid #2563eb",
                outlineOffset: 1,
              }}
            />
          ))}

          {singleSelected && singleSelected.type !== "connector"
            ? RESIZE_HANDLES.map(({ handle, left, top }) => (
                <div
                  key={handle}
                  data-testid={`resize-${handle}`}
                  className="absolute z-10 border border-blue-600 bg-white"
                  style={{
                    left: singleSelected.x + singleSelected.width * left - 5,
                    top: singleSelected.y + singleSelected.height * top - 5,
                    width: 10,
                    height: 10,
                    cursor: HANDLE_CURSORS[handle],
                  }}
                  onPointerDown={(event) =>
                    handleResizePointerDown(
                      event,
                      singleSelected.id,
                      handle,
                      objectBounds(singleSelected),
                    )
                  }
                />
              ))
            : null}

          {singleSelected?.type === "connector"
            ? (["start", "end"] as const).map((endpoint) => {
                const point =
                  endpoint === "start" ? singleSelected.startPoint : singleSelected.endPoint;
                return (
                  <div
                    key={endpoint}
                    data-testid={`connector-endpoint-${endpoint}`}
                    title="ドラッグで接続先を変更"
                    className="absolute z-10 rounded-full border-2 border-blue-600 bg-white"
                    style={{
                      left: point.x - 6,
                      top: point.y - 6,
                      width: 12,
                      height: 12,
                      cursor: "grab",
                    }}
                    onPointerDown={(event) =>
                      handleConnectorEndpointDown(event, singleSelected, endpoint)
                    }
                  />
                );
              })
            : null}

          {singleSelected?.type === "connector"
            ? connectorHandles(singleSelected).map((handle) => (
                <div
                  key={handle.kind}
                  data-testid={`connector-handle-${handle.kind}`}
                  title="ドラッグで折れ線の位置を調整"
                  className="absolute z-10 rounded-sm border-2 border-blue-600 bg-white"
                  style={{
                    left: handle.point.x - 5,
                    top: handle.point.y - 5,
                    width: 10,
                    height: 10,
                    cursor: handle.axis === "x" ? "ew-resize" : "ns-resize",
                  }}
                  onPointerDown={(event) =>
                    handleConnectorHandleDown(event, singleSelected, handle.kind)
                  }
                />
              ))
            : null}

          {connectorDrag && draggedConnector ? (
            <svg
              className="pointer-events-none absolute left-0 top-0 z-20"
              width={SLIDE_WIDTH}
              height={SLIDE_HEIGHT}
              viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
              style={{ overflow: "visible" }}
              data-testid="connector-drag-preview"
            >
              <line
                x1={
                  connectorDrag.endpoint === "start"
                    ? draggedConnector.endPoint.x
                    : draggedConnector.startPoint.x
                }
                y1={
                  connectorDrag.endpoint === "start"
                    ? draggedConnector.endPoint.y
                    : draggedConnector.startPoint.y
                }
                x2={(connectorDrag.candidate?.point ?? connectorDrag.point).x}
                y2={(connectorDrag.candidate?.point ?? connectorDrag.point).y}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              {connectorDrag.candidate ? (
                <CandidateSites candidate={connectorDrag.candidate} />
              ) : null}
            </svg>
          ) : null}

          {/* Line-shaped selection highlight for connectors (a translucent
              halo tracing the route) instead of a bounding rectangle. */}
          {slide.objects.map((object) =>
            object.type === "connector" && selectedSet.has(object.id) ? (
              <svg
                key={`connector-highlight-${object.id}`}
                className="pointer-events-none absolute left-0 top-0"
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
                style={{ overflow: "visible" }}
                data-testid={`connector-highlight-${object.id}`}
              >
                <polyline
                  points={connectorRoutePoints(object)
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  fill="none"
                  stroke="#2563eb"
                  strokeOpacity={0.35}
                  strokeWidth={object.lineWidth + 6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            ) : null,
          )}

          {marqueeRect ? (
            <div
              data-testid="marquee"
              className="pointer-events-none absolute border border-blue-500 bg-blue-500/10"
              style={{
                left: marqueeRect.x,
                top: marqueeRect.y,
                width: marqueeRect.width,
                height: marqueeRect.height,
              }}
            />
          ) : null}

          {drawing ? (
            <svg
              className="pointer-events-none absolute left-0 top-0 z-20"
              width={SLIDE_WIDTH}
              height={SLIDE_HEIGHT}
              viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
              style={{ overflow: "visible" }}
              data-testid="line-draw-preview"
            >
              <line
                x1={drawing.start.x}
                y1={drawing.start.y}
                x2={drawing.current.x}
                y2={drawing.current.y}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              {/* Show the connectable sites of the objects under each end. */}
              {[findDropCandidate(drawing.start), findDropCandidate(drawing.current)].map(
                (candidate, index) =>
                  candidate ? <CandidateSites key={index} candidate={candidate} /> : null,
              )}
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}
