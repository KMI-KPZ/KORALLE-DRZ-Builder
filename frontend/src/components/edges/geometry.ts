import type { InternalNode } from '@xyflow/react'

interface Point {
  x: number
  y: number
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function rectOf(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  }
}

const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })

/** Point where the line from the rect centre towards `towards` leaves the rect. */
function borderPoint(r: Rect, towards: Point): Point {
  const w = r.width / 2
  const h = r.height / 2
  const c = center(r)
  if (w === 0 || h === 0) return c
  const xx1 = (towards.x - c.x) / (2 * w) - (towards.y - c.y) / (2 * h)
  const yy1 = (towards.x - c.x) / (2 * w) + (towards.y - c.y) / (2 * h)
  const denom = Math.abs(xx1) + Math.abs(yy1)
  if (denom === 0) return c
  const a = 1 / denom
  const xx3 = a * xx1
  const yy3 = a * yy1
  return { x: w * (xx3 + yy3) + c.x, y: h * (-xx3 + yy3) + c.y }
}

export interface EdgeGeometry {
  path: string
  labelX: number
  labelY: number
}

/**
 * Quadratic curve between the borders of two nodes. `offset` bends the curve
 * sideways so that parallel dependencies between the same pair stay apart.
 */
export function floatingGeometry(source: InternalNode, target: InternalNode, offset = 0): EdgeGeometry {
  const s = rectOf(source)
  const t = rectOf(target)
  const sc = center(s)
  const tc = center(t)
  const dx = tc.x - sc.x
  const dy = tc.y - sc.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const control = { x: (sc.x + tc.x) / 2 + nx * offset, y: (sc.y + tc.y) / 2 + ny * offset }
  const p1 = borderPoint(s, control)
  const p2 = borderPoint(t, control)
  const path = `M ${p1.x},${p1.y} Q ${control.x},${control.y} ${p2.x},${p2.y}`
  return {
    path,
    labelX: 0.25 * p1.x + 0.5 * control.x + 0.25 * p2.x,
    labelY: 0.25 * p1.y + 0.5 * control.y + 0.25 * p2.y,
  }
}
