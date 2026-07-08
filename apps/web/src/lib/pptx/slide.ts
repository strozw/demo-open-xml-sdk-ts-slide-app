/**
 * Slide part builder (`ppt/slides/slideN.xml`): shapes, text boxes, groups
 * and chart graphic frames inside the shape tree.
 */
import { A, C, P, R, XDeclaration, XDocument, XElement } from "openxmlsdkts";

import { chartMetaExtLst } from "./chart-meta";
import type { ChartDoc, GroupDoc, ShapeDoc, SlideChildDoc, SlideDoc, TextBodyDoc } from "./types";
import { attr, offExt, solidFill, xfrm, xmlnsDecl } from "./xml";

const CHART_GRAPHIC_URI = "http://schemas.openxmlformats.org/drawingml/2006/chart";

/** Relationship id (on the slide part) per chart, in encounter order. */
export type ChartRelIds = ReadonlyMap<ChartDoc, string>;

/** Doles out unique shape ids within one slide; id 1 is the root group. */
class ShapeIdAllocator {
  private nextId = 2;

  next(): number {
    const id = this.nextId;
    this.nextId += 1;
    return id;
  }
}

function nonVisualProps(
  container: typeof P.nvSpPr,
  descriptor: XElement,
  id: number,
  name: string,
  // Extra p:cNvPr content; a:extLst is the last child in
  // CT_NonVisualDrawingProps, so appending it is always schema-valid.
  cNvPrContent?: XElement | null,
): XElement {
  return new XElement(
    container,
    new XElement(P.cNvPr, attr("id", id), attr("name", name), cNvPrContent),
    descriptor,
    new XElement(P.nvPr),
  );
}

function textBodyElement(body: TextBodyDoc | undefined): XElement {
  return new XElement(
    P.txBody,
    new XElement(
      A.bodyPr,
      attr("wrap", "square"),
      attr("rtlCol", 0),
      body?.anchor ? attr("anchor", body.anchor) : null,
    ),
    new XElement(A.lstStyle),
    body && body.paragraphs.length > 0
      ? body.paragraphs.map(
          (paragraph) =>
            new XElement(
              A.p,
              paragraph.align ? new XElement(A.pPr, attr("algn", paragraph.align)) : null,
              paragraph.runs.map(
                (run) =>
                  new XElement(
                    A.r,
                    new XElement(
                      A.rPr,
                      attr("lang", "ja-JP"),
                      run.sizePt === undefined ? null : attr("sz", Math.round(run.sizePt * 100)),
                      run.bold ? attr("b", 1) : null,
                      run.italic ? attr("i", 1) : null,
                      attr("dirty", 0),
                      run.color ? solidFill(run.color) : null,
                      // Both a:latin and a:ea so Latin and Japanese glyphs
                      // pick up the same face in PowerPoint.
                      run.font
                        ? [
                            new XElement(A.latin, attr("typeface", run.font)),
                            new XElement(A.ea, attr("typeface", run.font)),
                          ]
                        : null,
                    ),
                    new XElement(A.t, run.text),
                  ),
              ),
            ),
        )
      : new XElement(A.p, new XElement(A.endParaRPr, attr("lang", "ja-JP"))),
  );
}

function shapeElement(shape: ShapeDoc, ids: ShapeIdAllocator): XElement {
  return new XElement(
    P.sp,
    nonVisualProps(
      P.nvSpPr,
      new XElement(P.cNvSpPr, shape.textBox ? attr("txBox", 1) : null),
      ids.next(),
      shape.name,
    ),
    new XElement(
      P.spPr,
      xfrm(shape.frame),
      new XElement(A.prstGeom, attr("prst", shape.geometry), new XElement(A.avLst)),
      shape.fill ? solidFill(shape.fill) : new XElement(A.noFill),
      shape.outline
        ? new XElement(A.ln, attr("w", shape.outline.widthEmu), solidFill(shape.outline.color))
        : null,
    ),
    textBodyElement(shape.textBody),
  );
}

