import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnConnectEnd,
  type OnNodeDrag,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, type DragEvent } from 'react'
import { descendantsOf } from '../model/analysis'
import { CATEGORY_META, DEPENDENCY_TYPES, findModuleType } from '../model/catalog'
import { findDrzKind } from '../model/drzCatalog'
import { absolutePosition, groupAt, nodeSize, type AppNode } from '../store/flow'
import { DRZ_EDGE_PREFIX, useModelStore } from '../store/useModelStore'
import { useUiStore } from '../store/useUiStore'
import { useSim } from '../sim/simContext'
import { AnalysisBar } from './AnalysisBar'
import { hitColor } from './analysisColors'
import { DND_DRZ_KIND, DND_TYPE } from './dnd'
import { AGG_PREFIX, aggregate } from './edges/aggregate'
import { AggregateEdge } from './edges/AggregateEdge'
import { DependencyEdge, DrzEdge, type DependencyFlowEdge, type DrzFlowEdge } from './edges/DependencyEdge'
import { CondensedContext, DETAIL_ZOOM, representativeOf, useCondensedGroups } from './overview'
import { ConnectionToolbar, Legend } from './Legend'
import { AreaNode } from './nodes/AreaNode'
import { ModuleNode } from './nodes/ModuleNode'
import { fmtDuration } from './sim/format'
import { SimCanvasBar } from './sim/SimCanvasBar'
import { DetailMiniMap } from './DetailMiniMap'
import { nodesInRegion } from './region'
import { RegionButton, RegionLayer } from './RegionLayer'

const nodeTypes = { module: ModuleNode, area: AreaNode }
const edgeTypes = { dependency: DependencyEdge, drz: DrzEdge, aggregate: AggregateEdge }

const PARALLEL_SPACING = 34
/** Keeps the toolbar (top), legend (bottom) and controls (right) clear of the model. */
const FIT_PADDING = { top: '68px', right: '48px', bottom: '60px', left: '24px' } as const

