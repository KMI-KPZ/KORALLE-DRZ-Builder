import type { FlowRect } from '../store/useUiStore'

export const overlaps = (a: FlowRect, b: FlowRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** Normalised rectangle between two corner points. */
export function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): FlowRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
}

/** Ids of the nodes that overlap the region. */
export function nodesInRegion(nodes: { id: string; rect: FlowRect }[], region: FlowRect): Set<string> {
  return new Set(nodes.filter((n) => overlaps(n.rect, region)).map((n) => n.id))
}
