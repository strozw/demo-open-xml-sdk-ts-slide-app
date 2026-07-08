/**
 * Re-edit metadata carried on exported charts.
 *
 * The serialized editor ChartObject JSON rides in an
 * `<a:extLst><a:ext uri="{...}">` extension inside the shape's `p:cNvPr` —
 * the OOXML-sanctioned slot for application-specific data, which PowerPoint
 * preserves on round trip (`CT_OfficeArtExtension` accepts any element from
 * another namespace). Image charts additionally embed the same JSON in the
 * PNG itself as an iTXt chunk (see `../png-text.ts`).
 */
import { A, XElement, XNamespace } from "openxmlsdkts";

import { attr, xmlnsDecl } from "./xml";

/** `a:ext@uri` — fixed GUID identifying this app's extension. */
export const CHART_META_EXT_URI = "{8F2C3A41-6B1D-4E5A-9C7F-2D94E1B0A6C3}";

export const CHART_META_NS = XNamespace.get("http://schemas.pptx-slide-studio.dev/chart-meta/1.0");

const CHART_META_ELEMENT = CHART_META_NS.getName("chartMeta");

/** iTXt keyword for the same JSON embedded in exported PNG images. */
export const PNG_TEXT_KEYWORD = "pptx-slide-studio:chart";

/**
 * `<a:extLst><a:ext uri="{...}"><pss:chartMeta data="{json}"/></a:ext></a:extLst>`
 *
 * The JSON lives in an attribute: ltxmlts escapes `&` / `<` / `'` on write
 * and decodes them on parse, so arbitrary JSON round-trips safely.
 */
export function chartMetaExtLst(reEditData: string): XElement {
  return new XElement(
    A.extLst,
    new XElement(
      A.ext,
      attr("uri", CHART_META_EXT_URI),
      new XElement(
        CHART_META_ELEMENT,
        xmlnsDecl("pss", CHART_META_NS.namespaceName),
        attr("data", reEditData),
      ),
    ),
  );
}

/** Reads the JSON back from a `p:cNvPr` element (p:pic or p:graphicFrame). */
export function readChartMeta(cNvPr: XElement): string | undefined {
  return cNvPr
    .element(A.extLst)
    ?.elements(A.ext)
    .find((ext) => ext.attribute("uri")?.value === CHART_META_EXT_URI)
    ?.element(CHART_META_ELEMENT)
    ?.attribute("data")?.value;
}
