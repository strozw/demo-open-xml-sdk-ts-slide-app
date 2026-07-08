"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";

import { ObjectList } from "./object-list";
import { SlideList } from "./slide-list";

/** Left sidebar: slide thumbnails and the current slide's object tree. */
export function EditorSidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar" data-testid="sidebar">
      <Tabs defaultValue="slides" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-3 mt-2 flex w-auto shrink-0">
          <TabsTrigger value="slides" className="text-xs" data-testid="tab-slides">
            スライド
          </TabsTrigger>
          <TabsTrigger value="objects" className="text-xs" data-testid="tab-objects">
            オブジェクト
          </TabsTrigger>
        </TabsList>
        <TabsContent value="slides" className="min-h-0 flex-1">
          <SlideList />
        </TabsContent>
        <TabsContent value="objects" className="min-h-0 flex-1">
          <ObjectList />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
