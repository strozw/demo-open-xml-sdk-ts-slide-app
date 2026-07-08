"use client";

import { Inspector } from "./inspector";
import { PresentationView } from "./presentation-view";
import { EditorSidebar } from "./sidebar";
import { SlideCanvas } from "./slide-canvas";
import { EditorProvider, useEditorState } from "./store";
import { EditorToolbar } from "./toolbar";

function EditorShell() {
  const { presenting } = useEditorState();
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
