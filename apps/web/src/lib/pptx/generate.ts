/**
 * Assembles the .pptx package with openxmlsdkts.
 *
 * openxmlsdkts has no "create empty package" API — every package starts from
 * `open()`. Opening an empty Flat OPC document yields a package with zero
 * parts and an initialized [Content_Types].xml, and every part (presentation,
 * master, layout, theme, slides, charts, doc props) is then added from
 * scratch via `addPart` / `addRelationship(ForPart)`.
 */
import {
  A,
  CP,
  ContentType,
  DC,
  EP,
  P,
  PmlPackage,
  R,
  RelationshipType,
  XAttribute,
  XDeclaration,
  XDocument,
  XElement,
  XNamespace,
  type OpenXmlPart,
} from "openxmlsdkts";

import { buildChart } from "./chart";
import { buildSlide, collectCharts } from "./slide";
import { buildTheme } from "./theme";
import { SLIDE_CX, SLIDE_CY, type ChartDoc, type PresentationDoc } from "./types";
import { attr, xmlnsDecl, xmlnsDefault } from "./xml";

const EMPTY_FLAT_OPC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"></pkg:package>`;

function presentationNamespaces(): XAttribute[] {
  return [
    xmlnsDecl("a", A.namespace.namespaceName),
    xmlnsDecl("r", R.namespace.namespaceName),
    xmlnsDecl("p", P.namespace.namespaceName),
  ];
}

function emptyShapeTree(): XElement {
  return new XElement(
    P.spTree,
    new XElement(
      P.nvGrpSpPr,
      new XElement(P.cNvPr, attr("id", 1), attr("name", "")),
      new XElement(P.cNvGrpSpPr),
      new XElement(P.nvPr),
    ),
    new XElement(P.grpSpPr),
  );
}

function buildPresentation(
  slideCount: number,
  embeddedFontRelIds: Map<string, { regular: string; bold: string }>,
): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      P.presentation,
      presentationNamespaces(),
      embeddedFontRelIds.size > 0 ? attr("embedTrueTypeFonts", 1) : null,
      new XElement(
        P.sldMasterIdLst,
        new XElement(P.sldMasterId, attr("id", 2147483648), attr(R.id, "rId1")),
      ),
      new XElement(
        P.sldIdLst,
        Array.from(
          { length: slideCount },
          (_, index) =>
            new XElement(P.sldId, attr("id", 256 + index), attr(R.id, `rId${3 + index}`)),
        ),
      ),
      new XElement(P.sldSz, attr("cx", SLIDE_CX), attr("cy", SLIDE_CY)),
      new XElement(P.notesSz, attr("cx", 6858000), attr("cy", 9144000)),
      // CT_Presentation puts embeddedFontLst after notesSz. Regular and
      // bold are embedded as separate static faces (PowerPoint does not
      // load variable fonts).
      embeddedFontRelIds.size > 0
        ? new XElement(
            P.embeddedFontLst,
            [...embeddedFontRelIds.entries()].map(
              ([typeface, relIds]) =>
                new XElement(
                  P.embeddedFont,
                  new XElement(P.font, attr("typeface", typeface)),
                  new XElement(P.regular, attr(R.id, relIds.regular)),
                  new XElement(P.bold, attr(R.id, relIds.bold)),
                ),
            ),
          )
        : null,
    ),
  );
}

function buildSlideMaster(): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      P.sldMaster,
      presentationNamespaces(),
      new XElement(
        P.cSld,
        new XElement(
          P.bg,
          new XElement(P.bgRef, attr("idx", 1001), new XElement(A.schemeClr, attr("val", "bg1"))),
        ),
        emptyShapeTree(),
      ),
      new XElement(
        P.clrMap,
        attr("bg1", "lt1"),
        attr("tx1", "dk1"),
        attr("bg2", "lt2"),
        attr("tx2", "dk2"),
        attr("accent1", "accent1"),
        attr("accent2", "accent2"),
        attr("accent3", "accent3"),
        attr("accent4", "accent4"),
        attr("accent5", "accent5"),
        attr("accent6", "accent6"),
        attr("hlink", "hlink"),
        attr("folHlink", "folHlink"),
      ),
      new XElement(
        P.sldLayoutIdLst,
        new XElement(P.sldLayoutId, attr("id", 2147483649), attr(R.id, "rId1")),
      ),
      new XElement(
        P.txStyles,
        new XElement(P.titleStyle),
        new XElement(P.bodyStyle),
        new XElement(P.otherStyle),
      ),
    ),
  );
}

