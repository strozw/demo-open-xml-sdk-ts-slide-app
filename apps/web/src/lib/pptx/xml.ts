/**
 * Small LINQ-to-XML helpers shared by the part builders.
 *
 * openxmlsdkts re-exports the ltxmlts primitives (XElement, XAttribute, ...)
 * and provides atomized XName/XNamespace constants via its static namespace
 * classes (P, A, C, ...), so everything is imported from one package.
 */
import { A, XAttribute, XElement, XNamespace, type XName } from "openxmlsdkts";

import type { FrameEmu } from "./types";

/**
 * Namespace declaration attribute (`xmlns:prefix="uri"`). The ltxmlts
 * serializer only honours prefixes declared this way (a plain string-named
 * "xmlns" attribute is not recognized and would trigger auto-generated
 * `p0`-style prefixes).
 */
export function xmlnsDecl(prefix: string, namespaceName: string): XAttribute {
  return new XAttribute(XNamespace.xmlns.getName(prefix), namespaceName);
}

/** Default namespace declaration (`xmlns="uri"`), the ltxmlts way. */
export function xmlnsDefault(namespaceName: string): XAttribute {
  return new XAttribute(XNamespace.xmlns.getName("xmlns"), namespaceName);
}

export function attr(name: string | XName, value: string | number): XAttribute {
  return new XAttribute(name as string, value);
}

/** `<a:solidFill><a:srgbClr val="RRGGBB"/></a:solidFill>` */
export function solidFill(color: string): XElement {
  return new XElement(A.solidFill, new XElement(A.srgbClr, attr("val", color)));
}

/** `<a:off/><a:ext/>` children shared by shape and group transforms. */
export function offExt(frame: FrameEmu): XElement[] {
  return [
    new XElement(A.off, attr("x", frame.x), attr("y", frame.y)),
    new XElement(A.ext, attr("cx", frame.cx), attr("cy", frame.cy)),
  ];
}

/**
 * `<a:xfrm>` for a shape, or for a group when `childFrame` is given. Group
 * children keep absolute slide coordinates, so the child offset/extent is
 * written equal to the group frame itself.
 */
export function xfrm(frame: FrameEmu, childFrame?: FrameEmu): XElement {
  return new XElement(
    A.xfrm,
    offExt(frame),
    childFrame
      ? [
          new XElement(A.chOff, attr("x", childFrame.x), attr("y", childFrame.y)),
          new XElement(A.chExt, attr("cx", childFrame.cx), attr("cy", childFrame.cy)),
        ]
      : null,
  );
}
