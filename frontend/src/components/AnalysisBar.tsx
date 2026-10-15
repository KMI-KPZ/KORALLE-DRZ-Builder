import { Panel } from '@xyflow/react'
import { X, Zap } from 'lucide-react'
import { DEPENDENCY_TYPES } from '../model/catalog'
import type { Direction } from '../model/analysis'
import { useModelStore } from '../store/useModelStore'
import { HIT_SCALE, hitColor } from './analysisColors'

const DIRECTIONS: { id: Direction; label: string; title: string }[] = [
  { id: 'downstream', label: 'Folgewirkung', title: 'Wer hängt von diesem Modul ab? (stromabwärts)' },
  { id: 'upstream', label: 'Rückstau', title: 'Welche vorgelagerten Module staut es zurück? (stromaufwärts)' },
  { id: 'both', label: 'Beides', title: 'Beide Richtungen' },
]

export function AnalysisBar() {
  const analysis = useModelStore((s) => s.analysis)
  const origin = useModelStore((s) => s.nodes.find((n) => n.id === s.analysis?.originId))
  const setOptions = useModelStore((s) => s.setAnalysisOptions)
  const stop = useModelStore((s) => s.stopAnalysis)
  if (!analysis || !origin) return null

  const groesse = origin.data.groessen.find((g) => g.id === analysis.groesseId)
  const hits = Object.values(analysis.hits)
  const byDistance = HIT_SCALE.map((s) =>
    hits.filter((h) => (s.distance === 3 ? h.distance >= 3 : h.distance === s.distance)).length,
  )

  const toggleType = (id: (typeof DEPENDENCY_TYPES)[number]['id']) => {
    const types = analysis.types.includes(id) ? analysis.types.filter((t) => t !== id) : [...analysis.types, id]
    setOptions({ types })
  }

  return (
    <Panel position="top-center" className="analysis-bar" role="region" aria-label="Störungsausbreitung">
      <Zap size={16} aria-hidden="true" />
      <div>
        <div className="analysis-bar__title">
          Störung bei {origin.data.label}
          {groesse ? `: ${groesse.name}` : ''}
        </div>
        <div className="analysis-bar__scale">
          <span>
            <strong>{hits.length}</strong> Module betroffen
          </span>
          {HIT_SCALE.map((s, i) => (
            <span key={s.distance} className="legend__item">
              <span className="dot" style={{ ['--c' as string]: hitColor(s.distance) }} />
              {s.label}: {byDistance[i]}
            </span>
          ))}
        </div>
      </div>
      <div className="segmented" role="group" aria-label="Richtung">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            title={d.title}
            aria-pressed={analysis.direction === d.id}
            onClick={() => setOptions({ direction: d.id })}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Berücksichtigte Verbindungen">
        {DEPENDENCY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={analysis.types.includes(t.id)}
            onClick={() => toggleType(t.id)}
            title={`${t.label} berücksichtigen`}
          >
            {t.shortLabel}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--small" onClick={stop}>
        <X size={14} aria-hidden="true" />
        Beenden
      </button>
    </Panel>
  )
}
