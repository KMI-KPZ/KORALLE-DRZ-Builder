import { useStore, type ReactFlowState } from '@xyflow/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { useModelStore } from '../store/useModelStore'

/** Below this zoom level every group is shown condensed (box with summary, bundled dependencies). */
export const DETAIL_ZOOM = 0.6
/**
 * From DETAIL_ZOOM on, a group shows its content only while it reaches into the middle of the screen.
 * A condensed group opens when it overlaps the inner region (ENTER_MARGIN cut off at each side) and closes
 * again only when it leaves the larger region (LEAVE_MARGIN), so groups do not flicker at the border.
 */
const ENTER_MARGIN = 0.22
const LEAVE_MARGIN = 0.08

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

function inset(r: Rect, margin: number): Rect {
  return { x: r.x + r.w * margin, y: r.y + r.h * margin, w: r.w * (1 - 2 * margin), h: r.h * (1 - 2 * margin) }
}

/**
 * Top-level groups that are condensed at the current viewport, as a sorted key (`a|b|c`).
 * Pure so it can be tested; `previous` provides the hysteresis.
 */
export function condensedKey(
  groups: { id: string; rect: Rect; pinned: boolean }[],
  viewport: Rect,
  zoom: number,
  previous: ReadonlySet<string>,
): string {
  const out: string[] = []
  for (const g of groups) {
    if (zoom < DETAIL_ZOOM) out.push(g.id)
    else if (g.pinned) continue
    else if (!overlaps(g.rect, inset(viewport, previous.has(g.id) ? ENTER_MARGIN : LEAVE_MARGIN))) out.push(g.id)
  }
  return out.sort().join('|')
}

/**
 * Condensed top-level groups for the canvas. Empty when semantic zoom is off and in the simulation view.
 * The group of the selected module always shows its content (from DETAIL_ZOOM on).
 */
export function useCondensedGroups(): Set<string> {
  const enabled = useModelStore((s) => s.semanticZoom && s.view !== 'simulation')
  const selectedId = useModelStore((s) => {
    const sel = s.nodes.filter((n) => n.selected)
    return sel.length === 1 ? sel[0].id : null
  })
  const previous = useRef<ReadonlySet<string>>(new Set())

  const selector = useCallback(
    (s: ReactFlowState) => {
      if (!enabled || s.width === 0) return ''
      const [tx, ty, k] = s.transform
      let pinnedTop: string | null = null
      if (selectedId) {
        let cur = s.nodeLookup.get(selectedId)
        while (cur?.parentId) cur = s.nodeLookup.get(cur.parentId)
        pinnedTop = cur?.id ?? null
      }
      const groups = [...s.nodeLookup.values()]
        .filter((n) => n.type === 'area' && !n.parentId)
        .map((n) => ({
          id: n.id,
          pinned: n.id === pinnedTop,
          rect: {
            x: n.internals.positionAbsolute.x,
            y: n.internals.positionAbsolute.y,
            w: n.measured.width ?? n.width ?? 0,
            h: n.measured.height ?? n.height ?? 0,
          },
        }))
      return condensedKey(groups, { x: -tx / k, y: -ty / k, w: s.width / k, h: s.height / k }, k, previous.current)
    },
    [enabled, selectedId],
  )
  const key = useStore(selector)
  const set = useMemo(() => new Set(key ? key.split('|') : []), [key])
  useEffect(() => {
    previous.current = set
  }, [set])
  return set
}

/**
 * Representative of a node on the canvas: the outermost enclosing group that is condensed or collapsed,
 * otherwise the node itself. Nodes whose representative is another node are hidden; their dependencies
 * are bundled at the representative.
 */
export function representativeOf<T extends { id: string; parentId?: string; collapsed?: boolean }>(
  id: string,
  byId: Map<string, T>,
  condensed: ReadonlySet<string>,
): string {
  const chain: T[] = []
  const seen = new Set<string>()
  let cur = byId.get(id)
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id)
    const parent = byId.get(cur.parentId)
    if (!parent) break
    chain.push(parent)
    cur = parent
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    if (condensed.has(chain[i].id) || chain[i].collapsed) return chain[i].id
  }
  return id
}

/** Condensed groups of the canvas, provided by Canvas for the group nodes. */
export const CondensedContext = createContext<ReadonlySet<string>>(new Set())

export const useIsCondensed = (id: string) => useContext(CondensedContext).has(id)
