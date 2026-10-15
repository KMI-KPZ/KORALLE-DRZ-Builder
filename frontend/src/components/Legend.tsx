import { Panel } from '@xyflow/react'
import { DEPENDENCY_TYPES } from '../model/catalog'
import { useModelStore } from '../store/useModelStore'

export function EdgeSwatch({ colorVar, dash, width }: { colorVar: string; dash: string; width: number }) {
  return (
    <svg className="edge-swatch" viewBox="0 0 22 8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        style={{ stroke: `var(${colorVar})`, strokeWidth: Math.min(width, 2.6), strokeDasharray: dash || undefined }}
      />
    </svg>
  )
}

export function Legend() {
  const edgeLayers = useModelStore((s) => s.edgeLayers)
  const showDrzLinks = useModelStore((s) => s.showDrzLinks)
  return (
    <Panel position="bottom-left" className="legend" aria-label="Legende der Verbindungen">
      <div className="legend__row">
        {DEPENDENCY_TYPES.filter((t) => edgeLayers[t.id]).map((t) => (
          <span key={t.id} className="legend__item">
            <EdgeSwatch colorVar={t.colorVar} dash={t.dash} width={t.width} />
            {t.label}
          </span>
        ))}
        {showDrzLinks && (
          <span className="legend__item">
            <EdgeSwatch colorVar="--edge-drz" dash="1 4" width={1.6} />
            nutzt DRZ-Modul
          </span>
        )}
      </div>
    </Panel>
  )
}

/** Floating toolbar: which dependency type a newly drawn connection gets. */
export function ConnectionToolbar() {
  const connectionType = useModelStore((s) => s.connectionType)
  const setConnectionType = useModelStore((s) => s.setConnectionType)
  return (
    <Panel position="top-left" className="canvas-toolbar">
      <span className="header__label" id="conn-label">
        Neue Verbindung als
      </span>
      <div className="segmented" role="group" aria-labelledby="conn-label">
        {DEPENDENCY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={connectionType === t.id}
            onClick={() => setConnectionType(t.id)}
            title={t.description}
          >
            <EdgeSwatch colorVar={t.colorVar} dash={t.dash} width={t.width} />
            {t.shortLabel}
          </button>
        ))}
      </div>
    </Panel>
  )
}
