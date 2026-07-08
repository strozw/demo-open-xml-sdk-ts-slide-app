"use client";

import * as React from "react";

import {
  hitChain,
  maxSelectedDepth,
  normalizeRect,
  objectBounds,
  pointInRect,
  rectsIntersect,
} from "./geometry";
import { fontDefinition, remapCharStyles, segmentByStyle } from "./fonts";
import { ObjectContent } from "./object-view";
import {
  findObjectDeep,
  useCurrentSlide,
  useEditorDispatch,
  useEditorState,
  useSelectedObjects,
} from "./store";
import {
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Rect,
  type ShapeObject,
  type SlideObject,
  type TextObject,
} from "./types";

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
  | { mode: "resize"; objectId: string; handle: ResizeHandle; startFrame: Rect; start: Point };

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
  const editingMirrorRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<PointerSession>({ mode: "idle" });
  const [scale, setScale] = React.useState(0.6);
  const [marquee, setMarquee] = React.useState<{ start: Point; current: Point } | null>(null);

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

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
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
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
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
              <div
                key={object.id}
                data-object-id={object.id}
                className="absolute"
                style={{
                  left: object.x,
                  top: object.y,
                  width: object.width,
                  height: object.height,
                  cursor: "move",
                  outline: selected ? "2px solid #2563eb" : undefined,
                  outlineOffset: 1,
                }}
                onPointerDown={(event) => handleObjectPointerDown(event, object)}
              >
                <ObjectContent object={object} hideTextObjectId={editingObject?.id} />
              </div>
            );
          })}

          {editingObject ? (
            // WYSIWYG in-place editor: the textarea owns input, caret and
            // selection but draws its text transparent; a mirror div behind
            // it renders the same text with the real (per-character) fonts.
            // Both share metrics (padding / size / line-height / wrapping),
            // so glyphs line up; the selection highlight is semi-transparent
            // to keep the mirror text readable through it.
            <div
              className="absolute z-20"
              style={{
                left: editingObject.x,
                top: editingObject.y,
                width: editingObject.width,
                height: editingObject.height,
              }}
            >
              <div
                ref={editingMirrorRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden px-2 py-1"
                style={{ textAlign: editingObject.text.align, lineHeight: 1.25 }}
              >
                <div className="w-full whitespace-pre-wrap break-words">
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
                </div>
              </div>
              <textarea
                // Remount per object so autoFocus fires for each session.
                key={editingObject.id}
                autoFocus
                data-testid="inline-text-editor"
                value={editingObject.text.text}
                onChange={handleEditingTextChange}
                onSelect={handleEditingSelect}
                onScroll={(event) => {
                  const mirror = editingMirrorRef.current;
                  if (mirror) {
                    mirror.scrollTop = event.currentTarget.scrollTop;
                    mirror.scrollLeft = event.currentTarget.scrollLeft;
                  }
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    dispatch({ type: "end-text-edit" });
                  }
                }}
                className="absolute inset-0 h-full w-full resize-none rounded-none border-none bg-transparent px-2 py-1 text-transparent outline-2 outline-blue-500 selection:bg-blue-500/25 selection:text-transparent"
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

          {singleSelected
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
        </div>
      </div>
    </div>
  );
}
