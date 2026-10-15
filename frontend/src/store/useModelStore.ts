import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { createMagnaModel } from '../data/magnaMeerane'
import { localRepository } from '../data/repository'
import { descendantsOf, propagate, type Direction, type PropagationHit } from '../model/analysis'
import { CATEGORY_ORDER, DEPENDENCY_TYPES, findModuleType, getModuleType } from '../model/catalog'
import { newId } from '../model/ids'
import { SCHEMA_VERSION } from '../model/jsonld'
import { computeLayout } from '../model/layout'
import type { Category, DependencyData, DependencyTypeId, KoralleModel, ModuleData } from '../model/types'
import {
  absolutePosition,
  COLLAPSED_GROUP_HEIGHT,
  collapsedDescendants,
  DEFAULT_GROUP_SIZE,
  isCollapsed,
  flowToModel,
  graphOf,
  groupAt,
  modelNodeToFlow,
  modelToFlow,
  nodeSize,
  sortParentsFirst,
  type AppEdge,
  type AppNode,
  type AreaFlowNode,
} from './flow'

export const DRZ_EDGE_PREFIX = 'drz:'

interface Snapshot {
  nodes: AppNode[]
  edges: AppEdge[]
}

export interface AnalysisState {
  originId: string
  groesseId?: string
  direction: Direction
  types: DependencyTypeId[]
  hits: Record<string, PropagationHit>
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

export type View = 'canvas' | 'matrix' | 'simulation'

interface ModelState {
  organization: KoralleModel['organization']
  schemaVersion: string
  nodes: AppNode[]
  edges: AppEdge[]
  past: Snapshot[]
  future: Snapshot[]

  connectionType: DependencyTypeId
  edgeLayers: Record<DependencyTypeId, boolean>
  categoryLayers: Record<Category, boolean>
  showDrzLinks: boolean
  showLabels: boolean
  /** Zoomed out, groups show a summary and dependencies are bundled between groups. */
  semanticZoom: boolean
  /** Bundle information flows in the overview too (off: only material, control, resource). */
  infoInOverview: boolean
  view: View
  analysis: AnalysisState | null
  toast: Toast | null
  /** Set by the matrix or lists to move the canvas viewport to a node. */
  focusRequest: { nodeId: string; nonce: number } | null
  layoutRunning: boolean

  // graph editing
  onNodesChange: (changes: NodeChange<AppNode>[]) => void
  onEdgesChange: (changes: EdgeChange<AppEdge>[]) => void
  onConnect: (connection: Connection) => void
  addNode: (typeId: string, absolute: { x: number; y: number }, extra?: Partial<ModuleData>) => string
  reparent: (nodeId: string, parentId: string | null) => void
  updateNodeData: (id: string, patch: Partial<ModuleData>, coalesceKey?: string) => void
  updateEdgeData: (id: string, patch: Partial<DependencyData>, coalesceKey?: string) => void
  reverseEdge: (id: string) => void
  deleteNodes: (ids: string[]) => void
  deleteEdges: (ids: string[]) => void
  deleteSelection: () => void
  toggleDrz: (nodeId: string, drzId: string) => void
  /** Collapses a group to its header or expands it again. Not part of the undo history. */
  toggleCollapsed: (groupId: string) => void
  pushHistory: (coalesceKey?: string) => void
  undo: () => void
  redo: () => void

  // selection & view
  select: (target: { nodeId?: string; edgeId?: string } | null) => void
  focusNode: (nodeId: string) => void
  setConnectionType: (t: DependencyTypeId) => void
  toggleEdgeLayer: (t: DependencyTypeId) => void
  toggleCategoryLayer: (c: Category) => void
  setShowDrzLinks: (v: boolean) => void
  setShowLabels: (v: boolean) => void
  setSemanticZoom: (v: boolean) => void
  setInfoInOverview: (v: boolean) => void
  setView: (v: View) => void

  // analysis
  startAnalysis: (originId: string, groesseId?: string) => void
  setAnalysisOptions: (patch: Partial<Pick<AnalysisState, 'direction' | 'types'>>) => void
  stopAnalysis: () => void

