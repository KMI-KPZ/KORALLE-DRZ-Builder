import { ControlButton, useReactFlow, useStore, ViewportPortal } from '@xyflow/react'
import { SquareDashed, SquareDashedX } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useUiStore } from '../store/useUiStore'
import { rectFrom } from './region'

/** Button for the canvas controls: draw a section, or clear the current one. */
export function RegionButton() {
  const region = useUiStore((s) => s.region)
  const drawing = useUiStore((s) => s.regionDrawing)
  const { setRegion, setRegionDrawing } = useUiStore.getState()
  return (
    <ControlButton
      onClick={() => (region ? setRegion(null) : setRegionDrawing(!drawing))}
      title={region ? 'Ausschnitt aufheben (Esc)' : 'Ausschnitt ziehen'}
      aria-label={region ? 'Ausschnitt aufheben' : 'Ausschnitt ziehen'}
      className={region || drawing ? 'is-active' : undefined}
    >
      {region ? <SquareDashedX size={14} /> : <SquareDashed size={14} />}
    </ControlButton>
  )
}

/** Drawing overlay while the mode is on, and the outline of the current section. */
export function RegionLayer() {
  const region = useUiStore((s) => s.region)
  const drawing = useUiStore((s) => s.regionDrawing)
  const { screenToFlowPosition, fitBounds } = useReactFlow()
  const zoom = useStore((s) => s.transform[2])
  const start = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (!region && !drawing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useUiStore.getState().setRegion(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [region, drawing])

  const local = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  return (
    <>
      {region && (
        <ViewportPortal>
          <div
            className="region-outline"
            style={{
              transform: `translate(${region.x}px, ${region.y}px)`,
              width: region.w,
              height: region.h,
              borderWidth: 1.5 / zoom,
            }}
          />
        </ViewportPortal>
      )}
      {drawing && (
        <div
          className="region-overlay nodrag nopan"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            start.current = local(e)
            setDraft({ ...start.current, w: 0, h: 0 })
          }}
          onPointerMove={(e) => {
            if (start.current) setDraft(rectFrom(start.current, local(e)))
          }}
          onPointerUp={(e) => {
            const from = start.current
            start.current = null
            setDraft(null)
            if (!from) return
            const to = local(e)
            if (Math.abs(to.x - from.x) < 24 || Math.abs(to.y - from.y) < 24) return
            const a = screenToFlowPosition({ x: e.clientX - (to.x - from.x), y: e.clientY - (to.y - from.y) })
            const b = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            const rect = rectFrom(a, b)
            useUiStore.getState().setRegion(rect)
            fitBounds({ x: rect.x, y: rect.y, width: rect.w, height: rect.h }, { padding: 0.06, duration: 450 })
          }}
        >
          {draft && (
            <div className="region-draft" style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }} />
          )}
        </div>
      )}
    </>
  )
}
