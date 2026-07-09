"use client";

import * as React from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpToLine,
  FoldVertical,
  Plus,
  X,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Separator } from "@workspace/ui/components/separator";
import { Slider } from "@workspace/ui/components/slider";
import { Textarea } from "@workspace/ui/components/textarea";
import { Toggle } from "@workspace/ui/components/toggle";
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group";

import { chartTheme } from "./chart-preview";
import {
  FONT_FAMILIES,
  remapCharStyles,
  resolveCharStyle,
  type FontFamilyKey,
  type ResolvedCharStyle,
} from "./fonts";
import { chartLabel, CHART_DEFINITIONS } from "./shape-defs";
import {
  findObjectDeep,
  useCurrentSlide,
  useEditorDispatch,
  useEditorState,
  useSelectedObjects,
} from "./store";
import { createId } from "./types";
import type {
  ArrowEnd,
  ArrowSize,
  ArrowType,
  CharStyle,
  ChartKind,
  ChartObject,
  ConnectionSite,
  ConnectorKind,
  ConnectorObject,
  ShapeObject,
  SlideObject,
  TextContent,
  TextHAlign,
  TextObject,
  TextVAlign,
} from "./types";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  testId,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  testId?: string;
}) {
  return (
    <Input
      type="number"
      className="h-8"
      value={Math.round(value)}
      min={min}
      data-testid={testId}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (!Number.isNaN(next)) {
          onChange(next);
        }
      }}
    />
  );
}

