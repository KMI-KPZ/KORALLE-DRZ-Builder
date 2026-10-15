import { MarkerType } from '@xyflow/react'
import { DEPENDENCY_TYPES, findModuleType } from '../../model/catalog'
import type { DependencyTypeId } from '../../model/types'
import type { AggregateFlowEdge } from './AggregateEdge'

/** Id prefix of bundled overview edges. */
export const AGG_PREFIX = 'agg:'

interface NodeLike {
  id: string
  parentId?: string
  data: { typeId: string }
}

export interface EdgeLike {
  id: string
  source: string
  target: string
  data?: { typeId: DependencyTypeId; criticality: number; bidirectional?: boolean }
}

/** Dependency type with the most bundled edges. */
export function dominantType(byType: Partial<Record<DependencyTypeId, number>>): DependencyTypeId {
  let best: DependencyTypeId = 'material'
  let n = -1
  for (const [t, c] of Object.entries(byType) as [DependencyTypeId, number][]) {
    if (c > n) {
      best = t
      n = c
    }
  }
  return best
}

/**
 * Dependencies between nodes that are visible on their own stay single edges (`direct`). All others are
 * bundled per pair of representatives (a condensed or collapsed group, or the visible module).
 * Information flows are left out of bundles unless switched on, they dominate the picture otherwise.
 * With an active analysis, bundles without an edge on the highlighted path are dimmed.
 */
export function aggregate<E extends EdgeLike>(
  edges: E[],
  nodes: NodeLike[],
  representative: (id: string) => string,
  categoryLayers: Record<string, boolean>,
  includeInfo: boolean,
  highlighted: Set<string> | null,
): { bundles: AggregateFlowEdge[]; direct: E[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const visibleNode = (id: string) => {
    const n = byId.get(id)
    const cat = n ? findModuleType(n.data.typeId)?.category : undefined
    return !!n && (cat ? categoryLayers[cat] !== false : true)
  }
  const groups = new Map<string, AggregateFlowEdge>()
  const direct: E[] = []
  for (const e of edges) {
    if (!e.data) continue
    const a = representative(e.source)
    const b = representative(e.target)
    if (a === e.source && b === e.target) {
      direct.push(e)
      continue
    }
    if (a === b || (!includeInfo && e.data.typeId === 'information')) continue
    if (!visibleNode(e.source) || !visibleNode(e.target)) continue
    const [s, t] = a < b ? [a, b] : [b, a]
    const key = `${AGG_PREFIX}${s}|${t}`
    let agg = groups.get(key)
    if (!agg) {
      agg = {
        id: key,
        type: 'aggregate',
        source: s,
        target: t,
        selectable: false,
        focusable: false,
        data: { count: 0, byType: {}, forward: false, backward: false, maxCriticality: 0 },
      }
      groups.set(key, agg)
    }
    const d = agg.data!
    d.count++
    d.byType[e.data.typeId] = (d.byType[e.data.typeId] ?? 0) + 1
    d.maxCriticality = Math.max(d.maxCriticality, e.data.criticality)
    if (a === s) d.forward = true
    else d.backward = true
    if (e.data.bidirectional) d.forward = d.backward = true
    const onPath = !highlighted || (highlighted.has(e.source) && highlighted.has(e.target))
    d.dimmed = onPath ? false : (d.dimmed ?? true)
  }
  const bundles = [...groups.values()]
  for (const agg of bundles) {
    const type = DEPENDENCY_TYPES.find((t) => t.id === dominantType(agg.data!.byType))!
    const marker = { type: MarkerType.ArrowClosed, color: `var(${type.colorVar})`, width: 9, height: 9 }
    if (agg.data!.forward) agg.markerEnd = marker
    if (agg.data!.backward) agg.markerStart = marker
  }
  return { bundles, direct }
}