  // model lifecycle
  loadModel: (model: KoralleModel) => void
  resetToDemo: () => void
  getModel: () => KoralleModel
  autoLayout: () => Promise<void>
  notify: (text: string, tone?: Toast['tone']) => void
}

const HISTORY_LIMIT = 80
const COALESCE_MS = 1200
let lastCoalesce: { key: string; at: number } | null = null
let toastSeq = 0

const allEdgeLayers = Object.fromEntries(DEPENDENCY_TYPES.map((t) => [t.id, true])) as Record<DependencyTypeId, boolean>
const allCategoryLayers = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, true])) as Record<Category, boolean>

const initialModel = localRepository.loadSync() ?? createMagnaModel()
const initialFlow = modelToFlow(initialModel)

function computeHits(nodes: AppNode[], edges: AppEdge[], a: Omit<AnalysisState, 'hits'>): Record<string, PropagationHit> {
  const hits = propagate(graphOf(nodes, edges), a.originId, { direction: a.direction, types: a.types })
  return Object.fromEntries(hits)
}

export const useModelStore = create<ModelState>()((set, get) => ({
  organization: initialModel.organization,
  schemaVersion: initialModel.schemaVersion,
  nodes: initialFlow.nodes,
  edges: initialFlow.edges,
  past: [],
  future: [],

  connectionType: 'material',
  edgeLayers: allEdgeLayers,
  categoryLayers: allCategoryLayers,
  showDrzLinks: false,
  showLabels: false,
  semanticZoom: true,
  infoInOverview: false,
  view: 'canvas',
  analysis: null,
  toast: null,
  focusRequest: null,
  layoutRunning: false,

  pushHistory: (coalesceKey) => {
    const now = Date.now()
    if (coalesceKey && lastCoalesce && lastCoalesce.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS) {
      lastCoalesce.at = now
      return
    }
    lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null
    const { nodes, edges, past } = get()
    set({ past: [...past.slice(-HISTORY_LIMIT + 1), { nodes, edges }], future: [] })
  },

  undo: () => {
    const { past, future, nodes, edges } = get()
    const prev = past[past.length - 1]
    if (!prev) return
    lastCoalesce = null
    set({ nodes: prev.nodes, edges: prev.edges, past: past.slice(0, -1), future: [{ nodes, edges }, ...future] })
  },

  redo: () => {
    const { past, future, nodes, edges } = get()
    const next = future[0]
    if (!next) return
    lastCoalesce = null
    set({ nodes: next.nodes, edges: next.edges, past: [...past, { nodes, edges }], future: future.slice(1) })
  },

  onNodesChange: (changes) => {
    const removals = changes.filter((c) => c.type === 'remove').map((c) => c.id)
    if (removals.length > 0) {
      get().deleteNodes(removals)
      changes = changes.filter((c) => c.type !== 'remove')
      if (changes.length === 0) return
    }
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes) => {
    const drzRemovals: string[] = []
    const regular: EdgeChange<AppEdge>[] = []
    for (const c of changes) {
      const id = 'id' in c ? c.id : ''
      if (id.startsWith(DRZ_EDGE_PREFIX)) {
        if (c.type === 'remove') drzRemovals.push(id)
        continue
      }
      regular.push(c)
    }
    for (const id of drzRemovals) {
      const [, nodeId, drzId] = id.split(':')
      get().toggleDrz(nodeId, drzId)
    }
    const existing = new Set(get().edges.map((e) => e.id))
    const removals = regular.filter((c) => c.type === 'remove' && existing.has(c.id))
    if (removals.length > 0) get().pushHistory()
    if (regular.length > 0) set({ edges: applyEdgeChanges(regular, get().edges) })
  },

  onConnect: (connection) => {
    const { source, target } = connection
    if (!source || !target || source === target) return
    const { nodes, edges, connectionType } = get()
    const s = nodes.find((n) => n.id === source)
    const t = nodes.find((n) => n.id === target)
    if (!s || !t) return
    if (s.type === 'area' || t.type === 'area') {
      get().notify('Verbindungen gehen nur zwischen Modulen, nicht zu Hallen oder Ebenen.', 'error')
      return
    }
    const sDrz = s.data.typeId === 'drz'
    const tDrz = t.data.typeId === 'drz'
    if (sDrz && tDrz) {
      get().notify('Zwei DRZ-Module lassen sich nicht direkt verbinden.', 'error')
      return
    }
    if (sDrz || tDrz) {
      const moduleNode = sDrz ? t : s
      const drzNode = sDrz ? s : t
      if (!findModuleType(moduleNode.data.typeId)?.drzAssignable) {
        get().notify(`${getModuleType(moduleNode.data.typeId).label} kann kein DRZ-Modul nutzen.`, 'error')
        return
      }
      if (!moduleNode.data.drz.includes(drzNode.id)) get().toggleDrz(moduleNode.id, drzNode.id)
      get().notify(`${moduleNode.data.label} nutzt jetzt ${drzNode.data.label}.`, 'success')
      return
    }
    if (edges.some((e) => e.source === source && e.target === target && e.data?.typeId === connectionType)) {
      get().notify('Diese Verbindung gibt es schon.', 'info')
      return
    }
    get().pushHistory()
    const id = newId('e')
    const edge: AppEdge = {
      id,
      type: 'dependency',
      source,
      target,
      selected: true,
      data: { typeId: connectionType, criticality: 2, source: 'manuell ergänzt' },
    }
    set({
      edges: [...get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)), edge],
      nodes: get().nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
    })
  },

  addNode: (typeId, absolute, extra) => {
    const type = getModuleType(typeId)
    const { nodes } = get()
    get().pushHistory()
    const id = newId('n')
    const parent = groupAt(nodes, absolute, new Set())
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const parentPos = parent ? absolutePosition(parent.id, byId) : { x: 0, y: 0 }
    const data: ModuleData = {
      typeId,
      label: extra?.label ?? type.label,
      properties: {},
      groessen: [],
      drz: [],
      source: 'manuell ergänzt',
      ...extra,
    }
    const created = modelNodeToFlow({
      id,
      parentId: parent?.id,
      data,
      layout: {
        x: Math.round(absolute.x - parentPos.x),
        y: Math.round(absolute.y - parentPos.y),
        ...(type.isGroup ? DEFAULT_GROUP_SIZE : {}),
      },
    })
    created.selected = true
    set({
      nodes: sortParentsFirst([...nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), created]),
      edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    })
    return id
  },

  reparent: (nodeId, parentId) => {
    const { nodes } = get()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || (node.parentId ?? null) === parentId) return
    if (parentId && (parentId === nodeId || descendantsOf(nodes, nodeId).has(parentId))) return
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const abs = absolutePosition(nodeId, byId)
    const parentAbs = parentId ? absolutePosition(parentId, byId) : { x: 0, y: 0 }
    const updated = nodes.map((n) =>
      n.id === nodeId
        ? { ...n, parentId: parentId ?? undefined, position: { x: abs.x - parentAbs.x, y: abs.y - parentAbs.y } }
        : n,
    )
    set({ nodes: sortParentsFirst(updated) })
  },

  updateNodeData: (id, patch, coalesceKey) => {
    get().pushHistory(coalesceKey ?? `node:${id}:${Object.keys(patch).join(',')}`)
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) })
  },

  updateEdgeData: (id, patch, coalesceKey) => {
    get().pushHistory(coalesceKey ?? `edge:${id}:${Object.keys(patch).join(',')}`)
    set({ edges: get().edges.map((e) => (e.id === id && e.data ? { ...e, data: { ...e.data, ...patch } } : e)) })
  },

  reverseEdge: (id) => {
    get().pushHistory()
    set({ edges: get().edges.map((e) => (e.id === id ? { ...e, source: e.target, target: e.source } : e)) })
  },

  deleteNodes: (ids) => {
    const { nodes, edges, analysis } = get()
    const remove = new Set<string>()
    for (const id of ids) {
      remove.add(id)
      for (const d of descendantsOf(nodes, id)) remove.add(d)
    }
    if (remove.size === 0) return
    get().pushHistory()
    set({
      nodes: nodes
        .filter((n) => !remove.has(n.id))
        .map((n) => (n.data.drz.some((d) => remove.has(d)) ? { ...n, data: { ...n.data, drz: n.data.drz.filter((d) => !remove.has(d)) } } : n)),
      edges: edges.filter((e) => !remove.has(e.source) && !remove.has(e.target)),
      analysis: analysis && remove.has(analysis.originId) ? null : analysis,
    })
  },

  deleteEdges: (ids) => {
    const remove = new Set(ids)
    get().pushHistory()
    set({ edges: get().edges.filter((e) => !remove.has(e.id)) })
  },

  deleteSelection: () => {
    const { nodes, edges } = get()
    const nodeIds = nodes.filter((n) => n.selected).map((n) => n.id)
    const edgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id))
    if (nodeIds.length === 0 && edgeIds.size === 0) return
    if (nodeIds.length > 0) {
      get().deleteNodes(nodeIds)
      if (edgeIds.size > 0) set({ edges: get().edges.filter((e) => !edgeIds.has(e.id)) })
    } else {
      get().deleteEdges([...edgeIds])
    }
  },

  toggleDrz: (nodeId, drzId) => {
    get().pushHistory()
    set({
      nodes: get().nodes.map((n) => {
        if (n.id !== nodeId) return n
        const has = n.data.drz.includes(drzId)
        return { ...n, data: { ...n.data, drz: has ? n.data.drz.filter((d) => d !== drzId) : [...n.data.drz, drzId] } }
      }),
    })
  },

  toggleCollapsed: (groupId) => {
    const { nodes } = get()
    const group = nodes.find((n) => n.id === groupId)
    if (!group || group.type !== 'area') return
    const collapse = !isCollapsed(group)
    const inside = descendantsOf(nodes, groupId)
    const next = nodes.map((n) => {
      if (n.id === groupId) {
        const g = n as AreaFlowNode
        if (collapse) {
          const expandedHeight = g.height ?? g.measured?.height ?? DEFAULT_GROUP_SIZE.height
          return { ...g, collapsed: true, expandedHeight, height: COLLAPSED_GROUP_HEIGHT }
        }
        const { collapsed: _c, expandedHeight, ...rest } = g
        void _c
        return { ...rest, height: expandedHeight ?? DEFAULT_GROUP_SIZE.height } as AppNode
      }
      return collapse && inside.has(n.id) && n.selected ? { ...n, selected: false } : n
    })
    set({ nodes: next })
  },

  select: (target) => {
    set({
      nodes: get().nodes.map((n) => {
        const selected = n.id === target?.nodeId
        return n.selected === selected ? n : { ...n, selected }
      }),
      edges: get().edges.map((e) => {
        const selected = e.id === target?.edgeId
        return e.selected === selected ? e : { ...e, selected }
      }),
    })
  },

  focusNode: (nodeId) => {
    get().select({ nodeId })
    set({ view: get().view === 'simulation' ? 'simulation' : 'canvas', focusRequest: { nodeId, nonce: Date.now() } })
  },

  setConnectionType: (t) => set({ connectionType: t }),
  toggleEdgeLayer: (t) => set({ edgeLayers: { ...get().edgeLayers, [t]: !get().edgeLayers[t] } }),
  toggleCategoryLayer: (c) => set({ categoryLayers: { ...get().categoryLayers, [c]: !get().categoryLayers[c] } }),
  setShowDrzLinks: (v) => set({ showDrzLinks: v }),
  setShowLabels: (v) => set({ showLabels: v }),
  setSemanticZoom: (v) => set({ semanticZoom: v }),
  setInfoInOverview: (v) => set({ infoInOverview: v }),
  setView: (v) => set(v === 'simulation' ? { view: v, analysis: null } : { view: v }),

  startAnalysis: (originId, groesseId) => {
    const prev = get().analysis
    const base = {
      originId,
      groesseId,
      direction: prev?.direction ?? ('downstream' as Direction),
      types: prev?.types ?? DEPENDENCY_TYPES.map((t) => t.id),
    }
    set({ analysis: { ...base, hits: computeHits(get().nodes, get().edges, base) } })
  },

  setAnalysisOptions: (patch) => {
    const a = get().analysis
    if (!a) return
    const base = { ...a, ...patch }
    set({ analysis: { ...base, hits: computeHits(get().nodes, get().edges, base) } })
  },

  stopAnalysis: () => set({ analysis: null }),

  loadModel: (model) => {
    const flow = modelToFlow(model)
    get().pushHistory()
    set({
      organization: model.organization,
      schemaVersion: model.schemaVersion,
      nodes: flow.nodes,
      edges: flow.edges,
      analysis: null,
      focusRequest: { nodeId: '', nonce: Date.now() },
    })
  },

  resetToDemo: () => {
    get().loadModel(createMagnaModel())
    get().notify('Magna-Startmodell geladen. Mit Rückgängig kommst du zurück.', 'success')
  },

  getModel: () => {
    const { organization, schemaVersion, nodes, edges } = get()
    return flowToModel(organization, schemaVersion || SCHEMA_VERSION, nodes, edges)
  },

  autoLayout: async () => {
    const { nodes, edges } = get()
    set({ layoutRunning: true })
    try {
      // Collapsed groups are laid out as plain boxes; their content keeps its positions.
      const hidden = collapsedDescendants(nodes)
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const visibleEnd = (id: string): string => {
        let cur = byId.get(id)
        while (cur && hidden.has(cur.id) && cur.parentId) cur = byId.get(cur.parentId)
        return cur?.id ?? id
      }
      const layoutEdges = edges
        .map((e) => ({ id: e.id, source: visibleEnd(e.source), target: visibleEnd(e.target), typeId: e.data!.typeId }))
        .filter((e) => e.source !== e.target)
      const positions = await computeLayout(
        nodes
          .filter((n) => !hidden.has(n.id))
          .map((n) => ({ id: n.id, parentId: n.parentId, isGroup: n.type === 'area' && !isCollapsed(n), ...nodeSize(n) })),
        layoutEdges,
      )
      get().pushHistory()
      set({
        nodes: get().nodes.map((n) => {
          const p = positions.get(n.id)
          if (!p) return n
          return {
            ...n,
            position: { x: p.x, y: p.y },
            ...(n.type === 'area' && !isCollapsed(n) && p.width && p.height ? { width: p.width, height: p.height } : {}),
          }
        }),
        focusRequest: { nodeId: '', nonce: Date.now() },
      })
      get().notify('Automatisch angeordnet. Mit Rückgängig kommst du zur vorherigen Anordnung.', 'success')
    } catch (err) {
      get().notify(`Anordnen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      set({ layoutRunning: false })
    }
  },

  notify: (text, tone = 'info') => {
    const id = ++toastSeq
    set({ toast: { id, text, tone } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, tone === 'error' ? 5000 : 3500)
  },
}))

// A working copy from an older schema was migrated: point to the updated starting model.
if (localRepository.storedVersion && localRepository.storedVersion !== SCHEMA_VERSION && initialModel.organization.id === 'magna-meerane') {
  setTimeout(
    () =>
      useModelStore
        .getState()
        .notify('Gespeichertes Modell aktualisiert. Neue Inhalte des Magna-Startmodells (Stationen, Datenquellen) über „Startmodell laden“.'),
    800,
  )
}

// Keep the propagation result in sync with graph edits.
useModelStore.subscribe((state, prev) => {
  if (!state.analysis) return
  if (state.edges === prev.edges && state.nodes.length === prev.nodes.length) return
  const { hits: _ignored, ...base } = state.analysis
  void _ignored
  useModelStore.setState({ analysis: { ...base, hits: computeHits(state.nodes, state.edges, base) } })
})

// Autosave the working copy (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined
useModelStore.subscribe((state, prev) => {
  if (state.nodes === prev.nodes && state.edges === prev.edges && state.organization === prev.organization) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void localRepository.save(useModelStore.getState().getModel())
  }, 500)
})
