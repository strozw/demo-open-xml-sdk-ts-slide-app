"use client";

import * as React from "react";

import { boundingBox, fitObjectToFrame, objectBounds, translateObject } from "./geometry";
import {
  createDeck,
  createId,
  createSlide,
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
  | { type: "set-text-selection"; start: number; end: number };

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

function deriveFrames(objects: SlideObject[]): SlideObject[] {
  return objects.map(withDerivedFrames);
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

function regenerateIds<T extends SlideObject>(object: T): T {
  if (object.type === "group") {
    return { ...object, id: createId("object"), children: object.children.map(regenerateIds) };
  }
  return { ...object, id: createId("object") };
}

/** Inserts a shifted copy right after each selected object, at any depth. */
function duplicateSelectedDeep(
  objects: SlideObject[],
  selected: ReadonlySet<string>,
  copiedIds: string[],
): SlideObject[] {
  const result: SlideObject[] = [];
  for (const object of objects) {
    const visited =
      object.type === "group"
        ? { ...object, children: duplicateSelectedDeep(object.children, selected, copiedIds) }
        : object;
    result.push(visited);
    if (selected.has(object.id)) {
      const copy = regenerateIds(translateObject(visited, 24, 24));
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
      const next = patchSlide(state, (slide) => ({
        ...slide,
        objects: [...slide.objects, action.object],
      }));
      return { ...next, selectedIds: [action.object.id] };
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
      const next = patchSlide(state, (slide) => ({
        ...slide,
        objects: deriveFrames(duplicateSelectedDeep(slide.objects, selected, copiedIds)),
      }));
      if (copiedIds.length === 0) {
        return state;
      }
      return { ...next, selectedIds: copiedIds };
    }

    case "group-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      const members = slide.objects.filter((object) => selected.has(object.id));
      if (members.length < 2) {
        return state;
      }
      // Members keep their own structure, so grouping a group nests it.
      // Children stay in absolute slide coordinates; the group frame is the
      // bounding box of its members.
      const frame = boundingBox(members.map(objectBounds));
      const group: GroupObject = {
        id: createId("object"),
        name: "Group",
        type: "group",
        ...frame,
        children: members,
      };
      const remaining = slide.objects.filter((object) => !selected.has(object.id));
      const next = patchSlide(state, (s) => ({ ...s, objects: [...remaining, group] }));
      return { ...next, selectedIds: [group.id] };
    }

    case "ungroup-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      const nextObjects: SlideObject[] = [];
      const releasedIds: string[] = [];
      for (const object of slide.objects) {
        if (object.type === "group" && selected.has(object.id)) {
          nextObjects.push(...object.children);
          releasedIds.push(...object.children.map((child) => child.id));
        } else {
          nextObjects.push(object);
        }
      }
      if (releasedIds.length === 0) {
        return state;
      }
      const next = patchSlide(state, (s) => ({ ...s, objects: nextObjects }));
      return { ...next, selectedIds: releasedIds };
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
  return { deck, currentSlideId: deck.slides[0]!.id, selectedIds: [], textEditing: null };
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
