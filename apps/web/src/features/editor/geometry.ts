import type { ConnectionSite, ConnectorObject, Rect, SlideObject } from "./types";

export interface Point {
  x: number;
  y: number;
}

export function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** True when the two rectangles touch or overlap. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

export function boundingBox(rects: readonly Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function objectBounds(object: SlideObject): Rect {
  return { x: object.x, y: object.y, width: object.width, height: object.height };
}

/** Absolute position of a connection site (bounding-box edge midpoint). */
export function sitePoint(bounds: Rect, site: ConnectionSite): { x: number; y: number } {
  switch (site) {
    case "top":
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case "right":
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case "bottom":
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case "left":
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }
}

/** Facing pair of sites for connecting `from` to `to` (by center offset). */
export function facingSites(from: Rect, to: Rect): [ConnectionSite, ConnectionSite] {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

/** Cardinal site pointing from `from` toward `to` (for free endpoints). */
export function siteToward(from: Point, to: Point): ConnectionSite {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

// ---- Connector routing -----------------------------------------------------
// Bent connectors leave each port in its site's outward direction (so the
// line never starts by crossing into the shape) with a fixed clearance, then
// route orthogonally to the other port. The number of corners adapts to the
// geometry: a facing pair with room needs 2 corners, a target "behind" the
// port needs to wrap around and grows to 4.

/** Clearance (px) the line keeps from each connected object before turning. */
const CONNECTOR_GAP = 16;

const SITE_DIR: Record<ConnectionSite, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Orthogonal path between the two stub ends, honoring the port directions. */
function connectStubs(a: Point, sd: Point, b: Point, ed: Point, t: number): Point[] {
  const startHorizontal = sd.x !== 0;
  const endHorizontal = ed.x !== 0;
  if (startHorizontal && endHorizontal) {
    // Both stubs horizontal: a vertical mid-line joins them when the ports
    // face each other with room; otherwise wrap around vertically.
    const facing = Math.sign(b.x - a.x) === sd.x && Math.sign(a.x - b.x) === ed.x;
    if (facing && b.x !== a.x) {
      const midX = a.x + t * (b.x - a.x);
      return [
        { x: midX, y: a.y },
        { x: midX, y: b.y },
      ];
    }
    const midY = a.y + t * (b.y - a.y);
    return [
      { x: a.x, y: midY },
      { x: b.x, y: midY },
    ];
  }
  if (!startHorizontal && !endHorizontal) {
    const facing = Math.sign(b.y - a.y) === sd.y && Math.sign(a.y - b.y) === ed.y;
    if (facing && b.y !== a.y) {
      const midY = a.y + t * (b.y - a.y);
      return [
        { x: a.x, y: midY },
        { x: b.x, y: midY },
      ];
    }
    const midX = a.x + t * (b.x - a.x);
    return [
      { x: midX, y: a.y },
      { x: midX, y: b.y },
    ];
  }
  // Perpendicular ports: a single corner. Prefer the elbow whose first leg
  // continues in the start direction (merges into the stub → fewer corners).
  if (startHorizontal) {
    return Math.sign(b.x - a.x) === sd.x ? [{ x: b.x, y: a.y }] : [{ x: a.x, y: b.y }];
  }
  return Math.sign(b.y - a.y) === sd.y ? [{ x: a.x, y: b.y }] : [{ x: b.x, y: a.y }];
}

/** Drops duplicate and collinear intermediate points. */
function simplifyPolyline(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const point of points) {
    const last = deduped.at(-1);
    if (!last || last.x !== point.x || last.y !== point.y) {
      deduped.push(point);
    }
  }
  const result: Point[] = [];
  for (let index = 0; index < deduped.length; index += 1) {
    const previous = result.at(-1);
    const current = deduped[index]!;
    const next = deduped[index + 1];
    if (previous && next) {
      const collinear =
        (previous.x === current.x && current.x === next.x) ||
        (previous.y === current.y && current.y === next.y);
      if (collinear) {
        continue;
      }
    }
    result.push(current);
  }
  return result;
}

/** Minimum lead so a stub always leaves the port outward a little. */
const CONNECTOR_MIN_LEAD = 4;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const nearPoint = (p: Point, q: Point): boolean =>
  Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.5;

const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** Shape inputs shared by the routing / handle helpers. */
interface ConnectorShape {
  startPoint: Point;
  endPoint: Point;
  start: { site: ConnectionSite };
  end: { site: ConnectionSite };
  connectorType: ConnectorObject["connectorType"];
  bend?: number;
  startLead?: number;
  endLead?: number;
}

/** Port directions and stub corners `a` / `b` for a bent connector. */
function connectorGeometry(
  connector: ConnectorShape,
): { sd: Point; ed: Point; a: Point; b: Point } | null {
  if (connector.connectorType !== "bent") {
    return null;
  }
  const sd = SITE_DIR[connector.start.site];
  const ed = SITE_DIR[connector.end.site];
  const sLead = Math.max(0, connector.startLead ?? CONNECTOR_GAP);
  const eLead = Math.max(0, connector.endLead ?? CONNECTOR_GAP);
  return {
    sd,
    ed,
    a: { x: connector.startPoint.x + sd.x * sLead, y: connector.startPoint.y + sd.y * sLead },
    b: { x: connector.endPoint.x + ed.x * eLead, y: connector.endPoint.y + ed.y * eLead },
  };
}

/**
 * Absolute polyline of a connector. Straight connectors are a single
 * segment; bent connectors are the orthogonal route with clearance stubs.
 * `bend` shifts the mid-line; `startLead`/`endLead` set the stub lengths.
 */
export function connectorRoutePoints(connector: ConnectorShape): Point[] {
  const { startPoint, endPoint } = connector;
  const geo = connectorGeometry(connector);
  if (!geo) {
    return [startPoint, endPoint];
  }
  const t = clamp01(connector.bend ?? 0.5);
  return simplifyPolyline([
    startPoint,
    geo.a,
    ...connectStubs(geo.a, geo.sd, geo.b, geo.ed, t),
    geo.b,
    endPoint,
  ]);
}

/** The bend-controlled mid-line for the given stub corners, or null. */
function bendLine(
  a: Point,
  sd: Point,
  b: Point,
  ed: Point,
  t: number,
): { point: Point; axis: "x" | "y"; toBend: (coordinate: number) => number } | null {
  const startHorizontal = sd.x !== 0;
  const endHorizontal = ed.x !== 0;
  if (startHorizontal !== endHorizontal) {
    return null; // perpendicular ports: single elbow, no bend line
  }
  if (startHorizontal) {
    const facing = Math.sign(b.x - a.x) === sd.x && Math.sign(a.x - b.x) === ed.x;
    if (facing && b.x !== a.x) {
      const midX = a.x + t * (b.x - a.x);
      return {
        point: { x: midX, y: (a.y + b.y) / 2 },
        axis: "x",
        toBend: (x) => (x - a.x) / (b.x - a.x),
      };
    }
    if (b.y === a.y) {
      return null;
    }
    const midY = a.y + t * (b.y - a.y);
    return {
      point: { x: (a.x + b.x) / 2, y: midY },
      axis: "y",
      toBend: (y) => (y - a.y) / (b.y - a.y),
    };
  }
  const facing = Math.sign(b.y - a.y) === sd.y && Math.sign(a.y - b.y) === ed.y;
  if (facing && b.y !== a.y) {
    const midY = a.y + t * (b.y - a.y);
    return {
      point: { x: (a.x + b.x) / 2, y: midY },
      axis: "y",
      toBend: (y) => (y - a.y) / (b.y - a.y),
    };
  }
  if (b.x === a.x) {
    return null;
  }
  const midX = a.x + t * (b.x - a.x);
  return {
    point: { x: midX, y: (a.y + b.y) / 2 },
    axis: "x",
    toBend: (x) => (x - a.x) / (b.x - a.x),
  };
}

/** Which segment a connector handle adjusts. */
export type ConnectorHandleKind = "bend" | "start-lead" | "end-lead";

export interface ConnectorHandle {
  kind: ConnectorHandleKind;
  /** Handle position on the segment it controls. */
  point: Point;
  /** Axis the handle drags along. */
  axis: "x" | "y";
  /** Maps a dragged coordinate on `axis` to the connector patch. */
  patchFor: (coordinate: number) => Partial<ConnectorObject>;
}

/**
 * Draggable handles for a bent connector: the primary mid-line (`bend`) plus
 * the start-side and end-side stub segments (`startLead` / `endLead`) when
 * those form a real corner in the route (i.e. the wrap-around cases where
 * they are visible perpendicular segments).
 */
export function connectorHandles(connector: ConnectorShape): ConnectorHandle[] {
  const geo = connectorGeometry(connector);
  if (!geo) {
    return [];
  }
  const { sd, ed, a, b } = geo;
  const handles: ConnectorHandle[] = [];

  const bend = bendLine(a, sd, b, ed, clamp01(connector.bend ?? 0.5));
  if (bend) {
    handles.push({
      kind: "bend",
      point: bend.point,
      axis: bend.axis,
      patchFor: (coordinate) => ({ bend: clamp01(bend.toBend(coordinate)) }),
    });
  }

  const points = connectorRoutePoints(connector);

  // The stub corner is a draggable segment only when it survives as a real
  // vertex (the facing cases merge it into the endpoint's leg). The handle
  // sits at the midpoint of that perpendicular segment so it is easy to grab.
  if (points.length >= 3 && nearPoint(points[1]!, a) && !nearPoint(a, connector.startPoint)) {
    const axis = sd.x !== 0 ? "x" : "y";
    handles.push({
      kind: "start-lead",
      point: midpoint(a, points[2]!),
      axis,
      patchFor: (coordinate) => ({
        startLead: Math.max(
          CONNECTOR_MIN_LEAD,
          axis === "x"
            ? (coordinate - connector.startPoint.x) * sd.x
            : (coordinate - connector.startPoint.y) * sd.y,
        ),
      }),
    });
  }
  const secondLast = points[points.length - 2];
  if (
    points.length >= 3 &&
    secondLast &&
    nearPoint(secondLast, b) &&
    !nearPoint(b, connector.endPoint)
  ) {
    const axis = ed.x !== 0 ? "x" : "y";
    handles.push({
      kind: "end-lead",
      point: midpoint(b, points[points.length - 3]!),
      axis,
      patchFor: (coordinate) => ({
        endLead: Math.max(
          CONNECTOR_MIN_LEAD,
          axis === "x"
            ? (coordinate - connector.endPoint.x) * ed.x
            : (coordinate - connector.endPoint.y) * ed.y,
        ),
      }),
    });
  }
  return handles;
}

export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Top-down chain of objects under a slide point, starting at the given
 * object: `[object, direct child, grandchild, ...]`. At each group level the
 * front-most (last in array) child containing the point wins. Used by the
 * canvas to descend one nesting level per double-click.
 */
export function hitChain(object: SlideObject, point: { x: number; y: number }): SlideObject[] {
  const chain: SlideObject[] = [object];
  let current: SlideObject = object;
  while (current.type === "group") {
    const child = current.children.findLast((candidate) =>
      pointInRect(point, objectBounds(candidate)),
    );
    if (!child) {
      break;
    }
    chain.push(child);
    current = child;
  }
  return chain;
}

/**
 * Deepest nesting level at which something inside the object's subtree is
 * selected: 0 = the object itself, 1 = a direct child, ... -1 = nothing.
 */
export function maxSelectedDepth(
  object: SlideObject,
  selected: ReadonlySet<string>,
  depth = 0,
): number {
  let result = selected.has(object.id) ? depth : -1;
  if (object.type === "group") {
    for (const child of object.children) {
      result = Math.max(result, maxSelectedDepth(child, selected, depth + 1));
    }
  }
  return result;
}

export function translateObject<T extends SlideObject>(object: T, dx: number, dy: number): T {
  if (object.type === "group") {
    return {
      ...object,
      x: object.x + dx,
      y: object.y + dy,
      children: object.children.map((child) => translateObject(child, dx, dy)),
    };
  }
  if (object.type === "connector") {
    // Attached endpoints re-derive from their objects; only free-endpoint
    // points are the source of truth and must move with the connector.
    const shift = (p?: Point): Point | undefined => (p ? { x: p.x + dx, y: p.y + dy } : p);
    return {
      ...object,
      x: object.x + dx,
      y: object.y + dy,
      startPoint: shift(object.startPoint)!,
      endPoint: shift(object.endPoint)!,
      start: { ...object.start, point: shift(object.start.point) },
      end: { ...object.end, point: shift(object.end.point) },
    };
  }
  return { ...object, x: object.x + dx, y: object.y + dy };
}

/** Scales an object into a new frame, used for group resize. */
export function fitObjectToFrame<T extends SlideObject>(object: T, from: Rect, to: Rect): T {
  const scaleX = from.width === 0 ? 1 : to.width / from.width;
  const scaleY = from.height === 0 ? 1 : to.height / from.height;
  const map = (r: Rect): Rect => ({
    x: to.x + (r.x - from.x) * scaleX,
    y: to.y + (r.y - from.y) * scaleY,
    width: r.width * scaleX,
    height: r.height * scaleY,
  });
  if (object.type === "group") {
    // The same slide-global affine map applies at every nesting level, so
    // recursion keeps nested groups and their children consistent.
    return {
      ...object,
      ...map(objectBounds(object)),
      children: object.children.map((child) => fitObjectToFrame(child, from, to)),
    };
  }
  if (object.type === "connector") {
    const mapPoint = (p?: Point): Point | undefined =>
      p ? { x: to.x + (p.x - from.x) * scaleX, y: to.y + (p.y - from.y) * scaleY } : p;
    return {
      ...object,
      ...map(objectBounds(object)),
      startPoint: mapPoint(object.startPoint)!,
      endPoint: mapPoint(object.endPoint)!,
      start: { ...object.start, point: mapPoint(object.start.point) },
      end: { ...object.end, point: mapPoint(object.end.point) },
    };
  }
  return { ...object, ...map(objectBounds(object)) };
}
