"use client";

import * as React from "react";
import {
  BarChart3,
  Copy,
  Download,
  FolderOpen,
  Group,
  Layers,
  LoaderCircle,
  SendToBack,
  Shapes,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Separator } from "@workspace/ui/components/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";

import { downloadDeckAsPptx } from "@/lib/export-pptx";
import { deckFromPptxBlob } from "@/lib/import-pptx";
import {
  CHART_DEFINITIONS,
  createChartObject,
  createShapeObject,
  createTextObject,
  SHAPE_DEFINITIONS,
} from "./shape-defs";
import { useEditorDispatch, useEditorState, useSelectedObjects } from "./store";

function IconAction({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selection = useSelectedObjects();
  const [isExporting, startExport] = React.useTransition();
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [isImporting, startImport] = React.useTransition();
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canGroup = selection.length >= 2;
  const canUngroup = selection.some((object) => object.type === "group");

  const handleExport = () => {
    setExportError(null);
    startExport(async () => {
      try {
        await downloadDeckAsPptx(state.deck);
      } catch (error) {
        setExportError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again re-fires onChange.
    event.target.value = "";
    if (!file) {
      return;
    }
    setImportError(null);
    startImport(async () => {
      try {
        const deck = await deckFromPptxBlob(file);
        dispatch({ type: "load-deck", deck });
      } catch (error) {
        setImportError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  return (
    <header className="flex items-center gap-2 border-b bg-background px-3 py-2">
      <div className="flex items-center gap-2">
        <Layers className="size-5 text-primary" aria-hidden />
        <Input
          value={state.deck.title}
          onChange={(event) => dispatch({ type: "set-deck-title", title: event.target.value })}
          className="h-8 w-56 border-transparent font-medium shadow-none focus-visible:border-input"
          aria-label="プレゼンテーションのタイトル"
        />
      </div>

      <Separator orientation="vertical" className="h-6" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="add-shape">
            <Shapes /> 図形
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>図形を追加</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {SHAPE_DEFINITIONS.map((definition) => (
            <DropdownMenuItem
              key={definition.kind}
              data-testid={`add-shape-${definition.kind}`}
              onSelect={() =>
                dispatch({ type: "add-object", object: createShapeObject(definition.kind) })
              }
            >
              {definition.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        data-testid="add-text"
        onClick={() => dispatch({ type: "add-object", object: createTextObject() })}
      >
        <Type /> テキスト
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="add-chart">
            <BarChart3 /> グラフ
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>グラフを追加</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CHART_DEFINITIONS.map((definition) => (
            <DropdownMenuItem
              key={definition.kind}
              data-testid={`add-chart-${definition.kind}`}
              onSelect={() =>
                dispatch({ type: "add-object", object: createChartObject(definition.kind) })
              }
            >
              {definition.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="h-6" />

      <IconAction
        label="グループ化"
        testId="group-button"
        onClick={() => dispatch({ type: "group-selected" })}
        disabled={!canGroup}
      >
        <Group />
      </IconAction>
      <IconAction
        label="グループ解除"
        testId="ungroup-button"
        onClick={() => dispatch({ type: "ungroup-selected" })}
        disabled={!canUngroup}
      >
        <Ungroup />
      </IconAction>
      <IconAction
        label="複製"
        onClick={() => dispatch({ type: "duplicate-selected" })}
        disabled={selection.length === 0}
      >
        <Copy />
      </IconAction>
      <IconAction
        label="最背面へ"
        onClick={() => dispatch({ type: "reorder-selected", direction: "back" })}
        disabled={selection.length === 0}
      >
        <SendToBack />
      </IconAction>
      <IconAction
        label="削除"
        testId="delete-button"
        onClick={() => dispatch({ type: "delete-selected" })}
        disabled={selection.length === 0}
      >
        <Trash2 />
      </IconAction>

      <div className="ml-auto flex items-center gap-3">
        {importError ? (
          <p className="text-sm text-destructive" role="alert">
            読み込みに失敗しました: {importError}
          </p>
        ) : null}
        {exportError ? (
          <p className="text-sm text-destructive" role="alert">
            書き出しに失敗しました: {exportError}
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pptx"
          className="hidden"
          onChange={handleImportFile}
          data-testid="open-file-input"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          data-testid="open-button"
        >
          {isImporting ? <LoaderCircle className="animate-spin" /> : <FolderOpen />}
          {isImporting ? "読み込み中…" : "開く"}
        </Button>
        <Button size="sm" onClick={handleExport} disabled={isExporting} data-testid="export-button">
          {isExporting ? <LoaderCircle className="animate-spin" /> : <Download />}
          {isExporting ? "書き出し中…" : "PPTX を書き出し"}
        </Button>
      </div>
    </header>
  );
}