function ColorInput({
  value,
  onChange,
  testId,
  label = "色を選択",
}: {
  value: string;
  onChange: (value: string) => void;
  testId?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        data-testid={testId}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <Input
        value={value}
        aria-label={`${label} (16進数)`}
        className="h-8 font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FrameFields({ object }: { object: SlideObject }) {
  const dispatch = useEditorDispatch();
  const patchFrame = (patch: Partial<{ x: number; y: number; width: number; height: number }>) => {
    dispatch({
      type: "resize-object",
      id: object.id,
      frame: {
        x: patch.x ?? object.x,
        y: patch.y ?? object.y,
        width: Math.max(24, patch.width ?? object.width),
        height: Math.max(24, patch.height ?? object.height),
      },
    });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="X">
        <NumberInput value={object.x} onChange={(x) => patchFrame({ x })} testId="frame-x" />
      </Field>
      <Field label="Y">
        <NumberInput value={object.y} onChange={(y) => patchFrame({ y })} testId="frame-y" />
      </Field>
      <Field label="幅">
        <NumberInput value={object.width} onChange={(width) => patchFrame({ width })} min={24} />
      </Field>
      <Field label="高さ">
        <NumberInput value={object.height} onChange={(height) => patchFrame({ height })} min={24} />
      </Field>
    </div>
  );
}

const H_ALIGN_ITEMS: { value: TextHAlign; label: string; icon: React.ReactNode }[] = [
  { value: "left", label: "左揃え", icon: <AlignLeft /> },
  { value: "center", label: "中央揃え", icon: <AlignCenter /> },
  { value: "right", label: "右揃え", icon: <AlignRight /> },
  { value: "justify", label: "両端揃え", icon: <AlignJustify /> },
];

const V_ALIGN_ITEMS: { value: TextVAlign; label: string; icon: React.ReactNode }[] = [
  { value: "top", label: "上揃え", icon: <ArrowUpToLine /> },
  { value: "center", label: "上下中央", icon: <FoldVertical /> },
  { value: "bottom", label: "下揃え", icon: <ArrowDownToLine /> },
];

/**
 * Info + styling for the text range selected in the canvas' in-place editor
 * (double-click a shape / text box, then use Shift+arrow keys or the mouse).
 * Font family, size, color, bold and italic apply per character.
 */
function TextSelectionFields({
  object,
  patchText,
}: {
  object: (ShapeObject | TextObject) & { text: TextContent };
  patchText: (patch: Partial<TextContent>) => void;
}) {
  const state = useEditorState();
  const editing = state.textEditing;
  if (!editing || editing.objectId !== object.id) {
    return null;
  }
  const content = object.text;
  const start = Math.min(editing.selectionStart, content.text.length);
  const end = Math.min(editing.selectionEnd, content.text.length);
  if (start === end) {
    return (
      <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
        編集中: Shift+矢印キーまたはドラッグで文字を選択すると、その範囲に書式
        (フォント・サイズ・色・太字・斜体) を適用できます。
      </p>
    );
  }
  const selectedText = content.text.slice(start, end);
  const resolved = Array.from({ length: end - start }, (_, i) =>
    resolveCharStyle(content, start + i),
  );
  const uniform = <T,>(pick: (style: ResolvedCharStyle) => T): T | undefined => {
    const values = new Set(resolved.map(pick));
    return values.size === 1 ? [...values][0] : undefined;
  };
  const uniformFont = uniform((style) => style.fontFamily);
  const fontMixed = new Set(resolved.map((style) => style.fontFamily)).size > 1;
  const uniformSize = uniform((style) => style.fontSize);
  const uniformColor = uniform((style) => style.color);
  const allBold = resolved.every((style) => style.bold);
  const allItalic = resolved.every((style) => style.italic);

  /** Merges the patch into every character of the selection. */
  const applyStyle = (stylePatch: Partial<CharStyle>) => {
    const charStyles: (CharStyle | null)[] = Array.from(
      { length: content.text.length },
      (_, i) => content.charStyles?.[i] ?? null,
    );
    for (let index = start; index < end; index += 1) {
      const merged: CharStyle = { ...charStyles[index], ...stylePatch };
      // Drop keys explicitly reset to "inherit the base value".
      for (const key of Object.keys(merged) as (keyof CharStyle)[]) {
        if (merged[key] === undefined) {
          delete merged[key];
        }
      }
      charStyles[index] = Object.keys(merged).length > 0 ? merged : null;
    }
    patchText({ charStyles: charStyles.some((style) => style !== null) ? charStyles : undefined });
  };

  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
      <p className="text-[11px] text-muted-foreground" data-testid="text-selection-info">
        選択中 ({start + 1}〜{end} 文字目):{" "}
        <span className="font-medium text-foreground">「{selectedText}」</span>
      </p>
      <Select
        value={fontMixed ? "" : (uniformFont ?? "default")}
        onValueChange={(value) =>
          applyStyle({ fontFamily: value === "default" ? undefined : (value as FontFamilyKey) })
        }
      >
        <SelectTrigger className="h-8 w-full" data-testid="selection-font-select">
          <SelectValue placeholder="フォント (混在)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">既定 (全体設定に従う)</SelectItem>
          {FONT_FAMILIES.map((definition) => (
            <SelectItem key={definition.key} value={definition.key}>
              <span style={{ fontFamily: definition.css }}>{definition.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <Field label="サイズ (pt)">
          <NumberInput
            value={uniformSize ?? content.fontSize}
            min={6}
            testId="selection-font-size"
            onChange={(fontSize) => applyStyle({ fontSize: Math.max(6, fontSize) })}
          />
        </Field>
        <Field label="色">
          <ColorInput
            value={uniformColor ?? content.color}
            testId="selection-color"
            onChange={(color) => applyStyle({ color })}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Toggle
          size="sm"
          variant="outline"
          pressed={allBold}
          onPressedChange={(bold) => applyStyle({ bold })}
          aria-label="選択範囲を太字"
          data-testid="selection-bold"
        >
          <span className="font-bold">B</span>
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={allItalic}
          onPressedChange={(italic) => applyStyle({ italic })}
          aria-label="選択範囲を斜体"
          data-testid="selection-italic"
        >
          <span className="italic">I</span>
        </Toggle>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 px-2 text-[11px]"
          onClick={() =>
            applyStyle({
              fontFamily: undefined,
              fontSize: undefined,
              color: undefined,
              bold: undefined,
              italic: undefined,
            })
          }
        >
          書式をクリア
        </Button>
      </div>
    </div>
  );
}

function TextFields({ object }: { object: (ShapeObject | TextObject) & { text: TextContent } }) {
  const dispatch = useEditorDispatch();
  const patchText = (patch: Partial<TextContent>) => {
    dispatch({
      type: "update-object",
      id: object.id,
      patch: { text: { ...object.text, ...patch } },
    });
  };

  return (
    <div className="space-y-3">
      <TextSelectionFields object={object} patchText={patchText} />
      <Field label="テキスト">
        <Textarea
          value={object.text.text}
          rows={3}
          data-testid="text-content"
          onChange={(event) =>
            patchText({
              text: event.target.value,
              charStyles: remapCharStyles(
                object.text.text,
                event.target.value,
                object.text.charStyles,
              ),
            })
          }
        />
      </Field>
      <Field label="フォント">
        <Select
          value={object.text.fontFamily ?? "default"}
          onValueChange={(value) =>
            patchText({
              fontFamily: value === "default" ? undefined : (value as FontFamilyKey),
            })
          }
        >
          <SelectTrigger className="h-8 w-full" data-testid="font-family-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">既定</SelectItem>
            {FONT_FAMILIES.map((definition) => (
              <SelectItem key={definition.key} value={definition.key}>
                <span style={{ fontFamily: definition.css }}>{definition.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="フォントサイズ (pt)">
          <NumberInput
            value={object.text.fontSize}
            min={6}
            onChange={(fontSize) => patchText({ fontSize: Math.max(6, fontSize) })}
          />
        </Field>
        <Field label="文字色">
          <ColorInput value={object.text.color} onChange={(color) => patchText({ color })} />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Toggle
          size="sm"
          variant="outline"
          pressed={object.text.bold}
          onPressedChange={(bold) => patchText({ bold })}
          aria-label="太字"
        >
          <span className="font-bold">B</span>
        </Toggle>
        <Toggle
          size="sm"
          variant="outline"
          pressed={object.text.italic}
          onPressedChange={(italic) => patchText({ italic })}
          aria-label="斜体"
        >
          <span className="italic">I</span>
        </Toggle>
      </div>
      <Field label="横位置">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={object.text.align}
          onValueChange={(align) => {
            if (align) {
              patchText({ align: align as TextHAlign });
            }
          }}
        >
          {H_ALIGN_ITEMS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              aria-label={item.label}
              data-testid={`halign-${item.value}`}
            >
              {item.icon}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="縦位置">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={object.text.verticalAlign}
          onValueChange={(align) => {
            if (align) {
              patchText({ verticalAlign: align as TextVAlign });
            }
          }}
        >
          {V_ALIGN_ITEMS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              aria-label={item.label}
              data-testid={`valign-${item.value}`}
            >
              {item.icon}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </div>
  );
}

function ShapeFields({ object }: { object: ShapeObject }) {
  const dispatch = useEditorDispatch();
  const patch = (patchValue: Partial<ShapeObject>) =>
    dispatch({ type: "update-object", id: object.id, patch: patchValue });

  return (
    <div className="space-y-3">
      <Field label="塗りつぶし">
        <ColorInput value={object.fill} onChange={(fill) => patch({ fill })} testId="shape-fill" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="枠線色">
          <ColorInput
            value={object.outlineColor}
            onChange={(outlineColor) => patch({ outlineColor })}
          />
        </Field>
        <Field label="枠線幅 (px)">
          <NumberInput
            value={object.outlineWidth}
            min={0}
            onChange={(outlineWidth) => patch({ outlineWidth: Math.max(0, outlineWidth) })}
          />
        </Field>
      </div>
    </div>
  );
}

function seriesValuesToText(values: number[]): string {
  return values.join(", ");
}

function parseNumberList(text: string): number[] {
  return text
    .split(/[,、\s]+/)
    .filter((token) => token.length > 0)
    .map((token) => Number(token))
    .filter((n) => !Number.isNaN(n));
}

/**
 * PowerPoint chart style gallery (`c:style` 1-48) — the only chart color
 * control this app serializes. 8 columns of color schemes × 6 rows.
 */
function ChartStylePicker({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (style: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-8 gap-1" data-testid="chart-style-grid">
        {Array.from({ length: 48 }, (_, index) => {
          const style = index + 1;
          const theme = chartTheme(style);
          const selected = value === style;
          return (
            <button
              key={style}
              type="button"
              title={`スタイル ${style}`}
              aria-label={`チャートスタイル ${style}`}
              aria-pressed={selected}
              onClick={() => onChange(selected ? undefined : style)}
              className={`flex h-6 items-end justify-center gap-px rounded-sm border p-0.5 ${
                selected ? "ring-2 ring-primary ring-offset-1" : "hover:border-primary/60"
              }`}
              style={{ backgroundColor: theme.background }}
            >
              {[0, 1, 2].map((chip) => (
                <span
                  key={chip}
                  className="w-1 rounded-[1px]"
                  style={{
                    height: `${8 + chip * 4}px`,
                    backgroundColor: theme.colors[chip % theme.colors.length],
                  }}
                />
              ))}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {value === undefined
          ? "スタイル未指定 (PowerPoint の既定配色)。クリックで選択、再クリックで解除。"
          : `スタイル ${value} を適用中。系列の個別色指定はこのアプリのエクスポータが未対応のため、配色はスタイルで選びます。`}
      </p>
    </div>
  );
}

function BubbleSeriesFields({
  series,
  index,
  patchSeries,
}: {
  series: ChartObject["series"][number];
  index: number;
  patchSeries: (id: string, patch: Partial<ChartObject["series"][number]>) => void;
}) {
  return (
    <>
      <Input
        defaultValue={seriesValuesToText(series.xValues ?? [])}
        className="h-7 font-mono text-xs"
        placeholder="X値 (カンマ区切り)"
        aria-label={`系列 ${index + 1} のX値`}
        onBlur={(event) => patchSeries(series.id, { xValues: parseNumberList(event.target.value) })}
      />
      <Input
        defaultValue={seriesValuesToText(series.bubbleSizes ?? [])}
        className="h-7 font-mono text-xs"
        placeholder="バブルサイズ (カンマ区切り)"
        aria-label={`系列 ${index + 1} のバブルサイズ`}
        onBlur={(event) =>
          patchSeries(series.id, { bubbleSizes: parseNumberList(event.target.value) })
        }
      />
    </>
  );
}

function ChartFields({ object }: { object: ChartObject }) {
  const dispatch = useEditorDispatch();
  const patch = (patchValue: Partial<ChartObject>) =>
    dispatch({ type: "update-object", id: object.id, patch: patchValue });
  const patchSeries = (id: string, seriesPatch: Partial<ChartObject["series"][number]>) =>
    patch({
      series: object.series.map((s) => (s.id === id ? { ...s, ...seriesPatch } : s)),
    });
  const isBubble = object.chartType === "bubble";

  return (
    <div className="space-y-3">
      <Field label="グラフの種類">
        <Select
          value={object.chartType}
          onValueChange={(chartType) => patch({ chartType: chartType as ChartKind })}
        >
          <SelectTrigger size="sm" className="w-full" data-testid="chart-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_DEFINITIONS.map((definition) => (
              <SelectItem key={definition.kind} value={definition.kind}>
                {definition.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="タイトル">
        <Input
          value={object.title}
          className="h-8"
          data-testid="chart-title"
          onChange={(event) => patch({ title: event.target.value })}
        />
      </Field>
      <Field label="チャートスタイル (配色)">
        <ChartStylePicker value={object.style} onChange={(style) => patch({ style })} />
      </Field>
      {isBubble ? null : (
        <Field label="カテゴリ (カンマ区切り)">
          <Input
            value={object.categories.join(", ")}
            className="h-8"
            data-testid="chart-categories"
            onChange={(event) =>
              patch({
                categories: event.target.value.split(/[,、]/).map((token) => token.trim()),
              })
            }
          />
        </Field>
      )}
      {object.chartType === "stock" ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          株価チャートは系列を「高値・安値・終値」の順に 3 つ用意してください。
        </p>
      ) : null}
      <Field label="系列">
        <div className="space-y-2">
          {object.series.map((series, index) => (
            <div key={series.id} className="space-y-1 rounded-md border p-2">
              <div className="flex items-center gap-1">
                <Input
                  value={series.name}
                  className="h-7 text-xs"
                  aria-label={`系列 ${index + 1} の名前`}
                  onChange={(event) => patchSeries(series.id, { name: event.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`系列 ${index + 1} を削除`}
                  disabled={object.series.length <= 1}
                  onClick={() => patch({ series: object.series.filter((s) => s.id !== series.id) })}
                >
                  <X />
                </Button>
              </div>
              <Input
                defaultValue={seriesValuesToText(series.values)}
                className="h-7 font-mono text-xs"
                placeholder={isBubble ? "Y値 (カンマ区切り)" : undefined}
                aria-label={`系列 ${index + 1} の${isBubble ? "Y値" : "値"}`}
                onBlur={(event) =>
                  patchSeries(series.id, { values: parseNumberList(event.target.value) })
                }
              />
              {isBubble ? (
                <BubbleSeriesFields series={series} index={index} patchSeries={patchSeries} />
              ) : null}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              patch({
                series: [
                  ...object.series,
                  isBubble
                    ? {
                        id: createId("series"),
                        name: `系列 ${object.series.length + 1}`,
                        values: [10, 20, 30, 40],
                        xValues: [10, 20, 30, 40],
                        bubbleSizes: [100, 100, 100, 100],
                      }
                    : {
                        id: createId("series"),
                        name: `系列 ${object.series.length + 1}`,
                        values: object.categories.map(() => 100),
                      },
                ],
              })
            }
          >
            <Plus /> 系列を追加
          </Button>
        </div>
      </Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">凡例を表示</Label>
        <Toggle
          size="sm"
          variant="outline"
          pressed={object.showLegend}
          onPressedChange={(showLegend) => patch({ showLegend })}
          aria-label="凡例を表示"
        >
          {object.showLegend ? "ON" : "OFF"}
        </Toggle>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">画像として書き出す</Label>
        <Toggle
          size="sm"
          variant="outline"
          pressed={object.exportAsImage ?? false}
          onPressedChange={(exportAsImage) => patch({ exportAsImage })}
          aria-label="画像として書き出す"
          data-testid="chart-export-as-image"
        >
          {object.exportAsImage ? "ON" : "OFF"}
        </Toggle>
      </div>
      {object.exportAsImage ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          PowerPoint 上では画像 (PNG)
          になりますが、再編集用のデータが画像に埋め込まれるため、このアプリで開き直すとグラフとして編集できます。
        </p>
      ) : null}
    </div>
  );
}

const CONNECTOR_KIND_ITEMS: { value: ConnectorKind; label: string }[] = [
  { value: "straight", label: "直線" },
  { value: "bent", label: "カギ線" },
];

const SITE_ITEMS: { value: ConnectionSite; label: string }[] = [
  { value: "top", label: "上" },
  { value: "right", label: "右" },
  { value: "bottom", label: "下" },
  { value: "left", label: "左" },
];

function ConnectorEndpointField({
  label,
  connector,
  endpoint,
}: {
  label: string;
  connector: ConnectorObject;
  endpoint: "start" | "end";
}) {
  const slide = useCurrentSlide();
  const dispatch = useEditorDispatch();
  const reference = connector[endpoint];
  const target = reference.objectId ? findObjectDeep(slide.objects, reference.objectId) : undefined;
  const targetLabel = reference.objectId ? (target?.name ?? "(不明)") : "自由な点";
  return (
    <Field label={`${label}: ${targetLabel}`}>
      <Select
        value={reference.site}
        onValueChange={(site) =>
          dispatch({
            type: "update-object",
            id: connector.id,
            patch: { [endpoint]: { ...reference, site: site as ConnectionSite } },
          })
        }
      >
        <SelectTrigger className="h-8 w-full" data-testid={`connector-${endpoint}-site`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SITE_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ConnectorFields({ object }: { object: ConnectorObject }) {
  const dispatch = useEditorDispatch();
  const patch = (patchValue: Partial<ConnectorObject>) =>
    dispatch({ type: "update-object", id: object.id, patch: patchValue });

  return (
    <div className="space-y-3">
      <Field label="種類">
        <Select
          value={object.connectorType}
          onValueChange={(value) => patch({ connectorType: value as ConnectorKind })}
        >
          <SelectTrigger className="h-8 w-full" data-testid="connector-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONNECTOR_KIND_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <ConnectorEndpointField label="始点" connector={object} endpoint="start" />
        <ConnectorEndpointField label="終点" connector={object} endpoint="end" />
      </div>
      {object.connectorType === "bent" ? (
        <Field label={`折れ位置 (${Math.round((object.bend ?? 0.5) * 100)}%)`}>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[Math.round((object.bend ?? 0.5) * 100)]}
            data-testid="connector-bend"
            onValueChange={([value]) => patch({ bend: (value ?? 50) / 100 })}
          />
        </Field>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        data-testid="connector-swap"
        onClick={() => patch({ start: object.end, end: object.start })}
      >
        <ArrowLeftRight /> 始点と終点を反転
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Field label="線の太さ (px)">
          <NumberInput
            value={object.lineWidth}
            min={1}
            onChange={(lineWidth) => patch({ lineWidth: Math.max(1, lineWidth) })}
          />
        </Field>
        <Field label="線の色">
          <ColorInput value={object.lineColor} onChange={(lineColor) => patch({ lineColor })} />
        </Field>
      </div>
      <ConnectorArrowField
        label="始点の矢印"
        endpoint="start"
        arrow={object.startArrow}
        onChange={(startArrow) => patch({ startArrow })}
      />
      <ConnectorArrowField
        label="終点の矢印"
        endpoint="end"
        arrow={object.endArrow}
        onChange={(endArrow) => patch({ endArrow })}
      />
    </div>
  );
}

const ARROW_TYPE_ITEMS: { value: ArrowType; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "triangle", label: "三角" },
  { value: "stealth", label: "細三角" },
  { value: "arrow", label: "線" },
  { value: "diamond", label: "ひし形" },
  { value: "oval", label: "円" },
];

const ARROW_SIZE_ITEMS: { value: ArrowSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
];

function ConnectorArrowField({
  label,
  endpoint,
  arrow,
  onChange,
}: {
  label: string;
  endpoint: "start" | "end";
  arrow: ArrowEnd;
  onChange: (arrow: ArrowEnd) => void;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={arrow.type}
          onValueChange={(type) => onChange({ ...arrow, type: type as ArrowType })}
        >
          <SelectTrigger className="h-8 w-full" data-testid={`connector-${endpoint}-arrow-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARROW_TYPE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={arrow.size}
          disabled={arrow.type === "none"}
          onValueChange={(size) => onChange({ ...arrow, size: size as ArrowSize })}
        >
          <SelectTrigger className="h-8 w-full" data-testid={`connector-${endpoint}-arrow-size`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARROW_SIZE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </Field>
  );
}

function SlideFields() {
  const slide = useCurrentSlide();
  const dispatch = useEditorDispatch();
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">スライド</h3>
      <Field label="背景色">
        <ColorInput
          value={slide.background}
          onChange={(color) => dispatch({ type: "set-slide-background", color })}
        />
      </Field>
      <p className="text-xs leading-relaxed text-muted-foreground">
        オブジェクトをクリックで選択、何もない場所からドラッグすると矩形に触れたオブジェクトをまとめて選択できます。
      </p>
    </div>
  );
}

export function Inspector() {
  const selection = useSelectedObjects();

  return (
    <aside
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-background p-4"
      data-testid="inspector"
    >
      {selection.length === 0 ? <SlideFields /> : null}

      {selection.length === 1 && selection[0] ? <SingleObjectFields object={selection[0]} /> : null}

      {selection.length > 1 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">{selection.length} 個のオブジェクトを選択中</h3>
          <p className="text-xs text-muted-foreground">
            ツールバーからグループ化・複製・削除ができます。
          </p>
        </div>
      ) : null}
    </aside>
  );
}

/**
 * Object name editor. Commits on blur / Enter; the store makes the final
 * name unique within the slide (a numeric suffix is appended on collision).
 */
function NameField({ object }: { object: SlideObject }) {
  const dispatch = useEditorDispatch();
  const [value, setValue] = React.useState(object.name);

  // Follow store-side changes (selection change, suffix appended on commit).
  React.useEffect(() => {
    setValue(object.name);
  }, [object.id, object.name]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== object.name) {
      dispatch({ type: "rename-object", id: object.id, name: trimmed });
    } else {
      setValue(object.name);
    }
  };

  return (
    <Field label="名前">
      <Input
        value={value}
        className="h-8"
        data-testid="object-name-input"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            setValue(object.name);
          }
        }}
      />
    </Field>
  );
}

function SingleObjectFields({ object }: { object: SlideObject }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">
        {object.type === "shape" && "図形"}
        {object.type === "text" && "テキスト"}
        {object.type === "chart" && chartLabel(object.chartType)}
        {object.type === "group" && `グループ (${object.children.length} 個)`}
        {object.type === "connector" && "コネクタ"}
        {object.type === "image" && "画像"}
      </h3>
      <NameField object={object} />
      {/* Connector geometry is derived from its endpoints. */}
      {object.type === "connector" ? null : <FrameFields object={object} />}
      {object.type === "connector" ? (
        <>
          <Separator />
          <ConnectorFields object={object} />
        </>
      ) : null}
      {object.type === "shape" ? (
        <>
          <Separator />
          <ShapeFields object={object} />
          <Separator />
          <TextFields object={object} />
        </>
      ) : null}
      {object.type === "text" ? (
        <>
          <Separator />
          <TextFields object={object} />
        </>
      ) : null}
      {object.type === "chart" ? (
        <>
          <Separator />
          <ChartFields object={object} />
        </>
      ) : null}
      {object.type === "group" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          グループはまとめて移動・拡大縮小できます。「グループ解除」で個別のオブジェクトに戻せます。
        </p>
      ) : null}
    </div>
  );
}
