import { create } from 'zustand'

/** Rectangle in flow coordinates. */
export interface FlowRect {
  x: number
  y: number
  w: number
  h: number
}

export type InspectorTab = 'eigenschaften' | 'groessen' | 'drz' | 'verbindungen'

/** Ephemeral UI state that is neither part of the model nor of the undo history. */
interface UiState {
  dropTargetId: string | null
  hoveredEdgeId: string | null
  paletteOpen: boolean
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  modal: 'export' | 'import' | null
  /** Section drawn on the canvas: everything outside fades out. */
  region: FlowRect | null
  regionDrawing: boolean
  setRegion: (r: FlowRect | null) => void
  setRegionDrawing: (v: boolean) => void
  setDropTarget: (id: string | null) => void
  setHoveredEdge: (id: string | null) => void
  setPaletteOpen: (v: boolean) => void
  setInspectorOpen: (v: boolean) => void
  setInspectorTab: (t: InspectorTab) => void
  setModal: (m: UiState['modal']) => void
}

export const useUiStore = create<UiState>()((set) => ({
  dropTargetId: null,
  hoveredEdgeId: null,
  paletteOpen: false,
  inspectorOpen: false,
  inspectorTab: 'eigenschaften',
  modal: null,
  region: null,
  regionDrawing: false,
  setRegion: (r) => set({ region: r, regionDrawing: false }),
  setRegionDrawing: (v) => set({ regionDrawing: v }),
  setDropTarget: (id) => set({ dropTargetId: id }),
  setHoveredEdge: (id) => set({ hoveredEdgeId: id }),
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  setInspectorOpen: (v) => set({ inspectorOpen: v }),
  setInspectorTab: (t) => set({ inspectorTab: t }),
  setModal: (m) => set({ modal: m }),
}))
