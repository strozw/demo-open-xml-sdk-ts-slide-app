"use client";

import * as React from "react";

import {
  boundingBox,
  facingSites,
  fitObjectToFrame,
  objectBounds,
  sitePoint,
  translateObject,
} from "./geometry";
import {
  createDeck,
  createId,
  createSlide,
  type ConnectorObject,
  type Deck,
  type GroupObject,
  type Rect,
  type Slide,
  type SlideObject,
} from "./types";

export interface EditorState {
  deck: Deck;
  currentSlideId: string;
  selectedIds: readonly string[];
  /**
   * In-place text editing session on the canvas: which object is being
   * edited and the current caret/selection range (character indices into
   * the object's text). The inspector reads the range to apply per-
   * character styling to the selection.
   */
  textEditing: { objectId: string; selectionStart: number; selectionEnd: number } | null;
  /** Slideshow playback: replaces the canvas with the read-only view. */
  presenting: boolean;
}

export type EditorAction =
  | { type: "add-object"; object: SlideObject }
  | { type: "update-object"; id: string; patch: Partial<SlideObject> }
  | { type: "replace-object"; object: SlideObject }
  | { type: "set-selection"; ids: readonly string[] }
  | { type: "toggle-selected"; id: string }
  | { type: "move-selected"; dx: number; dy: number }
  | { type: "resize-object"; id: string; frame: Rect }
  | { type: "delete-selected" }
  | { type: "duplicate-selected" }
  | { type: "group-selected" }
  | { type: "ungroup-selected" }
  | { type: "reorder-selected"; direction: "front" | "back" }
  | { type: "reorder-object"; id: string; targetId: string; position: "before" | "after" }
  | { type: "add-slide" }
  | { type: "remove-slide"; id: string }
  | { type: "select-slide"; id: string }
  | { type: "set-slide-background"; color: string }
  | { type: "set-deck-title"; title: string }
  | { type: "load-deck"; deck: Deck }
  | { type: "start-text-edit"; id: string }
  | { type: "end-text-edit" }
  | { type: "set-text-selection"; start: number; end: number }
  | { type: "rename-object"; id: string; name: string }
  | { type: "connect-selected" }
  | { type: "start-presentation" }
  | { type: "stop-presentation" }
  | { type: "step-slide"; delta: 1 | -1 };

function currentSlide(state: EditorState): Slide {
  const slide = state.deck.slides.find((s) => s.id === state.currentSlideId);
  return slide ?? state.deck.slides[0]!;
}

// ---- Deep-tree helpers -----------------------------------------------------
// Groups can nest, and objects selected from the object tree may live at any
// depth, so structural operations walk the whole tree. A group's own frame is
// always re-derived as the bounding box of its children afterwards.

/** Re-derives every group frame (bounding box of its children), bottom-up. */
function withDerivedFrames(object: SlideObject): SlideObject {
  if (object.type !== "group") {
    return object;
  }
  const children = object.children.map(withDerivedFrames);
  return { ...object, ...boundingBox(children.map(objectBounds)), children };
}

/**
 * Connector geometry follows its endpoints: recompute the site points from
 * the connected objects' current bounds and the frame from those points.
 * Connectors whose endpoints no longer exist are dropped.
 */
function syncConnectors(objects: SlideObject[]): SlideObject[] {
  return objects.flatMap((object): SlideObject[] => {
    if (object.type !== "connector") {
      return [object];
    }
    const start = findObjectDeep(objects, object.start.objectId);
    const end = findObjectDeep(objects, object.end.objectId);
    if (!start || !end || start.type === "connector" || end.type === "connector") {
      return [];
    }
    const startPoint = sitePoint(objectBounds(start), object.start.site);
    const endPoint = sitePoint(objectBounds(end), object.end.site);
    return [
      {
        ...object,
        startPoint,
        endPoint,
        x: Math.min(startPoint.x, endPoint.x),
        y: Math.min(startPoint.y, endPoint.y),
        width: Math.abs(endPoint.x - startPoint.x),
        height: Math.abs(endPoint.y - startPoint.y),
      },
    ];
  });
}

/** Full geometry normalization: group frames, then connector routing. */
function deriveFrames(objects: SlideObject[]): SlideObject[] {
  return syncConnectors(objects.map(withDerivedFrames));
}