function chartFrameElement(chart: ChartDoc, relId: string, ids: ShapeIdAllocator): XElement {
  return new XElement(
    P.graphicFrame,
    nonVisualProps(
      P.nvGraphicFramePr,
      new XElement(P.cNvGraphicFramePr),
      ids.next(),
      chart.name,
      chart.reEditData ? chartMetaExtLst(chart.reEditData) : null,
    ),
    new XElement(P.xfrm, offExt(chart.frame)),
    new XElement(
      A.graphic,
      new XElement(
        A.graphicData,
        attr("uri", CHART_GRAPHIC_URI),
        new XElement(C.chart, attr(R.id, relId)),
      ),
    ),
  );
}

/**
 * Chart rasterized as a picture: `p:pic` with the PNG media part referenced
 * from `a:blip@r:embed`, carrying the re-edit metadata on its `p:cNvPr`.
 */
function picElement(chart: ChartDoc, relId: string, ids: ShapeIdAllocator): XElement {
  return new XElement(
    P.pic,
    nonVisualProps(
      P.nvPicPr,
      new XElement(P.cNvPicPr, new XElement(A.picLocks, attr("noChangeAspect", 1))),
      ids.next(),
      chart.name,
      chart.reEditData ? chartMetaExtLst(chart.reEditData) : null,
    ),
    new XElement(
      P.blipFill,
      new XElement(A.blip, attr(R.embed, relId)),
      new XElement(A.stretch, new XElement(A.fillRect)),
    ),
    new XElement(
      P.spPr,
      xfrm(chart.frame),
      new XElement(A.prstGeom, attr("prst", "rect"), new XElement(A.avLst)),
    ),
  );
}

function groupElement(group: GroupDoc, chartRelIds: ChartRelIds, ids: ShapeIdAllocator): XElement {
  return new XElement(
    P.grpSp,
    nonVisualProps(P.nvGrpSpPr, new XElement(P.cNvGrpSpPr), ids.next(), group.name),
    // chOff/chExt == off/ext: children keep absolute slide coordinates.
    new XElement(P.grpSpPr, xfrm(group.frame, group.frame)),
    group.children.map((child) => childElement(child, chartRelIds, ids)),
  );
}

function childElement(
  child: SlideChildDoc,
  chartRelIds: ChartRelIds,
  ids: ShapeIdAllocator,
): XElement {
  switch (child.type) {
    case "shape":
      return shapeElement(child, ids);
    case "chart":
      return child.image
        ? picElement(child, chartRelIds.get(child)!, ids)
        : chartFrameElement(child, chartRelIds.get(child)!, ids);
    case "group":
      return groupElement(child, chartRelIds, ids);
  }
}

export function buildSlide(slide: SlideDoc, chartRelIds: ChartRelIds): XDocument {
  const ids = new ShapeIdAllocator();
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      P.sld,
      xmlnsDecl("a", A.namespace.namespaceName),
      xmlnsDecl("r", R.namespace.namespaceName),
      xmlnsDecl("p", P.namespace.namespaceName),
      xmlnsDecl("c", C.namespace.namespaceName),
      new XElement(
        P.cSld,
        slide.background
          ? new XElement(
              P.bg,
              new XElement(P.bgPr, solidFill(slide.background), new XElement(A.effectLst)),
            )
          : null,
        new XElement(
          P.spTree,
          new XElement(
            P.nvGrpSpPr,
            new XElement(P.cNvPr, attr("id", 1), attr("name", "")),
            new XElement(P.cNvGrpSpPr),
            new XElement(P.nvPr),
          ),
          new XElement(P.grpSpPr),
          slide.children.map((child) => childElement(child, chartRelIds, ids)),
        ),
      ),
      new XElement(P.clrMapOvr, new XElement(A.masterClrMapping)),
    ),
  );
}

/** Charts on the slide (including inside groups), in document order. */
export function collectCharts(slide: SlideDoc): ChartDoc[] {
  const charts: ChartDoc[] = [];
  const visit = (child: SlideChildDoc): void => {
    if (child.type === "chart") {
      charts.push(child);
    } else if (child.type === "group") {
      child.children.forEach(visit);
    }
  };
  slide.children.forEach(visit);
  return charts;
}
