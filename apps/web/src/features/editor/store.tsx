"use client";

import * as React from "react";

import { boundingBox, fitObjectToFrame, objectBounds, translateObject } from "./geometry";
import {
  createDeck,
  createId,
  createSlide,
  type Deck,
  type GroupObject,
  type LeafObject,
  type Rect,
  type Slide,
  type SlideObject,
} from "./types";

export interface EditorState {
  deck: Deck;
  currentSlideId: string;
  selectedIds: readonly string[];
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
  | { type: "add-slide" }
  | { type: "remove-slide"; id: string }
  | { type: "select-slide"; id: string }
  | { type: "set-slide-background"; color: string }
  | { type: "set-deck-title"; title: string }
  | { type: "load-deck"; deck: Deck };

function currentSlide(state: EditorState): Slide {
  const slide = state.deck.slides.find((s) => s.id === state.currentSlideId);
  return slide ?? state.deck.slides[0]!;
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
        objects: slide.objects.map((object) =>
          object.id === action.id ? ({ ...object, ...action.patch } as SlideObject) : object,
        ),
      }));

    case "replace-object":
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: slide.objects.map((object) =>
          object.id === action.object.id ? action.object : object,
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
        objects: slide.objects.map((object) =>
          selected.has(object.id) ? translateObject(object, action.dx, action.dy) : object,
        ),
      }));
    }

    case "resize-object":
      return patchSlide(state, (slide) => ({
        ...slide,
        objects: slide.objects.map((object) =>
          object.id === action.id
            ? fitObjectToFrame(object, objectBounds(object), action.frame)
            : object,
        ),
      }));

    case "delete-selected": {
      const selected = new Set(state.selectedIds);
      const next = patchSlide(state, (slide) => ({
        ...slide,
        objects: slide.objects.filter((object) => !selected.has(object.id)),
      }));
      return { ...next, selectedIds: [] };
    }

    case "duplicate-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      const copies: SlideObject[] = [];
      for (const object of slide.objects) {
        if (!selected.has(object.id)) {
          continue;
        }
        const moved = translateObject(object, 24, 24);
        copies.push(
          moved.type === "group"
            ? {
                ...moved,
                id: createId("object"),
                children: moved.children.map((child) => ({ ...child, id: createId("object") })),
              }
            : { ...moved, id: createId("object") },
        );
      }
      if (copies.length === 0) {
        return state;
      }
      const next = patchSlide(state, (s) => ({ ...s, objects: [...s.objects, ...copies] }));
      return { ...next, selectedIds: copies.map((c) => c.id) };
    }

    case "group-selected": {
      const slide = currentSlide(state);
      const selected = new Set(state.selectedIds);
      const members = slide.objects.filter((object) => selected.has(object.id));
      if (members.length < 2) {
        return state;
      }
      // Nested groups flatten into the new group; children stay in absolute
      // slide coordinates so the exported group frame maps 1:1.
      const children: LeafObject[] = members.flatMap((object) =>
        object.type === "group" ? object.children : [object],
      );
      const frame = boundingBox(children.map(objectBounds));
      const group: GroupObject = {
        id: createId("object"),
        name: "Group",
        type: "group",
        ...frame,
        children,
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
      };

    default:
      return state;
  }
}

function createInitialState(): EditorState {
  const deck = createDeck();
  return { deck, currentSlideId: deck.slides[0]!.id, selectedIds: [] };
}

const EditorStateContext = React.createContext<EditorState | null>(null);
const EditorDispatchContext = React.createContext<React.Dispatch<EditorAction> | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(editorReducer, undefined, createInitialState);
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
  return slide.objects.filter((object) => selected.has(object.id));
}
