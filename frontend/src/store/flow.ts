import type { Edge, Node } from '@xyflow/react'
import { findModuleType } from '../model/catalog'
import type { DependencyData, KoralleModel, ModelNode, ModuleData } from '../model/types'

export type ModuleFlowNode = Node<ModuleData, 'module'>
/**
 * Groups can be collapsed to their header. `expandedHeight` keeps the size to
 * restore; the model stores it as `layout.height` plus `layout.collapsed`.
 */
export type AreaFlowNode = Node<ModuleData, 'area'> & { collapsed?: boolean; expandedHeight?: number }
export type AppNode = ModuleFlowNode | AreaFlowNode
export type AppEdge = Edge<DependencyData, 'dependency'>

export const DEFAULT_GROUP_SIZE = { width: 480, height: 256 }
export const COLLAPSED_GROUP_HEIGHT = 44

export function isCollapsed(n: AppNode): boolean {
  return n.type === 'area' && (n as AreaFlowNode).collapsed === true
}

/** Ids of all nodes that sit (directly or indirectly) inside a collapsed group. */
export function collapsedDescendants<T extends { id: string; parentId?: string; collapsed?: boolean; type?: string }>(
  nodes: T[],
): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const hidden = new Set<string>()
  for (const n of nodes) {
    let cur = n.parentId ? byId.get(n.parentId) : undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      if (cur.type === 'area' && cur.collapsed) {
        hidden.add(n.id)
        break
      }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
  }
  return hidden
}

export function isGroupType(typeId: string): boolean {
  return findModuleType(typeId)?.isGroup === true
}

/** React Flow requires parents to appear before their children. */
export function sortParentsFirst<T extends { id: string; parentId?: string }>(nodes: T[]): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depth = (n: T): number => {
    let d = 0
    let cur = n.parentId ? byId.get(n.parentId) : undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      d++
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return d
  }
  return nodes
    .map((n, i) => ({ n, i, d: depth(n) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.n)
}

export function modelNodeToFlow(n: ModelNode): AppNode {
  const group = isGroupType(n.data.typeId)
  if (group) {
    const height = n.layout.height ?? DEFAULT_GROUP_SIZE.height
    const collapsed = n.layout.collapsed === true
    return {
      id: n.id,
      type: 'area',
      position: { x: n.layout.x, y: n.layout.y },
      parentId: n.parentId,
      data: n.data,
      width: n.layout.width ?? DEFAULT_GROUP_SIZE.width,
      height: collapsed ? COLLAPSED_GROUP_HEIGHT : height,
      ...(collapsed ? { collapsed: true, expandedHeight: height } : {}),
      // Groups stay below edges and modules so dependencies remain visible inside halls.
      zIndex: -1,
      dragHandle: '.area-node__header',
    }
  }
  return {
    id: n.id,
    type: 'module',
    position: { x: n.layout.x, y: n.layout.y },
    parentId: n.parentId,
    data: n.data,
  }
}

export function modelToFlow(model: KoralleModel): { nodes: AppNode[]; edges: AppEdge[] } {
  const nodes = sortParentsFirst(model.nodes.map(modelNodeToFlow))
  const edges: AppEdge[] = model.edges.map((e) => ({
    id: e.id,
    type: 'dependency',
    source: e.source,
    target: e.target,
    data: e.data,
  }))
  return { nodes, edges }
}

export function flowToModel(
  organization: KoralleModel['organization'],
  schemaVersion: string,
  nodes: AppNode[],
  edges: AppEdge[],
): KoralleModel {
  return {
    schemaVersion,
    organization,
    nodes: nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      data: n.data,
      layout:
        n.type === 'area'
          ? {
              x: Math.round(n.position.x),
              y: Math.round(n.position.y),
              width: Math.round(n.width ?? n.measured?.width ?? DEFAULT_GROUP_SIZE.width),
              height: Math.round(
                isCollapsed(n)
                  ? ((n as AreaFlowNode).expandedHeight ?? DEFAULT_GROUP_SIZE.height)
                  : (n.height ?? n.measured?.height ?? DEFAULT_GROUP_SIZE.height),
              ),
              ...(isCollapsed(n) ? { collapsed: true } : {}),
            }
          : { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data! })),
  }
}

/** Graph-only view (no layout) for analysis functions. */
export function graphOf(nodes: AppNode[], edges: AppEdge[]) {
  return {
    nodes: nodes.map((n) => ({ id: n.id, parentId: n.parentId, data: n.data, layout: { x: 0, y: 0 } })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data! })),
  }
}

/** Absolute position of a node, summing up parent offsets. */
export function absolutePosition(id: string, byId: Map<string, AppNode>): { x: number; y: number } {
  let x = 0
  let y = 0
  let cur = byId.get(id)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    x += cur.position.x
    y += cur.position.y
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return { x, y }
}

export function nodeSize(n: AppNode): { width: number; height: number } {
  return {
    width: n.width ?? n.measured?.width ?? (n.type === 'area' ? DEFAULT_GROUP_SIZE.width : 210),
    height: n.height ?? n.measured?.height ?? (n.type === 'area' ? DEFAULT_GROUP_SIZE.height : 72),
  }
}

/** Deepest group whose area contains the point (absolute coordinates). */
export function groupAt(nodes: AppNode[], point: { x: number; y: number }, exclude: Set<string>): AppNode | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let best: { node: AppNode; area: number } | undefined
  const hidden = collapsedDescendants(nodes)
  for (const n of nodes) {
    if (n.type !== 'area' || exclude.has(n.id) || isCollapsed(n) || hidden.has(n.id)) continue
    const pos = absolutePosition(n.id, byId)
    const size = nodeSize(n)
    const inside = point.x >= pos.x && point.x <= pos.x + size.width && point.y >= pos.y && point.y <= pos.y + size.height
    if (!inside) continue
    const area = size.width * size.height
    if (!best || area < best.area) best = { node: n, area }
  }
  return best?.node
}

