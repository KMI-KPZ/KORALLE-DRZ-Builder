import { Panel, useReactFlow, useStore } from '@xyflow/react'
import { useMemo, useRef, type PointerEvent, type WheelEvent } from 'react'
import { findModuleType } from '../model/catalog'
import { absolutePosition, collapsedDescendants, nodeSize, type AppNode } from '../store/flow'
import { useModelStore } from '../store/useModelStore'

const W = 180
const H = 120
const MIN_ZOOM = 0.08
const MAX_ZOOM = 2

/**
 * Minimap that always shows every module, also those inside condensed groups
 * (the React Flow minimap only draws nodes that are visible on the canvas).
 */
export function DetailMiniMap() {
  const nodes = useModelStore((s) => s.nodes)
  const categoryLayers = useModelStore((s) => s.categoryLayers)
  const tx = useStore((s) => s.transform[0])
  const ty = useStore((s) => s.transform[1])
  const k = useStore((s) => s.transform[2])
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const { setViewport } = useReactFlow()
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  const items = useMemo(() => {
    const byId = new Map<string, AppNode>(nodes.map((n) => [n.id, n]))
    const hidden = collapsedDescendants(nodes)
    return nodes
      .filter((n) => !hidden.has(n.id))
      .map((n) => {
        const cat = findModuleType(n.data.typeId)?.category ?? 'struktur'
        if (n.type !== 'area' && categoryLayers[cat] === false) return null
        const p = absolutePosition(n.id, byId)
        const size = nodeSize(n)
        return { id: n.id, x: p.x, y: p.y, w: size.width, h: size.height, area: n.type === 'area', cat }
      })
      .filter((x) => x !== null)
      .sort((a, b) => Number(b.area) - Number(a.area))
  }, [nodes, categoryLayers])

  const view = { x: -tx / k, y: -ty / k, w: width / k, h: height / k }
  let minX = view.x
  let minY = view.y
  let maxX = view.x + view.w
  let maxY = view.y + view.h
  for (const it of items) {
    minX = Math.min(minX, it.x)
    minY = Math.min(minY, it.y)
    maxX = Math.max(maxX, it.x + it.w)
    maxY = Math.max(maxY, it.y + it.h)
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04
  const box = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }

  const toFlow = (e: { clientX: number; clientY: number }) => {
    const ctm = svg.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }
  const centerOn = (p: { x: number; y: number }, zoom = k) =>
    void setViewport({ x: width / 2 - p.x * zoom, y: height / 2 - p.y * zoom, zoom })

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === 'pointerdown') {
      dragging.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (!dragging.current) return
    const p = toFlow(e)
    if (p) centerOn(p)
  }
  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
    centerOn({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, zoom)
  }

  return (
    <Panel position="bottom-right" className="react-flow__minimap detail-minimap">
      <svg
        ref={svg}
        width={W}
        height={H}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="img"
        aria-label="Übersichtskarte"
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={() => (dragging.current = false)}
        onWheel={onWheel}
      >
        {items.map((it) => (
          <rect
            key={it.id}
            className={`react-flow__minimap-node ${it.area ? 'minimap-area' : `minimap-${it.cat}`}`}
            x={it.x}
            y={it.y}
            width={it.w}
            height={it.h}
            rx={it.area ? 8 : 5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          className="react-flow__minimap-mask"
          fillRule="evenodd"
          d={`M${box.x},${box.y}h${box.w}v${box.h}h${-box.w}z M${view.x},${view.y}h${view.w}v${view.h}h${-view.w}z`}
        />
      </svg>
    </Panel>
  )
}
