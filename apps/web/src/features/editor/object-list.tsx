"use client";

import * as React from "react";
import { BarChart3, ChevronRight, Group, Shapes, Type } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

import { useCurrentSlide, useEditorDispatch, useEditorState } from "./store";
import type { SlideObject } from "./types";

function ObjectIcon({ object }: { object: SlideObject }) {
  switch (object.type) {
    case "shape":
      return <Shapes className="size-3.5 shrink-0" aria-hidden />;
    case "text":
      return <Type className="size-3.5 shrink-0" aria-hidden />;
    case "chart":
      return <BarChart3 className="size-3.5 shrink-0" aria-hidden />;
    case "group":
      return <Group className="size-3.5 shrink-0" aria-hidden />;
    default:
      return null;
  }
}

function TreeNode({
  object,
  depth,
  collapsed,
  onToggleCollapse,
}: {
  object: SlideObject;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const isSelected = state.selectedIds.includes(object.id);
  const isGroup = object.type === "group";
  const isCollapsed = collapsed.has(object.id);

  return (
    <>
      <button
        type="button"
        data-testid={`object-node-${object.id}`}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors",
          isSelected ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={(event) =>
          event.shiftKey
            ? dispatch({ type: "toggle-selected", id: object.id })
            : dispatch({ type: "set-selection", ids: [object.id] })
        }
      >
        {isGroup ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={isCollapsed ? "展開" : "折りたたむ"}
            aria-expanded={!isCollapsed}
            className="-m-0.5 rounded p-0.5 hover:bg-muted-foreground/15"
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse(object.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onToggleCollapse(object.id);
              }
            }}
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", !isCollapsed && "rotate-90")}
              aria-hidden
            />
          </span>
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
        <ObjectIcon object={object} />
        <span className="min-w-0 flex-1 truncate">{object.name}</span>
        {isGroup ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {object.children.length}
          </span>
        ) : null}
      </button>
      {isGroup && !isCollapsed
        ? object.children.map((child) => (
            <TreeNode
              key={child.id}
              object={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
            />
          ))
        : null}
    </>
  );
}

/**
 * Tree view of the focused slide's objects. Groups nest and can be
 * collapsed; clicking a row selects the object (Shift+click adds to the
 * selection, mirroring the canvas).
 */
export function ObjectList() {
  const slide = useCurrentSlide();
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col" data-testid="object-list">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">オブジェクト</h2>
        <span className="text-[10px] text-muted-foreground">背面 → 前面</span>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {slide.objects.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            このスライドにはまだオブジェクトがありません。
          </p>
        ) : (
          slide.objects.map((object) => (
            <TreeNode
              key={object.id}
              object={object}
              depth={0}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
            />
          ))
        )}
      </div>
    </div>
  );
}
