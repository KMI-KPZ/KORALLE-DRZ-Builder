import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'
import type { DependencyTypeId } from './types'

export interface LayoutInputNode {
  id: string
  parentId?: string
  isGroup: boolean
  width: number
  height: number
}

export interface LayoutInputEdge {
  id: string
  source: string
  target: string
  typeId: DependencyTypeId
}

export interface LayoutResult {
  x: number
  y: number
  width?: number
  height?: number
}

/**
 * Only structural dependencies drive the layout. Information flows are drawn
 * but ignored here: they point back and forth between the shop floor and the
 * IT layer and would otherwise scramble the left-to-right material flow.
 */
const LAYOUT_EDGE_TYPES: DependencyTypeId[] = ['material', 'control', 'resource']

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> }
let elk: Elk | null = null

/** ELK is large (~1.5 MB); load it only when the user asks for an automatic layout. */
async function getElk(): Promise<Elk> {
  if (!elk) {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
    elk = new ELK()
  }
  return elk
}

const GROUP_PADDING = '[top=56,left=20,bottom=20,right=20]'

/** Groups with an internal flow are laid out as a flow, all others as a compact grid. */
function groupOptions(hasFlow: boolean): LayoutOptions {
  return hasFlow
    ? {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.padding': GROUP_PADDING,
        'elk.spacing.nodeNode': '24',
        'elk.layered.spacing.nodeNodeBetweenLayers': '40',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.spacing.componentComponent': '24',
      }
    : {
        'elk.algorithm': 'rectpacking',
        'elk.padding': GROUP_PADDING,
        'elk.spacing.nodeNode': '24',
        'elk.aspectRatio': '2.4',
      }
}

/**
 * Two-level layout: every group is arranged on its own, then the groups and
 * top-level modules are arranged along the aggregated dependencies between
 * them (e.g. "Halle Spritzguss → Lackieranlage").
 */
export async function computeLayout(
  nodes: LayoutInputNode[],
  edges: LayoutInputEdge[],
): Promise<Map<string, LayoutResult>> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const elkNodes = new Map<string, ElkNode>()
  for (const n of nodes) {
    elkNodes.set(n.id, n.isGroup ? { id: n.id, children: [], edges: [] } : { id: n.id, width: n.width, height: n.height })
  }

  const roots: ElkNode[] = []
  for (const n of nodes) {
    const elkNode = elkNodes.get(n.id)!
    const parent = n.parentId ? elkNodes.get(n.parentId) : undefined
    if (parent?.children) parent.children.push(elkNode)
    else roots.push(elkNode)
  }

  /** Ancestor of `id` that is a direct child of `containerId` (undefined = root). */
  const ancestorIn = (id: string, containerId: string | undefined): string | undefined => {
    let cur = byId.get(id)
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      const parentId = cur.parentId && byId.has(cur.parentId) ? cur.parentId : undefined
      if (parentId === containerId) return cur.id
      cur = parentId ? byId.get(parentId) : undefined
    }
    return undefined
  }

  // Place every edge in the lowest container holding both ends, aggregated to that level.
  const containers = [undefined, ...nodes.filter((n) => n.isGroup).map((n) => n.id)]
  const rootEdges: ElkExtendedEdge[] = []
  const flowGroups = new Set<string>()
  for (const containerId of containers) {
    const seen = new Set<string>()
    for (const e of edges) {
      if (!LAYOUT_EDGE_TYPES.includes(e.typeId)) continue
      const s = ancestorIn(e.source, containerId)
      const t = ancestorIn(e.target, containerId)
      if (!s || !t || s === t) continue
      const key = `${s}>${t}`
      if (seen.has(key)) continue
      seen.add(key)
      const elkEdge: ElkExtendedEdge = {
        id: `${containerId ?? 'root'}:${key}`,
        sources: [s],
        targets: [t],
        layoutOptions: { 'elk.layered.priority.direction': e.typeId === 'material' ? '10' : '1' },
      }
      if (containerId) {
        elkNodes.get(containerId)!.edges!.push(elkEdge)
        flowGroups.add(containerId)
      } else {
        rootEdges.push(elkEdge)
      }
    }
  }
  for (const n of nodes) {
    if (!n.isGroup) continue
    const g = elkNodes.get(n.id)!
    g.layoutOptions = groupOptions(flowGroups.has(n.id))
    if (g.children!.length === 0) {
      g.width = 240
      g.height = 140
    }
  }

  const graph: ElkNode = {
    id: '__root__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '56',
      'elk.spacing.componentComponent': '56',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
    },
    children: roots,
    edges: rootEdges,
  }

  const result = await (await getElk()).layout(graph)
  const positions = new Map<string, LayoutResult>()
  const visit = (n: ElkNode) => {
    if (n.id !== '__root__') {
      const isGroup = byId.get(n.id)?.isGroup === true
      positions.set(n.id, {
        x: Math.round(n.x ?? 0),
        y: Math.round(n.y ?? 0),
        ...(isGroup ? { width: Math.round(n.width ?? 240), height: Math.round(n.height ?? 140) } : {}),
      })
    }
    for (const c of n.children ?? []) visit(c)
  }
  visit(result)
  return positions
}
