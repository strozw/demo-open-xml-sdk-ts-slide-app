"use client";

import * as React from "react";

import { Inspector } from "./inspector";
import { PresentationView } from "./presentation-view";
import { EditorSidebar } from "./sidebar";
import { SlideCanvas } from "./slide-canvas";
import { EditorProvider, useEditorDispatch, useEditorState } from "./store";
import { EditorToolbar } from "./toolbar";

function EditorShell() {
  const { presenting } = useEditorState();
  const dispatch = useEditorDispatch();

  // Cmd/Ctrl+Z → undo, Shift+Cmd/Ctrl+Z or Ctrl+Y → redo. Inputs keep their
  // native undo behavior.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  return (
    <div className="flex h-dvh flex-col">
      <EditorToolbar />
      <div className="flex min-h-0 flex-1">
        <EditorSidebar />
        {presenting ? <PresentationView /> : <SlideCanvas />}
        {/* The inspector is hidden while presenting. */}
        {presenting ? null : <Inspector />}
      </div>
    </div>
  );
}

export function Editor() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
