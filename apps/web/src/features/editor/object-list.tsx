"use client";

import * as React from "react";
import {
  BarChart3,
  ChevronRight,
  Group,
  Image as ImageIcon,
  Shapes,
  Spline,
  Type,
} from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu";
import { cn } from "@workspace/ui/lib/utils";

import { ObjectContextMenuItems } from "./object-context-menu";
import { useCurrentSlide, useEditorDispatch, useEditorState } from "./store";
import type { SlideObject } from "./types";

type DropEdge = "top" | "bottom";

interface DragSource {
  id: string;
  /** null = top-level object; otherwise the enclosing group's id. */
  parentId: string | null;
}

/**
 * Drag & drop state and handlers shared by every tree row. Reordering is
 * restricted to siblings (rows with the same parent), so dragging never
 * re-parents an object in or out of a group.
 */
interface TreeDnd {
  dragging: DragSource | null;
  dropTarget: { id: string; edge: DropEdge } | null;
  onDragStart: (event: React.DragEvent, source: DragSource) => void;
  onDragOver: (event: React.DragEvent, target: DragSource) => void;
  onDrop: (event: React.DragEvent, target: DragSource) => void;
  onDragEnd: () => void;
}

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
    case "connector":
      return <Spline className="size-3.5 shrink-0" aria-hidden />;
    case "image":
      return <ImageIcon className="size-3.5 shrink-0" aria-hidden />;
    default:
      return null;
  }
}

/** Front-most objects render first: the tree lists them top = front. */
function frontToBack(objects: readonly SlideObject[]): readonly SlideObject[] {
  return objects.toReversed();
}

function TreeNode({
  object,
  parentId,
  depth,
  collapsed,
  onToggleCollapse,
  dnd,
  renamingId,
  onStartRename,
  onFinishRename,
}: {
  object: SlideObject;
  parentId: string | null;
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  dnd: TreeDnd;
  renamingId: string | null;
  onStartRename: (id: string) => void;
  onFinishRename: () => void;
}) {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const isSelected = state.selectedIds.includes(object.id);
  const isGroup = object.type === "group";
  const isCollapsed = collapsed.has(object.id);
  const isDragging = dnd.dragging?.id === object.id;
  const dropEdge = dnd.dropTarget?.id === object.id ? dnd.dropTarget.edge : null;

  if (renamingId === object.id) {
    const commit = (input: HTMLInputElement) => {
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== object.name) {
        dispatch({ type: "rename-object", id: object.id, name: trimmed });
      }
      onFinishRename();
    };
    return (
      <>
        <div
          className="flex w-full items-center gap-1.5 rounded-md bg-primary/10 py-0.5 pr-2 text-xs"
          style={{ paddingLeft: 8 + depth * 14 + 18 }}
        >
          <ObjectIcon object={object} />
          <input
            autoFocus
            defaultValue={object.name}
            aria-label="オブジェクト名"
            data-testid={`object-node-rename-${object.id}`}
            className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1 py-0.5 outline-none"
            onFocus={(event) => event.target.select()}
            onBlur={(event) => commit(event.currentTarget)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                commit(event.currentTarget);
              } else if (event.key === "Escape") {
                // Reset the value first so the following blur commit no-ops.
                event.currentTarget.value = object.name;
                onFinishRename();
              }
            }}
          />
        </div>
        {isGroup && !isCollapsed
          ? frontToBack(object.children).map((child) => (
              <TreeNode
                key={child.id}
                object={child}
                parentId={object.id}
                depth={depth + 1}
                collapsed={collapsed}
                onToggleCollapse={onToggleCollapse}
                dnd={dnd}
                renamingId={renamingId}
                onStartRename={onStartRename}
                onFinishRename={onFinishRename}
              />
            ))
          : null}
      </>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            data-testid={`object-node-${object.id}`}
            draggable
            onDragStart={(event) => dnd.onDragStart(event, { id: object.id, parentId })}
            onDragOver={(event) => dnd.onDragOver(event, { id: object.id, parentId })}
            onDrop={(event) => dnd.onDrop(event, { id: object.id, parentId })}
            onDragEnd={dnd.onDragEnd}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors",
              isSelected ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
              isDragging && "opacity-50",
              dropEdge === "top" && "shadow-[0_-2px_0_0_var(--color-primary)]",
              dropEdge === "bottom" && "shadow-[0_2px_0_0_var(--color-primary)]",
            )}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={(event) =>
              event.shiftKey
                ? dispatch({ type: "toggle-selected", id: object.id })
                : dispatch({ type: "set-selection", ids: [object.id] })
            }
            onDoubleClick={() => onStartRename(object.id)}
            onContextMenu={() => {
              // Menu actions operate on the selection: right-clicking an
              // unselected row selects it first (like the canvas).
              if (!state.selectedIds.includes(object.id)) {
                dispatch({ type: "set-selection", ids: [object.id] });
              }
            }}
            title="ダブルクリックで名前を変更"
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
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ObjectContextMenuItems object={object} />
        </ContextMenuContent>
      </ContextMenu>
      {isGroup && !isCollapsed
        ? frontToBack(object.children).map((child) => (
            <TreeNode
              key={child.id}
              object={child}
              parentId={object.id}
              depth={depth + 1}
              collapsed={collapsed}
              onToggleCollapse={onToggleCollapse}
              dnd={dnd}
              renamingId={renamingId}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
            />
          ))
        : null}
    </>
  );
}

