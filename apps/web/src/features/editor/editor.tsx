"use client";

import { Inspector } from "./inspector";
import { SlideCanvas } from "./slide-canvas";
import { SlideList } from "./slide-list";
import { EditorProvider } from "./store";
import { EditorToolbar } from "./toolbar";

export function Editor() {
  return (
    <EditorProvider>
      <div className="flex h-dvh flex-col">
        <EditorToolbar />
        <div className="flex min-h-0 flex-1">
          <SlideList />
          <SlideCanvas />
          <Inspector />
        </div>
      </div>
    </EditorProvider>
  );
}