/** Applies `transform` to the object with the given id, wherever it nests. */
function patchObjectsDeep(
  objects: SlideObject[],
  id: string,
  transform: (object: SlideObject) => SlideObject,
): SlideObject[] {
  return objects.map((object) => {
    if (object.id === id) {
      return transform(object);
    }
    if (object.type === "group") {
      return { ...object, children: patchObjectsDeep(object.children, id, transform) };
    }
    return object;
  });
}

/** Moves every selected subtree; unselected groups are traversed. */
function translateSelectedDeep(
  objects: SlideObject[],
  selected: ReadonlySet<string>,
  dx: number,
  dy: number,
): SlideObject[] {
  return objects.map((object) => {
    if (selected.has(object.id)) {
      return translateObject(object, dx, dy);
    }
    if (object.type === "group") {
      return { ...object, children: translateSelectedDeep(object.children, selected, dx, dy) };
    }
    return object;
  });
}

/** Removes selected objects at any depth; groups left empty are dropped. */
function deleteSelectedDeep(objects: SlideObject[], selected: ReadonlySet<string>): SlideObject[] {
  const result: SlideObject[] = [];
  for (const object of objects) {
    if (selected.has(object.id)) {
      continue;
    }
    if (object.type === "group") {
      const children = deleteSelectedDeep(object.children, selected);
      if (children.length === 0) {
        continue;
      }
      result.push({ ...object, children });
    } else {
      result.push(object);
    }
  }
  return result;
}

function regenerateIds<T extends SlideObject>(object: T, idMap: Map<string, string>): T {
  const id = createId("object");
  idMap.set(object.id, id);
  if (object.type === "group") {
    return {
      ...object,
      id,
      children: object.children.map((child) => regenerateIds(child, idMap)),
    };
  }
  return { ...object, id };
}

// ---- Name uniqueness -------------------------------------------------------
// Object names stay unique within a slide: new objects and renames get a
// numeric suffix on collision, duplicated objects get a "コピー" suffix.

function collectNamesDeep(
  objects: readonly SlideObject[],
  taken: Set<string>,
  excludeId?: string,
): void {
  for (const object of objects) {
    if (object.id !== excludeId) {
      taken.add(object.name);
    }
    if (object.type === "group") {
      collectNamesDeep(object.children, taken, excludeId);
    }
  }
}

function slideNames(slide: Slide, excludeId?: string): Set<string> {
  const taken = new Set<string>();
  collectNamesDeep(slide.objects, taken, excludeId);
  return taken;
}