function buildSlideLayout(): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      P.sldLayout,
      presentationNamespaces(),
      attr("type", "blank"),
      attr("preserve", 1),
      new XElement(P.cSld, attr("name", "Blank"), emptyShapeTree()),
      new XElement(P.clrMapOvr, new XElement(A.masterClrMapping)),
    ),
  );
}

function buildCoreProperties(doc: PresentationDoc): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      CP.coreProperties,
      xmlnsDecl("cp", CP.namespace.namespaceName),
      xmlnsDecl("dc", DC.namespace.namespaceName),
      new XElement(DC.title, doc.title),
      new XElement(DC.creator, "PPTX Slide Studio"),
      new XElement(CP.lastModifiedBy, "PPTX Slide Studio"),
    ),
  );
}

function buildAppProperties(slideCount: number): XDocument {
  return new XDocument(
    new XDeclaration("1.0", "UTF-8", "yes"),
    new XElement(
      EP.Properties,
      xmlnsDefault(EP.namespace.namespaceName),
      new XElement(EP.Application, "PPTX Slide Studio"),
      new XElement(EP.Slides, slideCount),
      new XElement(EP.PresentationFormat, "Widescreen"),
    ),
  );
}

/**
 * openxmlsdkts writes the default namespace of internally created parts
 * ([Content_Types].xml, .rels) as a plain string-named "xmlns" attribute,
 * which the ltxmlts serializer does not recognize as a namespace declaration
 * — it would fall back to an auto-generated `p0:` prefix. Replacing the
 * attribute with a real declaration keeps those parts in the canonical
 * `<Relationships xmlns="...">` form.
 */
function canonicalizeDefaultNamespace(part: OpenXmlPart | undefined): void {
  const data = part?.getData();
  if (!(data instanceof XDocument) || !data.root) {
    return;
  }
  const root = data.root;
  const fake = root
    .attributes()
    .find((candidate) => !candidate.isNamespaceDeclaration && candidate.name.localName === "xmlns");
  if (fake) {
    fake.remove();
    root.add(new XAttribute(XNamespace.xmlns.getName("xmlns"), root.name.namespace.namespaceName));
  }
}

