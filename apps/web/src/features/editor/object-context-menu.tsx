"use client";

import {
  BringToFront,
  Copy,
  Group as GroupIcon,
  SendToBack,
  Spline,
  Trash2,
  Ungroup,
} from "lucide-react";

import { ContextMenuItem, ContextMenuSeparator } from "@workspace/ui/components/context-menu";

import { useCurrentSlide, useEditorDispatch, useEditorState, useSelectedObjects } from "./store";
import type { SlideObject } from "./types";

/**
 * Context-menu items shared by the object tree and the canvas. Actions
 * operate on the current selection (the right-click handler on each trigger
 * selects the target first when it is not already selected).
 *
 * - Non-group: グループ化 (only with a multi-selection of top-level
 *   objects), 複製, 削除
 * - Group: グループ解除, 複製, 削除 (children included)
 * - `includeOrdering` adds 最前面へ移動 / 最背面へ移動 (canvas only)
 */
export function ObjectContextMenuItems({
  object,
  includeOrdering = false,
}: {
  object: SlideObject;
  includeOrdering?: boolean;
}) {
  const state = useEditorState();
  const slide = useCurrentSlide();
  const dispatch = useEditorDispatch();
  const selectedObjects = useSelectedObjects();

  // Grouping only combines top-level siblings.
  const topLevelIds = new Set(slide.objects.map((candidate) => candidate.id));
  const canGroup =
    state.selectedIds.length >= 2 && state.selectedIds.every((id) => topLevelIds.has(id));

  // Connecting needs exactly two non-connector objects (nested ones too).
  const canConnect =
    selectedObjects.length === 2 &&
    selectedObjects.every((candidate) => candidate.type !== "connector");

  return (
    <>
      {object.type !== "group" && canGroup ? (
        <ContextMenuItem
          data-testid="context-group"
          onSelect={() => dispatch({ type: "group-selected" })}
        >
          <GroupIcon /> グループ化
        </ContextMenuItem>
      ) : null}
      {canConnect ? (
        <ContextMenuItem
          data-testid="context-connect"
          onSelect={() => dispatch({ type: "connect-selected" })}
        >
          <Spline /> コネクタで接続
        </ContextMenuItem>
      ) : null}
      {object.type === "group" ? (
        <ContextMenuItem
          data-testid="context-ungroup"
          onSelect={() => dispatch({ type: "ungroup-selected" })}
        >
          <Ungroup /> グループ解除
        </ContextMenuItem>
      ) : null}
      {includeOrdering ? (
        <>
          <ContextMenuItem
            data-testid="context-bring-to-front"
            onSelect={() => dispatch({ type: "reorder-selected", direction: "front" })}
          >
            <BringToFront /> 最前面へ移動
          </ContextMenuItem>
          <ContextMenuItem
            data-testid="context-send-to-back"
            onSelect={() => dispatch({ type: "reorder-selected", direction: "back" })}
          >
            <SendToBack /> 最背面へ移動
          </ContextMenuItem>
        </>
      ) : null}
      {object.type === "group" || canGroup || canConnect || includeOrdering ? (
        <ContextMenuSeparator />
      ) : null}
      <ContextMenuItem
        data-testid="context-duplicate"
        onSelect={() => dispatch({ type: "duplicate-selected" })}
      >
        <Copy /> 複製
      </ContextMenuItem>
      <ContextMenuItem
        variant="destructive"
        data-testid="context-delete"
        onSelect={() => dispatch({ type: "delete-selected" })}
      >
        <Trash2 /> 削除
      </ContextMenuItem>
    </>
  );
}