/** `desired`, or `desired 1`, `desired 2`, ... — first free wins. */
function uniqueName(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) {
    return desired;
  }
  for (let n = 1; ; n += 1) {
    const candidate = `${desired} ${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** `base コピー`, then `base コピー1`, `base コピー2`, ... */
function copyName(base: string, taken: ReadonlySet<string>): string {
  let candidate = `${base} コピー`;
  for (let n = 1; taken.has(candidate); n += 1) {
    candidate = `${base} コピー${n}`;
  }
  return candidate;
}

/** Renames a copied subtree so every node gets a unique コピー name. */
function renameCopiedDeep(object: SlideObject, taken: Set<string>): SlideObject {
  const name = copyName(object.name, taken);
  taken.add(name);
  if (object.type === "group") {
    return {
      ...object,
      name,
      children: object.children.map((child) => renameCopiedDeep(child, taken)),
    };
  }
  return { ...object, name };
}

/** Inserts a shifted copy right after each selected object, at any depth. */
function duplicateSelectedDeep(
  objects: SlideObject[],
  selected: ReadonlySet<string>,
  copiedIds: string[],
  takenNames: Set<string>,
  idMap: Map<string, string>,
): SlideObject[] {
  const result: SlideObject[] = [];
  for (const object of objects) {
    const visited =
      object.type === "group"
        ? {
            ...object,
            children: duplicateSelectedDeep(
              object.children,
              selected,
              copiedIds,
              takenNames,
              idMap,
            ),
          }
        : object;
    result.push(visited);
    if (selected.has(object.id)) {
      const copy = renameCopiedDeep(
        regenerateIds(translateObject(visited, 24, 24), idMap),
        takenNames,
      ) as SlideObject;
      copiedIds.push(copy.id);
      result.push(copy);
    }
  }
  return result;
}

/**
 * Moves `id` next to `targetId` within their common sibling list (top level
 * or a group's children); `position` is in ARRAY order, where later means
 * more to the front. Pairs living in different parents are left untouched.
 */
function reorderSiblings(
  objects: SlideObject[],
  id: string,
  targetId: string,
  position: "before" | "after",
): SlideObject[] {
  const ids = new Set(objects.map((object) => object.id));
  if (ids.has(id) && ids.has(targetId)) {
    const dragged = objects.find((object) => object.id === id)!;
    const without = objects.filter((object) => object.id !== id);
    const targetIndex = without.findIndex((object) => object.id === targetId);
    const insertAt = position === "before" ? targetIndex : targetIndex + 1;
    return [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
  }
  return objects.map((object) =>
    object.type === "group"
      ? { ...object, children: reorderSiblings(object.children, id, targetId, position) }
      : object,
  );
}

export function findObjectDeep(
  objects: readonly SlideObject[],
  id: string,
): SlideObject | undefined {
  for (const object of objects) {
    if (object.id === id) {
      return object;
    }
    if (object.type === "group") {
      const found = findObjectDeep(object.children, id);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function collectSelectedDeep(
  objects: readonly SlideObject[],
  selected: ReadonlySet<string>,
  out: SlideObject[],
): void {
  for (const object of objects) {
    if (selected.has(object.id)) {
      out.push(object);
    }
    if (object.type === "group") {
      collectSelectedDeep(object.children, selected, out);
    }
  }
}

function patchSlide(state: EditorState, updater: (slide: Slide) => Slide): EditorState {
  return {
    ...state,
    deck: {
      ...state.deck,
      slides: state.deck.slides.map((slide) =>
        slide.id === state.currentSlideId ? updater(slide) : slide,
      ),
    },
  };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "add-object": {
      const named = {
        ...action.object,
        name: uniqueName(action.object.name, slideNames(currentSlide(state))),
      } as SlideObject;
      const next = patchSlide(state, (slide) => ({
        ...slide,
        objects: [...slide.objects, named],
      }));
      return { ...next, selectedIds: [named.id] };
    }

    case "update-object":
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(
          patchObjectsDeep(
            slide.objects,
            action.id,
            (object) => ({ ...object, ...action.patch }) as SlideObject,
          ),
        ),
      }));

    case "replace-object":
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(
          patchObjectsDeep(slide.objects, action.object.id, () => action.object),
        ),
      }));

    case "set-selection":
      return { ...state, selectedIds: action.ids };

    case "toggle-selected":
      return {
        ...state,
        selectedIds: state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          : [...state.selectedIds, action.id],
      };

    case "move-selected": {
      const selected = new Set(state.selectedIds);
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(translateSelectedDeep(slide.objects, selected, action.dx, action.dy)),
      }));
    }

    case "resize-object":
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(
          patchObjectsDeep(slide.objects, action.id, (object) =>
            fitObjectToFrame(object, objectBounds(object), action.frame),
          ),
        ),
      }));

    case "delete-selected": {
      const selected = new Set(state.selectedIds);
      const next = patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(deleteSelectedDeep(slide.objects, selected)),
      }));
      return { ...next, selectedIds: [] };
    }

    case "duplicate-selected": {
      const selected = new Set(state.selectedIds);
      const copiedIds: string[] = [];
      const idMap = new Map<string, string>();
      const next = patchSlide(state, (slide) => {
        const duplicated = duplicateSelectedDeep(
          slide.objects,
          selected,
          copiedIds,
          slideNames(slide),
          idMap,
        );
        const copiedSet = new Set(copiedIds);
        // Copied connectors re-point to the copied endpoints when those were
        // duplicated in the same operation (else they stay on the originals).
        const remapped = duplicated.map((object) =>
          object.type === "connector" && copiedSet.has(object.id)
            ? {
                ...object,
                start: {
                  ...object.start,
                  objectId: idMap.get(object.start.objectId) ?? object.start.objectId,
                },
                end: {
                  ...object.end,
                  objectId: idMap.get(object.end.objectId) ?? object.end.objectId,
                },
              }
            : object,
        );
        return { ...slide, objects: deriveFrames(remapped) };
      });
      if (copiedIds.length === 0) {
        return state;
      }
      return { ...next, selectedIds: copiedIds };
    }

    case "group-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      // Connectors stay top-level: they are never pulled into a group.
      const members = slide.objects.filter(
        (object) => selected.has(object.id) && object.type !== "connector",
      );
      if (members.length < 2) {
        return state;
      }
      // Members keep their own structure, so grouping a group nests it.
      // Children stay in absolute slide coordinates; the group frame is the
      // bounding box of its members.
      const frame = boundingBox(members.map(objectBounds));
      const group: GroupObject = {
        id: createId("object"),
        name: uniqueName("グループ", slideNames(slide)),
        type: "group",
        ...frame,
        children: members,
      };
      const memberIds = new Set(members.map((member) => member.id));
      const remaining = slide.objects.filter((object) => !memberIds.has(object.id));
      const next = patchSlide(state, (s) => ({
        ...s,
        objects: deriveFrames([...remaining, group]),
      }));
      return { ...next, selectedIds: [group.id] };
    }

    case "ungroup-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      const releasedIds = new Set<string>();
      // Selected groups at any depth dissolve in place: their children are
      // promoted into the parent's list at the group's position.
      const ungroupIn = (objects: SlideObject[]): SlideObject[] => {
        const result: SlideObject[] = [];
        for (const object of objects) {
          if (object.type !== "group") {
            result.push(object);
            continue;
          }
          const children = ungroupIn(object.children);
          if (selected.has(object.id)) {
            for (const child of children) {
              releasedIds.add(child.id);
            }
            result.push(...children);
          } else {
            result.push({ ...object, children });
          }
        }
        return result;
      };
      const nextObjects = ungroupIn(slide.objects);
      if (releasedIds.size === 0) {
        return state;
      }
      const next = patchSlide(state, (s) => ({ ...s, objects: deriveFrames(nextObjects) }));
      return { ...next, selectedIds: [...releasedIds] };
    }

    case "reorder-object": {
      if (action.id === action.targetId) {
        return state;
      }
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: reorderSiblings(slide.objects, action.id, action.targetId, action.position),
      }));
    }

    case "reorder-selected": {
      const selectedSet = new Set(state.selectedIds);
      return patchSlide(state, (slide) => {
        const selected: SlideObject[] = [];
        const rest: SlideObject[] = [];
        for (const object of slide.objects) {
          (selectedSet.has(object.id) ? selected : rest).push(object);
        }
        return {
          ...slide,
          objects: action.direction === "front" ? [...rest, ...selected] : [...selected, ...rest],
        };
      });
    }

    case "add-slide": {
      const slide = createSlide();
      const index = state.deck.slides.findIndex((s) => s.id === state.currentSlideId);
      const slides = [...state.deck.slides];
      slides.splice(index + 1, 0, slide);
      return {
        ...state,
        deck: { ...state.deck, slides },
        currentSlideId: slide.id,
        selectedIds: [],
      };
    }

    case "remove-slide": {
      if (state.deck.slides.length <= 1) {
        return state;
      }
      const index = state.deck.slides.findIndex((s) => s.id === action.id);
      const slides = state.deck.slides.filter((s) => s.id !== action.id);
      const fallback = slides[Math.max(0, index - 1)] ?? slides[0]!;
      return {
        ...state,
        deck: { ...state.deck, slides },
        currentSlideId: state.currentSlideId === action.id ? fallback.id : state.currentSlideId,
        selectedIds: [],
      };
    }

    case "select-slide":
      return { ...state, currentSlideId: action.id, selectedIds: [] };

    case "set-slide-background":
      return patchSlide(state, (slide) => ({ ...slide, background: action.color }));

    case "set-deck-title":
      return { ...state, deck: { ...state.deck, title: action.title } };

    case "load-deck":
      return {
        deck: action.deck,
        currentSlideId: action.deck.slides[0]!.id,
        selectedIds: [],
        textEditing: null,
        presenting: false,
      };

    case "start-text-edit":
      return {
        ...state,
        selectedIds: [action.id],
        textEditing: { objectId: action.id, selectionStart: 0, selectionEnd: 0 },
      };

    case "end-text-edit":
      return { ...state, textEditing: null };

    case "set-text-selection":
      return state.textEditing
        ? {
            ...state,
            textEditing: {
              ...state.textEditing,
              selectionStart: action.start,
              selectionEnd: action.end,
            },
          }
        : state;

    case "start-presentation":
      return { ...state, presenting: true, selectedIds: [], textEditing: null };

    case "stop-presentation":
      return { ...state, presenting: false };

    case "step-slide": {
      const index = state.deck.slides.findIndex((slide) => slide.id === state.currentSlideId);
      const next = Math.max(0, Math.min(state.deck.slides.length - 1, index + action.delta));
      if (next === index) {
        return state;
      }
      return { ...state, currentSlideId: state.deck.slides[next]!.id, selectedIds: [] };
    }

    case "connect-selected": {
      const slide = currentSlide(state);
      // Exactly two non-connector objects, in selection order.
      const endpoints = state.selectedIds
        .map((id) => findObjectDeep(slide.objects, id))
        .filter(
          (object): object is SlideObject => object !== undefined && object.type !== "connector",
        );
      if (endpoints.length !== 2) {
        return state;
      }
      const [from, to] = endpoints as [SlideObject, SlideObject];
      const [startSite, endSite] = facingSites(objectBounds(from), objectBounds(to));
      const connector: ConnectorObject = {
        id: createId("object"),
        name: uniqueName("コネクタ", slideNames(slide)),
        type: "connector",
        connectorType: "straight",
        start: { objectId: from.id, site: startSite },
        end: { objectId: to.id, site: endSite },
        // Placeholder geometry — deriveFrames recomputes it immediately.
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 0, y: 0 },
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        lineColor: "#1f2937",
        lineWidth: 2,
        arrowEnd: true,
      };
      const next = patchSlide(state, (s) => ({
        ...s,
        objects: deriveFrames([...s.objects, connector]),
      }));
      return { ...next, selectedIds: [connector.id] };
    }

    case "rename-object": {
      const desired = action.name.trim();
      if (!desired) {
        return state;
      }
      // Exclude the object itself so renaming to its current name is a no-op
      // instead of gaining a suffix.
      const name = uniqueName(desired, slideNames(currentSlide(state), action.id));
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: patchObjectsDeep(slide.objects, action.id, (object) => ({ ...object, name })),
      }));
    }

    default:
      return state;
  }
}

/**
 * The editing session only survives while its object is still the sole
 * selection and still exists on the current slide; any action that breaks
 * that (selecting elsewhere, deleting, switching slides, ...) ends it.
 */
function withTextEditingInvariant(state: EditorState): EditorState {
  const editing = state.textEditing;
  if (!editing) {
    return state;
  }
  const soleSelection = state.selectedIds.length === 1 && state.selectedIds[0] === editing.objectId;
  const target = soleSelection
    ? findObjectDeep(currentSlide(state).objects, editing.objectId)
    : undefined;
  if (!target || (target.type !== "shape" && target.type !== "text")) {
    return { ...state, textEditing: null };
  }
  return state;
}

function editorReducerWithInvariants(state: EditorState, action: EditorAction): EditorState {
  return withTextEditingInvariant(editorReducer(state, action));
}

function createInitialState(): EditorState {
  const deck = createDeck();
  return {
    deck,
    currentSlideId: deck.slides[0]!.id,
    selectedIds: [],
    textEditing: null,
    presenting: false,
  };
}

const EditorStateContext = React.createContext<EditorState | null>(null);
const EditorDispatchContext = React.createContext<React.Dispatch<EditorAction> | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(
    editorReducerWithInvariants,
    undefined,
    createInitialState,
  );
  return (
    <EditorStateContext.Provider value={state}>
      <EditorDispatchContext.Provider value={dispatch}>{children}</EditorDispatchContext.Provider>
    </EditorStateContext.Provider>
  );
}

export function useEditorState(): EditorState {
  const state = React.use(EditorStateContext);
  if (!state) {
    throw new Error("useEditorState must be used inside <EditorProvider>");
  }
  return state;
}

export function useEditorDispatch(): React.Dispatch<EditorAction> {
  const dispatch = React.use(EditorDispatchContext);
  if (!dispatch) {
    throw new Error("useEditorDispatch must be used inside <EditorProvider>");
  }
  return dispatch;
}

export function useCurrentSlide(): Slide {
  return currentSlide(useEditorState());
}

export function useSelectedObjects(): SlideObject[] {
  const state = useEditorState();
  const slide = currentSlide(state);
  const selected = new Set(state.selectedIds);
  // The object tree can select objects nested inside groups, so resolve
  // selection at any depth.
  const out: SlideObject[] = [];
  collectSelectedDeep(slide.objects, selected, out);
  return out;
}