export async function generatePresentation(doc: PresentationDoc): Promise<Blob> {
  const pkg = await PmlPackage.open(EMPTY_FLAT_OPC);
  const relsPartUris: string[] = ["/_rels/.rels"];
  const addRels = async (
    partUri: string,
    relationships: readonly { id: string; type: string; target: string }[],
  ): Promise<void> => {
    const part = pkg.getPartByUri(partUri)!;
    for (const relationship of relationships) {
      await pkg.addRelationshipForPart(
        part,
        relationship.id,
        relationship.type,
        relationship.target,
      );
    }
    const slash = partUri.lastIndexOf("/");
    relsPartUris.push(`${partUri.slice(0, slash)}/_rels/${partUri.slice(slash + 1)}.rels`);
  };

  pkg.addPart("/ppt/theme/theme1.xml", ContentType.theme, "xml", buildTheme());

  pkg.addPart(
    "/ppt/slideMasters/slideMaster1.xml",
    ContentType.slideMaster,
    "xml",
    buildSlideMaster(),
  );
  await addRels("/ppt/slideMasters/slideMaster1.xml", [
    { id: "rId1", type: RelationshipType.slideLayout, target: "../slideLayouts/slideLayout1.xml" },
    { id: "rId2", type: RelationshipType.theme, target: "../theme/theme1.xml" },
  ]);

  pkg.addPart(
    "/ppt/slideLayouts/slideLayout1.xml",
    ContentType.slideLayout,
    "xml",
    buildSlideLayout(),
  );
  await addRels("/ppt/slideLayouts/slideLayout1.xml", [
    { id: "rId1", type: RelationshipType.slideMaster, target: "../slideMasters/slideMaster1.xml" },
  ]);

  let chartNumber = 0;
  let imageNumber = 0;
  for (const [slideIndex, slide] of doc.slides.entries()) {
    const slideUri = `/ppt/slides/slide${slideIndex + 1}.xml`;
    const slideRels: { id: string; type: string; target: string }[] = [
      {
        id: "rId1",
        type: RelationshipType.slideLayout,
        target: "../slideLayouts/slideLayout1.xml",
      },
    ];

    const chartRelIds = new Map<ChartDoc, string>();
    for (const chart of collectCharts(slide)) {
      const relId = `rId${slideRels.length + 1}`;
      if (chart.image) {
        imageNumber += 1;
        pkg.addPart(
          `/ppt/media/image${imageNumber}.png`,
          ContentType.png,
          "base64",
          chart.image.pngBase64,
        );
        slideRels.push({
          id: relId,
          type: RelationshipType.image,
          target: `../media/image${imageNumber}.png`,
        });
      } else {
        chartNumber += 1;
        pkg.addPart(
          `/ppt/charts/chart${chartNumber}.xml`,
          ContentType.chart,
          "xml",
          buildChart(chart),
        );
        slideRels.push({
          id: relId,
          type: RelationshipType.chart,
          target: `../charts/chart${chartNumber}.xml`,
        });
      }
      chartRelIds.set(chart, relId);
    }

    pkg.addPart(slideUri, ContentType.slide, "xml", buildSlide(slide, chartRelIds));
    await addRels(slideUri, slideRels);
  }

  // Embedded fonts: one .fntdata part (raw static TTF) per face, referenced
  // from the presentation part and listed in p:embeddedFontLst.
  const embeddedFontRelIds = new Map<string, { regular: string; bold: string }>();
  const fontRels: { id: string; type: string; target: string }[] = [];
  let fontNumber = 0;
  const addFontPart = (base64: string): string => {
    fontNumber += 1;
    pkg.addPart(`/ppt/fonts/font${fontNumber}.fntdata`, ContentType.fontData, "base64", base64);
    const relId = `rIdFont${fontNumber}`;
    fontRels.push({
      id: relId,
      type: RelationshipType.font,
      target: `fonts/font${fontNumber}.fntdata`,
    });
    return relId;
  };
  for (const font of doc.embeddedFonts ?? []) {
    embeddedFontRelIds.set(font.typeface, {
      regular: addFontPart(font.regularBase64),
      bold: addFontPart(font.boldBase64),
    });
  }

  pkg.addPart(
    "/ppt/presentation.xml",
    ContentType.presentation,
    "xml",
    buildPresentation(doc.slides.length, embeddedFontRelIds),
  );
  await addRels("/ppt/presentation.xml", [
    { id: "rId1", type: RelationshipType.slideMaster, target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: RelationshipType.theme, target: "theme/theme1.xml" },
    ...doc.slides.map((_, index) => ({
      id: `rId${3 + index}`,
      type: RelationshipType.slide,
      target: `slides/slide${index + 1}.xml`,
    })),
    ...fontRels,
  ]);

  pkg.addPart(
    "/docProps/core.xml",
    ContentType.coreFileProperties,
    "xml",
    buildCoreProperties(doc),
  );
  pkg.addPart(
    "/docProps/app.xml",
    ContentType.extendedFileProperties,
    "xml",
    buildAppProperties(doc.slides.length),
  );

  await pkg.addRelationship("rId1", RelationshipType.presentation, "ppt/presentation.xml");
  await pkg.addRelationship("rId2", RelationshipType.coreFileProperties, "docProps/core.xml");
  await pkg.addRelationship("rId3", RelationshipType.extendedFileProperties, "docProps/app.xml");

  canonicalizeDefaultNamespace(pkg.getPartByUri("[Content_Types].xml"));
  for (const relsUri of relsPartUris) {
    canonicalizeDefaultNamespace(pkg.getPartByUri(relsUri));
  }

  return pkg.saveToBlobAsync();
}
