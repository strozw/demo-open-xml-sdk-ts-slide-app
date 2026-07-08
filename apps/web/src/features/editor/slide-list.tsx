"use client";

import { ChevronLeft, ChevronRight, Play, Plus, Square, Trash2 } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu";
import { cn } from "@workspace/ui/lib/utils";

import { ObjectContent } from "./object-view";
import { useEditorDispatch, useEditorState } from "./store";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "./types";

// Thumbnails must exactly fill the card's inner box or the scaled slide
// leaves blank space: sidebar w-56 (224px) minus the list padding px-3
// (12px × 2), the page-number column w-5 (20px), the gap-2 (8px), and the
// card border-2 (2px × 2). The card contains nothing but the thumbnail, so
// its height is the 16:9 scaled height with no leftover space below.
const THUMB_WIDTH = 224 - 12 * 2 - 20 - 8 - 2 * 2;
const THUMB_SCALE = THUMB_WIDTH / SLIDE_WIDTH;

/** Fixed playback controls at the bottom of the slide list. */
function PlaybackControls() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const index = state.deck.slides.findIndex((slide) => slide.id === state.currentSlideId);

  return (
    <div
      className="flex shrink-0 items-center justify-center gap-1 border-t bg-sidebar px-3 py-2"
      data-testid="playback-controls"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="前のスライドへ"
        data-testid="playback-prev"
        disabled={index <= 0}
        onClick={() => dispatch({ type: "step-slide", delta: -1 })}
      >
        <ChevronLeft />
      </Button>
      <Button
        variant={state.presenting ? "default" : "outline"}
        size="icon-sm"
        aria-label={state.presenting ? "停止" : "再生"}
        data-testid="playback-toggle"
        onClick={() =>
          dispatch({ type: state.presenting ? "stop-presentation" : "start-presentation" })
        }
      >
        {state.presenting ? <Square /> : <Play />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="次のスライドへ"
        data-testid="playback-next"
        disabled={index >= state.deck.slides.length - 1}
        onClick={() => dispatch({ type: "step-slide", delta: 1 })}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function SlideList() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();

  return (
    <div className="flex h-full flex-col" data-testid="slide-list">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">スライド</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="スライドを追加"
          data-testid="add-slide"
          onClick={() => dispatch({ type: "add-slide" })}
        >
          <Plus />
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-4">
        {state.deck.slides.map((slide, index) => {
          const active = slide.id === state.currentSlideId;
          return (
            <ContextMenu key={slide.id}>
              <ContextMenuTrigger asChild>
                <div
                  className="group relative flex gap-2"
                  onContextMenu={() => dispatch({ type: "select-slide", id: slide.id })}
                >
                  <p
                    className={cn(
                      "w-5 shrink-0 pt-0.5 text-right text-xs",
                      active ? "font-semibold text-primary" : "text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </p>
                  <button
                    type="button"
                    data-testid={`slide-thumb-${index}`}
                    aria-label={`スライド ${index + 1}`}
                    className={cn(
                      "block overflow-hidden rounded-md border-2 bg-white text-left shadow-sm transition-colors",
                      active
                        ? "border-primary"
                        : "border-transparent hover:border-muted-foreground/40",
                    )}
                    onClick={() => dispatch({ type: "select-slide", id: slide.id })}
                  >
                    <div
                      style={{ width: THUMB_WIDTH, height: SLIDE_HEIGHT * THUMB_SCALE }}
                      className="relative"
                    >
                      <div
                        className="pointer-events-none absolute left-0 top-0"
                        style={{
                          width: SLIDE_WIDTH,
                          height: SLIDE_HEIGHT,
                          transform: `scale(${THUMB_SCALE})`,
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
                  </button>
                  {state.deck.slides.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`スライド ${index + 1} を削除`}
                      className="absolute right-1 top-1 hidden bg-background/80 group-hover:inline-flex"
                      onClick={() => dispatch({ type: "remove-slide", id: slide.id })}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  variant="destructive"
                  disabled={state.deck.slides.length <= 1}
                  data-testid={`slide-context-delete-${index}`}
                  onSelect={() => dispatch({ type: "remove-slide", id: slide.id })}
                >
                  <Trash2 /> 削除
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
      <PlaybackControls />
    </div>
  );
}
