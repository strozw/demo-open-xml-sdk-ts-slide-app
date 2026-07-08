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
  Spline,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Separator } from "@workspace/ui/components/separator";
import { Toggle } from "@workspace/ui/components/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";

import { downloadDeckAsPptx, sanitizeFileName } from "@/lib/export-pptx";
import { collectUsedFonts, loadEmbeddedFonts } from "@/lib/font-embed";
import { deckFromPptxBlob } from "@/lib/import-pptx";
import {
  CHART_DEFINITIONS,
  createChartObject,
  createShapeObject,
  createTextObject,
  SHAPE_DEFINITIONS,
} from "./shape-defs";
import { useEditorDispatch, useEditorState, useSelectedObjects } from "./store";
import type { Deck, SlideObject } from "./types";

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

const containsChart = (object: SlideObject): boolean =>
  object.type === "chart" || (object.type === "group" && object.children.some(containsChart));

function deckHasCharts(deck: Deck): boolean {
  return deck.slides.some((slide) => slide.objects.some(containsChart));
}

/** Export dialog: file name, font embedding, and chart rasterization. */
function ExportDialog({ deck }: { deck: Deck }) {
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [embedFonts, setEmbedFonts] = React.useState(false);
  const [chartsAsImages, setChartsAsImages] = React.useState(false);
  const [isExporting, startExport] = React.useTransition();
  const [exportError, setExportError] = React.useState<string | null>(null);

  const hasCharts = deckHasCharts(deck);
  const usedFonts = collectUsedFonts(deck);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      // Fresh defaults per session; the file name follows the deck title.
      setFileName(sanitizeFileName(deck.title));
      setExportError(null);
    }
  };

  const handleExport = () => {
    setExportError(null);
    startExport(async () => {
      try {
        const embeddedFonts =
          embedFonts && usedFonts.length > 0 ? await loadEmbeddedFonts(deck) : undefined;
        await downloadDeckAsPptx(deck, {
          fileName,
          embeddedFonts,
          forceChartsAsImages: hasCharts && chartsAsImages,
        });
        setOpen(false);
      } catch (error) {
        setExportError(error instanceof Error ? error.message : String(error));
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="export-button">
          <Download />
          PPTX を書き出し
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="export-dialog">
        <DialogHeader>
          <DialogTitle>PPTX を書き出し</DialogTitle>
          <DialogDescription>書き出しオプションを設定してください。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="export-file-name" className="text-xs text-muted-foreground">
              ファイル名
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="export-file-name"
                value={fileName}
                data-testid="export-file-name"
                onChange={(event) => setFileName(event.target.value)}
              />
              <span className="shrink-0 text-sm text-muted-foreground">.pptx</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">フォントをファイルに埋め込む</Label>
              <p className="text-[11px] leading-snug text-muted-foreground/80">
                {usedFonts.length > 0
                  ? "使用中のフォントを埋め込み、フォント未インストールの環境でも同じ表示にします (ファイルサイズが大きくなります)。"
                  : "テキストに埋め込み対象のフォント (Noto Sans/Serif JP) が使われていません。"}
              </p>
              {usedFonts.length > 0 ? (
                <p
                  className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-500"
                  data-testid="export-embed-fonts-caution"
                >
                  ※ PowerPoint
                  の環境によっては、埋め込んだフォントが正しく表示されないことがあります。
                </p>
              ) : null}
            </div>
            <Toggle
              size="sm"
              variant="outline"
              pressed={embedFonts}
              disabled={usedFonts.length === 0}
              onPressedChange={setEmbedFonts}
              aria-label="フォントをファイルに埋め込む"
              data-testid="export-embed-fonts"
            >
              {embedFonts ? "ON" : "OFF"}
            </Toggle>
          </div>
          {hasCharts ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  グラフをすべて画像として書き出す
                </Label>
                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  ネイティブグラフの代わりに PNG
                  として書き出します。再編集用データは画像に埋め込まれます。
                </p>
              </div>
              <Toggle
                size="sm"
                variant="outline"
                pressed={chartsAsImages}
                onPressedChange={setChartsAsImages}
                aria-label="グラフをすべて画像として書き出す"
                data-testid="export-charts-as-images"
              >
                {chartsAsImages ? "ON" : "OFF"}
              </Toggle>
            </div>
          ) : null}
          {exportError ? (
            <p className="text-sm text-destructive" role="alert">
              書き出しに失敗しました: {exportError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={handleExport} disabled={isExporting} data-testid="export-confirm-button">
            {isExporting ? <LoaderCircle className="animate-spin" /> : <Download />}
            {isExporting ? "書き出し中…" : "書き出し"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditorToolbar() {
  const state = useEditorState();
  const dispatch = useEditorDispatch();
  const selection = useSelectedObjects();
  const [isImporting, startImport] = React.useTransition();
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canGroup = selection.length >= 2;
  const canUngroup = selection.some((object) => object.type === "group");
  const canConnect =
    selection.length === 2 && selection.every((object) => object.type !== "connector");

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
        label="コネクタで接続"
        testId="connect-button"
        onClick={() => dispatch({ type: "connect-selected" })}
        disabled={!canConnect}
      >
        <Spline />
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
        <ExportDialog deck={state.deck} />
      </div>
    </header>
  );
}