/**
 * Tree view of the focused slide's objects, listed front-to-back. Groups
 * nest and can be collapsed; clicking a row selects the object (Shift+click
 * adds to the selection). Rows can be dragged over a sibling to change the
 * stacking order: dropping higher in the list brings the object forward.
 */
export function ObjectList() {
  const slide = useCurrentSlide();
  const dispatch = useEditorDispatch();
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = React.useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; edge: DropEdge } | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);

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

  const clearDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  const dnd: TreeDnd = {
    dragging,
    dropTarget,
    onDragStart: (event, source) => {
      event.dataTransfer.effectAllowed = "move";
      // Some browsers require data for a drag to start.
      event.dataTransfer.setData("text/plain", source.id);
      setDragging(source);
    },
    onDragOver: (event, target) => {
      if (!dragging || dragging.id === target.id || dragging.parentId !== target.parentId) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const edge: DropEdge = event.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
      setDropTarget((previous) =>
        previous?.id === target.id && previous.edge === edge ? previous : { id: target.id, edge },
      );
    },
    onDrop: (event, target) => {
      if (!dragging || dragging.id === target.id || dragging.parentId !== target.parentId) {
        return;
      }
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const edge: DropEdge = event.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
      // The list renders front-to-back (reversed array order), so dropping
      // ABOVE the target means "further to the front" = AFTER it in the
      // slide's object array.
      dispatch({
        type: "reorder-object",
        id: dragging.id,
        targetId: target.id,
        position: edge === "top" ? "after" : "before",
      });
      clearDrag();
    },
    onDragEnd: clearDrag,
  };

  return (
    <div className="flex h-full flex-col" data-testid="object-list">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">オブジェクト</h2>
        <span className="text-[10px] text-muted-foreground">前面 → 背面</span>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {slide.objects.length === 0 ? (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            このスライドにはまだオブジェクトがありません。
          </p>
        ) : (
          frontToBack(slide.objects).map((object) => (
            <TreeNode
              key={object.id}
              object={object}
              parentId={null}
              depth={0}
              collapsed={collapsed}
              onToggleCollapse={toggleCollapse}
              dnd={dnd}
              renamingId={renamingId}
              onStartRename={setRenamingId}
              onFinishRename={() => setRenamingId(null)}
            />
          ))
        )}
      </div>
    </div>
  );
}
