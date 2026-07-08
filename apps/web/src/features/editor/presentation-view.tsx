"use client";

import * as React from "react";
import { Maximize, Minimize } from "lucide-react";

import { Button } from "@workspace/ui/components/button";

import { ObjectContent } from "./object-view";
import { useCurrentSlide, useEditorDispatch, useEditorState } from "./store";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "./types";

/**
 * Read-only slideshow view shown instead of the canvas while presenting:
 * - no editing (plain rendering, no pointer handlers)
 * - ← / → switch slides
 * - a fullscreen toggle appears at the top-right on mouse-over; the native
 *   Escape behavior leaves fullscreen back to this in-window view
 */
export function PresentationView() {
  const state = useEditorState();
  const slide = useCurrentSlide();
  const dispatch = useEditorDispatch();

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.6);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

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
      setScale(Math.max(0.05, Math.min((width - 32) / SLIDE_WIDTH, (height - 32) / SLIDE_HEIGHT)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        dispatch({ type: "step-slide", delta: -1 });
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        dispatch({ type: "step-slide", delta: 1 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  React.useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerRef.current?.requestFullscreen();
    }
  };

  const slideIndex = state.deck.slides.findIndex((candidate) => candidate.id === slide.id);

  return (
    <div
      ref={containerRef}
      className="group relative flex h-full min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-900"
      data-testid="presentation-view"
    >
      <div style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
        <div
          className="pointer-events-none relative shadow-2xl"
          style={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundColor: slide.background,
          }}
        >
          {slide.objects.map((object) => (
            <div
              key={object.id}
              className="absolute"
              style={{
                left: object.x,
                top: object.y,
                width: object.width,
                height: object.height,
              }}
            >
              <ObjectContent object={object} />
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={isFullscreen ? "全画面を終了" : "全画面表示"}
        data-testid="presentation-fullscreen"
        className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Minimize /> : <Maximize />}
      </Button>

      <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-xs text-white/80">
        {slideIndex + 1} / {state.deck.slides.length}
      </p>
    </div>
  );
}