export function Canvas() {
  const nodes = useModelStore((s) => s.nodes)
  const edges = useModelStore((s) => s.edges)
  const edgeLayers = useModelStore((s) => s.edgeLayers)
  const categoryLayers = useModelStore((s) => s.categoryLayers)
  const showDrzLinks = useModelStore((s) => s.showDrzLinks)
  const showLabels = useModelStore((s) => s.showLabels)
  const analysis = useModelStore((s) => s.analysis)
  const focusRequest = useModelStore((s) => s.focusRequest)
  const onNodesChange = useModelStore((s) => s.onNodesChange)
  const onEdgesChange = useModelStore((s) => s.onEdgesChange)
  const onConnect = useModelStore((s) => s.onConnect)
  const hoveredEdgeId = useUiStore((s) => s.hoveredEdgeId)
  const simView = useModelStore((s) => s.view === 'simulation')
  const sim = useSim()
  const condensed = useCondensedGroups()
  const region = useUiStore((s) => s.region)
  const infoInOverview = useModelStore((s) => s.infoInOverview)
  const { screenToFlowPosition, fitView } = useReactFlow()

  // Focus: with one module selected, only it and its direct neighbours stay in full colour.
  const selectedKey = nodes
    .filter((n) => n.selected)
    .map((n) => n.id)
    .join('|')
  // Representative of every node: itself, or the condensed / collapsed group that stands for it.
  const representative = useMemo(() => {
    const byId = new Map<string, AppNode & { collapsed?: boolean }>(nodes.map((n) => [n.id, n]))
    const cache = new Map<string, string>()
    return (id: string) => {
      let r = cache.get(id)
      if (r === undefined) cache.set(id, (r = representativeOf(id, byId, condensed)))
      return r
    }
  }, [nodes, condensed])

  const focus = useMemo<Set<string> | null>(() => {
    if (simView || analysis || !selectedKey || selectedKey.includes('|')) return null
    const node = nodes.find((n) => n.id === selectedKey)
    if (!node || node.type !== 'module' || representative(node.id) !== node.id) return null
    const set = new Set([node.id])
    for (const e of edges) {
      if (!e.data || !edgeLayers[e.data.typeId]) continue
      if (e.source === node.id) set.add(e.target)
      if (e.target === node.id) set.add(e.source)
    }
    return set
    // nodes is only read for the type of the selected node
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, edges, edgeLayers, representative, simView, analysis])

  // Hide nodes of switched-off categories and the content of collapsed and condensed groups
  // (their dependencies are bundled at the group).
  // Section drawn on the canvas: nodes that overlap it stay, the rest fades out.
  const inRegion = useMemo<Set<string> | null>(() => {
    if (!region) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return nodesInRegion(
      nodes.map((n) => {
        const p = absolutePosition(n.id, byId)
        const size = nodeSize(n)
        return { id: n.id, rect: { x: p.x, y: p.y, w: size.width, h: size.height } }
      }),
      region,
    )
  }, [nodes, region])
  const outside = useCallback((id: string) => inRegion !== null && !inRegion.has(id), [inRegion])

  const flowNodes = useMemo<AppNode[]>(() => {
    return nodes.map((n) => {
      const cat = findModuleType(n.data.typeId)?.category
      const hidden = representative(n.id) !== n.id || (cat ? !categoryLayers[cat] : false)
      const className = outside(n.id)
        ? 'is-outside'
        : focus && n.type === 'module' && !focus.has(n.id)
          ? 'is-faded'
          : undefined
      // Condensed group boxes lie above the bundled lines, so lines do not cross through them.
      const zIndex = n.type === 'area' ? (condensed.has(n.id) ? 1 : -1) : n.zIndex
      return n.hidden === hidden && n.className === className && n.zIndex === zIndex
        ? n
        : { ...n, hidden, className, zIndex }
    })
  }, [nodes, categoryLayers, representative, condensed, focus, outside])

  const flowEdges = useMemo<Edge[]>(() => {
    const pairCount = new Map<string, number>()
    const pairIndex = new Map<string, number>()
    const keyOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
    const { bundles, direct: visible } = aggregate(
      edges.filter((e) => e.data && edgeLayers[e.data.typeId]),
      nodes,
      representative,
      categoryLayers,
      infoInOverview,
      analysis ? new Set(Object.keys(analysis.hits).concat(analysis.originId)) : null,
    )
    for (const e of visible) pairCount.set(keyOf(e.source, e.target), (pairCount.get(keyOf(e.source, e.target)) ?? 0) + 1)

    // Edges on the propagation path are recoloured, everything else fades out.
    const pathEdges = new Map<string, string>()
    if (analysis) for (const [, hit] of Object.entries(analysis.hits)) pathEdges.set(hit.viaEdge, hitColor(hit.distance))
    // Simulation view: only the simulated material flows stay; flows with back-pressure are highlighted.
    // Mean waiting time per part on the flow (fertig, aber der Folgeschritt ist voll).
    const blocked = new Map<string, number>()
    const parts = Math.max(1, sim.scenario?.kpis.completed.mean ?? 1)
    if (simView) for (const f of sim.scenario?.flows ?? []) if (f.blockedTime / parts >= 1) blocked.set(f.id, f.blockedTime / parts)

    // Focus: bundles that do not touch the selected module fade like single edges.
    if (inRegion)
      for (const b of bundles)
        if (outside(b.source) || outside(b.target)) Object.assign(b, { markerEnd: undefined, markerStart: undefined, data: { ...b.data!, dimmed: true } })
    if (focus) for (const b of bundles) if (b.source !== selectedKey && b.target !== selectedKey) Object.assign(b, { markerEnd: undefined, markerStart: undefined, data: { ...b.data!, dimmed: true } })
    const result: Edge[] = [...bundles]
    for (const e of visible) {
      const key = keyOf(e.source, e.target)
      const count = pairCount.get(key) ?? 1
      const i = pairIndex.get(key) ?? 0
      pairIndex.set(key, i + 1)
      const type = DEPENDENCY_TYPES.find((t) => t.id === e.data!.typeId)!
      const color = `var(${type.colorVar})`
      const marker = { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
      const flowEdge: DependencyFlowEdge = {
        ...e,
        type: 'dependency',
        markerEnd: marker,
        markerStart: e.data!.bidirectional ? marker : undefined,
        data: {
          ...e.data!,
          offset: count > 1 ? (i - (count - 1) / 2) * PARALLEL_SPACING : 0,
          hitColor: simView ? (blocked.has(e.id) ? 'var(--status-serious)' : undefined) : pathEdges.get(e.id),
          dimmed: outside(e.source) || outside(e.target)
            ? true
            : simView
            ? !sim.build.flowIds.has(e.id)
            : focus
              ? e.source !== selectedKey && e.target !== selectedKey
              : analysis !== null && !pathEdges.has(e.id),
          showLabel: simView ? blocked.has(e.id) : showLabels,
          hovered: hoveredEdgeId === e.id,
          ...(simView && blocked.has(e.id) ? { label: `Ø ${fmtDuration(blocked.get(e.id)!)} Warten`, messages: undefined } : {}),
        },
      }
      result.push(flowEdge)
    }

    if (showDrzLinks && !simView) {
      for (const n of nodes) {
        for (const drzId of n.data.drz) {
          const drzEdge: DrzFlowEdge = {
            id: `${DRZ_EDGE_PREFIX}${n.id}:${drzId}`,
            type: 'drz',
            source: n.id,
            target: drzId,
            selectable: false,
            focusable: false,
            data: { dimmed: analysis !== null },
          }
          result.push(drzEdge)
        }
      }
    }
    return result
  }, [edges, edgeLayers, analysis, showLabels, hoveredEdgeId, showDrzLinks, nodes, simView, sim, representative, infoInOverview, categoryLayers, focus, selectedKey, inRegion, outside])

  // Entering the simulation view zooms to the simulated chain.
  const chainKey = simView ? [...sim.build.stepIds].sort().join('|') : ''
  useEffect(() => {
    if (!chainKey) return
    const t = setTimeout(() => fitView({ nodes: chainKey.split('|').map((id) => ({ id })), duration: 450, padding: FIT_PADDING }), 80)
    return () => clearTimeout(t)
  }, [chainKey, fitView])

  // Viewport requests from the matrix, lists, import and auto layout.
  useEffect(() => {
    if (!focusRequest) return
    const t = setTimeout(() => {
      if (focusRequest.nodeId) fitView({ nodes: [{ id: focusRequest.nodeId }], duration: 450, maxZoom: 1.15, padding: 0.6 })
      else fitView({ duration: 450, padding: FIT_PADDING })
    }, 60)
    return () => clearTimeout(t)
  }, [focusRequest, fitView])

  const onNodeDragStart = useCallback<OnNodeDrag<AppNode>>(() => {
    useModelStore.getState().pushHistory()
  }, [])

  const findDropTarget = useCallback((node: Node) => {
    const all = useModelStore.getState().nodes
    const byId = new Map(all.map((n) => [n.id, n]))
    const self = byId.get(node.id)
    if (!self) return undefined
    const abs = absolutePosition(node.id, byId)
    const size = nodeSize(self)
    const exclude = new Set([node.id, ...descendantsOf(all, node.id)])
    return groupAt(all, { x: abs.x + size.width / 2, y: abs.y + Math.min(size.height / 2, 30) }, exclude)
  }, [])

  const onNodeDrag = useCallback<OnNodeDrag<AppNode>>(
    (_, node) => {
      const target = findDropTarget(node)
      const current = useUiStore.getState().dropTargetId
      const next = target && target.id !== node.parentId ? target.id : null
      if (next !== current) useUiStore.getState().setDropTarget(next)
    },
    [findDropTarget],
  )

  const onNodeDragStop = useCallback<OnNodeDrag<AppNode>>(
    (_, _node, dragged) => {
      const store = useModelStore.getState()
      for (const node of dragged) {
        const target = findDropTarget(node)
        const newParent = target?.id ?? null
        if (newParent !== (node.parentId ?? null)) store.reparent(node.id, newParent)
      }
      useUiStore.getState().setDropTarget(null)
    },
    [findDropTarget],
  )

  const onDragOver = useCallback((event: DragEvent) => {
    if (!event.dataTransfer.types.includes(DND_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent) => {
      const typeId = event.dataTransfer.getData(DND_TYPE)
      if (!typeId) return
      event.preventDefault()
      const p = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const drzKind = findDrzKind(event.dataTransfer.getData(DND_DRZ_KIND))
      const isGroup = findModuleType(typeId)?.isGroup
      const pos = isGroup ? { x: p.x - 40, y: p.y - 20 } : { x: p.x - 105, y: p.y - 30 }
      useModelStore
        .getState()
        .addNode(
          typeId,
          pos,
          drzKind ? { label: drzKind.label, properties: { drzKind: drzKind.id, status: 'geplant' } } : undefined,
        )
    },
    [screenToFlowPosition],
  )

  // Dropping a connection anywhere on a module connects to it, not only on its handles.
  const onConnectEnd = useCallback<OnConnectEnd>((event, state) => {
    if (state.isValid) return
    const fromId = state.fromNode?.id
    if (!fromId) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    const el = document.elementFromPoint(point.clientX, point.clientY)?.closest('.react-flow__node')
    const toId = el?.getAttribute('data-id')
    if (!toId || toId === fromId) return
    useModelStore.getState().onConnect({ source: fromId, target: toId, sourceHandle: null, targetHandle: null })
  }, [])

  const onEdgeMouseEnter = useCallback((_: unknown, edge: Edge) => useUiStore.getState().setHoveredEdge(edge.id), [])
  const onEdgeMouseLeave = useCallback(() => useUiStore.getState().setHoveredEdge(null), [])
  const onNodeDoubleClick = useCallback<NodeMouseHandler<AppNode>>(
    (_, node) => {
      if (node.type === 'module') useUiStore.getState().setInspectorOpen(true)
      // Double click on a group zooms in far enough to show its content.
      else fitView({ nodes: [{ id: node.id }], duration: 450, padding: 0.12, minZoom: DETAIL_ZOOM + 0.05 })
    },
    [fitView],
  )
  // Click on a bundled line zooms to both ends.
  const onEdgeClick = useCallback(
    (_: unknown, edge: Edge) => {
      if (!edge.id.startsWith(AGG_PREFIX)) return
      fitView({ nodes: [{ id: edge.source }, { id: edge.target }], duration: 450, padding: 0.1, minZoom: DETAIL_ZOOM + 0.05 })
    },
    [fitView],
  )

  return (
    <div className="canvas-wrap" onDragOver={onDragOver} onDrop={onDrop}>
      <CondensedContext.Provider value={condensed}>
      <ReactFlow<AppNode, Edge>
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange as never}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeClick={onEdgeClick}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        deleteKeyCode={null}
        zIndexMode="basic"
        elevateNodesOnSelect={false}
        elevateEdgesOnSelect
        minZoom={0.08}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: FIT_PADDING }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} />
        <Controls showInteractive={false} position="top-right">
          <RegionButton />
        </Controls>
        <DetailMiniMap />
        <RegionLayer />
        {!analysis && !simView && <ConnectionToolbar />}
        <Legend />
        {analysis && !simView && <AnalysisBar />}
        {simView && <SimCanvasBar />}
      </ReactFlow>
      </CondensedContext.Provider>
      <style>{MINIMAP_CSS}</style>
    </div>
  )
}

const MINIMAP_CSS = [
  '.react-flow__minimap-node.minimap-area { fill: var(--surface-2); stroke: var(--border-strong); stroke-width: 2px; }',
  ...Object.entries(CATEGORY_META).map(([cat, meta]) => `.react-flow__minimap-node.minimap-${cat} { fill: var(${meta.colorVar}); }`),
].join('\n')

