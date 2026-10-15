import { Panel } from '@xyflow/react'
import { Activity } from 'lucide-react'
import { useSim } from '../../sim/simContext'
import { activeRun, useSimStore } from '../../sim/useSimStore'

/** Canvas overlay legend and scenario switch in the simulation view. */
export function SimCanvasBar() {
  const { build, scenario } = useSim()
  const entry = useSimStore((s) => activeRun(s))
  const setActiveScenario = useSimStore((s) => s.setActiveScenario)
  const scenarios = entry?.run.result?.scenarios ?? []

  return (
    <Panel position="top-center" className="analysis-bar sim-bar" role="region" aria-label="Simulation">
      <Activity size={16} aria-hidden="true" />
      <div>
        <div className="analysis-bar__title">
          {scenario ? `Ergebnis: ${scenario.label}` : `Prozesskette: ${build.steps.length} Schritte`}
        </div>
        <div className="analysis-bar__scale">
          {scenario ? (
            <>
              <span className="legend__item">
                <span className="sim-legend-bar" data-level="low" /> Auslastung
              </span>
              <span className="legend__item">
                <span className="sim-legend-bar" data-level="high" /> ≥ 90 %
              </span>
              <span className="legend__item">
                <span className="dot" style={{ ['--c' as string]: 'var(--status-serious)' }} /> Rückstau auf dem Materialfluss
              </span>
            </>
          ) : (
            <span>Grau = Annahme</span>
          )}
        </div>
      </div>
      {scenarios.length > 1 && (
        <div className="segmented" role="group" aria-label="Szenario">
          {scenarios.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === scenario?.id} onClick={() => setActiveScenario(s.id)} title={s.label}>
              {s.label.length > 22 ? `${s.label.slice(0, 21)}…` : s.label}
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
