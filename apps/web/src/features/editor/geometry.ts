import type { ConnectionSite, Rect, SlideObject } from "./types";

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
  return { ...object, ...map(objectBounds(object)) };
}
