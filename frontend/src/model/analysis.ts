import { findDrzKind, type ReadinessContext } from './drzCatalog'
import type { Criticality, DependencyTypeId, KoralleModel, ModelEdge, ModelNode } from './types'

export interface GraphIndex {
  nodesById: Map<string, ModelNode>
  incoming: Map<string, ModelEdge[]>
  outgoing: Map<string, ModelEdge[]>
}

export function buildIndex(model: Pick<KoralleModel, 'nodes' | 'edges'>): GraphIndex {
  const nodesById = new Map(model.nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, ModelEdge[]>()
  const outgoing = new Map<string, ModelEdge[]>()
  for (const n of model.nodes) {
    incoming.set(n.id, [])
    outgoing.set(n.id, [])
  }
  for (const e of model.edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) continue
    outgoing.get(e.source)!.push(e)
    incoming.get(e.target)!.push(e)
  }
  return { nodesById, incoming, outgoing }
}

// ── DRZ readiness ───────────────────────────────────────────────────

export interface Readiness {
  applicable: boolean
  missing: string[]
}

function assignedKinds(node: ModelNode, index: GraphIndex): Set<string> {
  const kinds = new Set<string>()
  for (const id of node.data.drz) {
    const kind = index.nodesById.get(id)?.data.properties.drzKind
    if (typeof kind === 'string') kinds.add(kind)
  }
  return kinds
}

export function readinessFor(nodeId: string, drzNodeId: string, index: GraphIndex): Readiness {
  const node = index.nodesById.get(nodeId)
  const drzNode = index.nodesById.get(drzNodeId)
  const kind = findDrzKind(drzNode?.data.properties.drzKind)
  if (!node || !kind) return { applicable: false, missing: [] }
  if (!kind.appliesTo.includes(node.data.typeId)) return { applicable: false, missing: [] }
  const ctx: ReadinessContext = {
    node,
    incoming: index.incoming.get(nodeId) ?? [],
    outgoing: index.outgoing.get(nodeId) ?? [],
    nodesById: index.nodesById,
    assignedKinds: assignedKinds(node, index),
  }
  return { applicable: true, missing: kind.check(ctx) }
}

export interface ReadinessSummary {
  assignments: number
  ready: number
  /** Assignments whose DRZ kind does not apply to the module type. */
  mismatched: number
}

export function readinessSummary(model: Pick<KoralleModel, 'nodes' | 'edges'>, index = buildIndex(model)): ReadinessSummary {
  let assignments = 0
  let ready = 0
  let mismatched = 0
  for (const node of model.nodes) {
    for (const drzId of node.data.drz) {
      if (!index.nodesById.has(drzId)) continue
      assignments++
      const r = readinessFor(node.id, drzId, index)
      if (!r.applicable) mismatched++
      else if (r.missing.length === 0) ready++
    }
  }
  return { assignments, ready, mismatched }
}

// ── Disturbance propagation ─────────────────────────────────────────

export type Direction = 'downstream' | 'upstream' | 'both'

export interface PropagationHit {
  distance: number
  /** Edge through which the disturbance reached this node. */
  viaEdge: string
  /** Node the disturbance came from. */
  from: string
  /** Highest edge criticality on the path. */
  maxCriticality: Criticality
}

export interface PropagationOptions {
  direction: Direction
  types: DependencyTypeId[]
  maxDepth?: number
}

/**
 * Breadth-first search from the origin along dependencies.
 *
 * Downstream follows an edge from source to target (the target depends on the
 * source). Upstream follows edges backwards, which models back-pressure such
 * as "RTP voll / Rückstau Lack". Bidirectional edges are followed both ways.
 */
export function propagate(
  model: Pick<KoralleModel, 'nodes' | 'edges'>,
  originId: string,
  options: PropagationOptions,
  index = buildIndex(model),
): Map<string, PropagationHit> {
  const hits = new Map<string, PropagationHit>()
  if (!index.nodesById.has(originId)) return hits
  const allowed = new Set(options.types)
  const maxDepth = options.maxDepth ?? Infinity
  const down = options.direction !== 'upstream'
  const up = options.direction !== 'downstream'
  const visited = new Set([originId])
  let frontier: { id: string; crit: Criticality }[] = [{ id: originId, crit: 1 }]
  let depth = 0
  while (frontier.length > 0 && depth < maxDepth) {
    depth++
    const next: { id: string; crit: Criticality }[] = []
    for (const { id, crit } of frontier) {
      const steps: { edge: ModelEdge; to: string }[] = []
      for (const e of index.outgoing.get(id) ?? []) {
        if (!allowed.has(e.data.typeId)) continue
        if (down || e.data.bidirectional) steps.push({ edge: e, to: e.target })
      }
      for (const e of index.incoming.get(id) ?? []) {
        if (!allowed.has(e.data.typeId)) continue
        if (up || e.data.bidirectional) steps.push({ edge: e, to: e.source })
      }
      for (const { edge, to } of steps) {
        if (visited.has(to)) continue
        visited.add(to)
        const maxCriticality = Math.max(crit, edge.data.criticality) as Criticality
        hits.set(to, { distance: depth, viaEdge: edge.id, from: id, maxCriticality })
        next.push({ id: to, crit: maxCriticality })
      }
    }
    frontier = next
  }
  return hits
}

// ── Structural metrics ──────────────────────────────────────────────

export interface Impact {
  id: string
  /** Modules reached at all. */
  total: number
  /** Modules reached within NEAR_STEPS steps. */
  near: number
  /** Sum over reached modules of path criticality divided by distance. */
  score: number
}

export const NEAR_STEPS = 3

/**
 * Impact of a disturbance at each module. Many dependencies form loops
 * (feedback to ERP, empties back to goods-in), so plain reach saturates;
 * the score weights nearby and critical effects higher.
 */
export function impactRanking(
  model: Pick<KoralleModel, 'nodes' | 'edges'>,
  types: DependencyTypeId[],
  index = buildIndex(model),
): Impact[] {
  return model.nodes.map((n) => impactOf(model, n.id, types, index)).sort((a, b) => b.score - a.score)
}

export function impactOf(
  model: Pick<KoralleModel, 'nodes' | 'edges'>,
  id: string,
  types: DependencyTypeId[],
  index = buildIndex(model),
): Impact {
  const hits = propagate(model, id, { direction: 'downstream', types }, index)
  let score = 0
  let near = 0
  for (const h of hits.values()) {
    score += h.maxCriticality / h.distance
    if (h.distance <= NEAR_STEPS) near++
  }
  return { id, total: hits.size, near, score }
}

/** All nodes nested (transitively) inside the given group. */
export function descendantsOf(nodes: { id: string; parentId?: string }[], groupId: string): Set<string> {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (!n.parentId) continue
    if (!children.has(n.parentId)) children.set(n.parentId, [])
    children.get(n.parentId)!.push(n.id)
  }
  const result = new Set<string>()
  const queue = [...(children.get(groupId) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (result.has(id)) continue
    result.add(id)
    queue.push(...(children.get(id) ?? []))
  }
  return result
}
