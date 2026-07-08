/**
 * Minimal Office-like theme part (`ppt/theme/theme1.xml`). A theme is
 * mandatory for a valid presentation: the slide master references it, and
 * scheme colors / fonts / format styles resolve against it.
 */
import { A, XDeclaration, XDocument, XElement, type XName } from "openxmlsdkts";

import { attr, xmlnsDecl } from "./xml";

const SCHEME_COLORS: readonly (readonly [XName, string])[] = [
  [A.dk2, "44546A"],
  [A.lt2, "E7E6E6"],
  [A.accent1, "4472C4"],
  [A.accent2, "ED7D31"],
  [A.accent3, "A5A5A5"],
  [A.accent4, "FFC000"],
  [A.accent5, "5B9BD5"],
  [A.accent6, "70AD47"],
  [A.hlink, "0563C1"],
  [A.folHlink, "954F72"],
];

function srgb(color: string): XElement {
  return new XElement(A.srgbClr, attr("val", color));
}

function clrScheme(): XElement {
  return new XElement(
    A.clrScheme,
    attr("name", "Office"),
    new XElement(
      A.dk1,
      new XElement(A.sysClr, attr("val", "windowText"), attr("lastClr", "000000")),
    ),
    new XElement(A.lt1, new XElement(A.sysClr, attr("val", "window"), attr("lastClr", "FFFFFF"))),
    SCHEME_COLORS.map(([name, color]) => new XElement(name, srgb(color))),
  );
}

function fontSet(name: XName, latin: string): XElement {
  return new XElement(
    name,
    new XElement(A.latin, attr("typeface", latin)),
    new XElement(A.ea, attr("typeface", "")),
    new XElement(A.cs, attr("typeface", "")),
  );
}

function fontScheme(): XElement {
  return new XElement(
    A.fontScheme,
    attr("name", "Office"),
    fontSet(A.majorFont, "Calibri Light"),
    fontSet(A.minorFont, "Calibri"),
  );
}

function phClr(...transforms: XElement[]): XElement {
  return new XElement(A.schemeClr, attr("val", "phClr"), transforms);
}

function gradientFill(stops: readonly (readonly [number, XElement])[]): XElement {
  return new XElement(
    A.gradFill,
    attr("rotWithShape", 1),
    new XElement(
      A.gsLst,
      stops.map(([pos, color]) => new XElement(A.gs, attr("pos", pos), color)),
    ),
    new XElement(A.lin, attr("ang", 5400000), attr("scaled", 0)),
  );
}

function line(width: number): XElement {
  return new XElement(
    A.ln,
    attr("w", width),
    attr("cap", "flat"),
    attr("cmpd", "sng"),
    attr("algn", "ctr"),
    new XElement(A.solidFill, phClr()),
    new XElement(A.prstDash, attr("val", "solid")),
    new XElement(A.miter, attr("lim", 800000)),
  );
}

function fmtScheme(): XElement {
  return new XElement(
    A.fmtScheme,
    attr("name", "Office"),
    new XElement(
      A.fillStyleLst,
      new XElement(A.solidFill, phClr()),
      gradientFill([
        [0, phClr(new XElement(A.tint, attr("val", 67000)))],
        [100000, phClr(new XElement(A.shade, attr("val", 78000)))],
      ]),
      gradientFill([
        [0, phClr(new XElement(A.tint, attr("val", 94000)))],
        [100000, phClr(new XElement(A.shade, attr("val", 63000)))],
      ]),
    ),
    new XElement(A.lnStyleLst, line(6350), line(12700), line(19050)),
    new XElement(
      A.effectStyleLst,
      new XElement(A.effectStyle, new XElement(A.effectLst)),
      new XElement(A.effectStyle, new XElement(A.effectLst)),
      new XElement(
        A.effectStyle,
        new XElement(
          A.effectLst,
          new XElement(
            A.outerShdw,
            attr("blurRad", 57150),
            attr("dist", 19050),
            attr("dir", 5400000),
            attr("rotWithShape", 0),
            attr("algn", "ctr"),
            new XElement(
              A.srgbClr,
              attr("val", "000000"),
              new XElement(A.alpha, attr("val", 63000)),
            ),
          ),
        ),
      ),
    ),
    new XElement(
      A.bgFillStyleLst,
      new XElement(A.solidFill, phClr()),
      new XElement(A.solidFill, phClr(new XElement(A.tint, attr("val", 95000)))),
      new XElement(A.solidFill, phClr(new XElement(A.shade, attr("val", 92000)))),
    ),
  );
}

export function buildTheme(): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      A.theme,
      xmlnsDecl("a", A.namespace.namespaceName),
      attr("name", "Office Theme"),
      new XElement(A.themeElements, clrScheme(), fontScheme(), fmtScheme()),
      new XElement(A.objectDefaults),
      new XElement(A.extraClrSchemeLst),
    ),
  );
}
