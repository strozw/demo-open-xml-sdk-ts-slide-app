"use client";

import * as React from "react";

import { normalizeRect, objectBounds, rectsIntersect } from "./geometry";
import { ObjectContent } from "./object-view";
import { useCurrentSlide, useEditorDispatch, useEditorState } from "./store";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Rect } from "./types";

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

  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
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

  const handleObjectPointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    canvasRef.current?.setPointerCapture(event.pointerId);
    if (event.shiftKey) {
      dispatch({ type: "toggle-selected", id });
    } else if (!state.selectedIds.includes(id)) {
      dispatch({ type: "set-selection", ids: [id] });
    }
    sessionRef.current = { mode: "move", last: toSlidePoint(event) };
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

  const singleSelected =
    state.selectedIds.length === 1
      ? slide.objects.find((object) => object.id === state.selectedIds[0])
      : undefined;

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
                onPointerDown={(event) => handleObjectPointerDown(event, object.id)}
              >
                <ObjectContent object={object} />
              </div>
            );
          })}

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
