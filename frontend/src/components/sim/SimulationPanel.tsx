import { LoaderCircle, Play, RefreshCw, Unplug, X } from 'lucide-react'
import { useEffect } from 'react'
import { useSim } from '../../sim/simContext'
import { useSimStore } from '../../sim/useSimStore'
import { useModelStore } from '../../store/useModelStore'
import { useUiStore } from '../../store/useUiStore'
import { ChainSection } from './ChainSection'
import { ResultsSection } from './ResultsSection'
import { ScenarioSection, SettingsSection } from './ScenarioSection'

function EngineStatus() {
  const engine = useSimStore((s) => s.engine)
  const check = useSimStore((s) => s.checkEngine)

  if (engine.status === 'online') {
    return (
      <span className="sim-status sim-status--online" title={engine.info.engine.model}>
        <span className="dot" style={{ ['--c' as string]: 'var(--status-good)' }} />
        {engine.info.engine.name} {engine.info.engine.version}
        {engine.info.server === 'devserver' ? ' · Dev-Server' : ''}
      </span>
    )
  }
  if (engine.status === 'offline') {
    return (
      <button type="button" className="btn btn--small" onClick={() => void check()} title={engine.message}>
        <RefreshCw size={13} aria-hidden="true" />
        Erneut prüfen
      </button>
    )
  }
  return (
    <span className="sim-status">
      <LoaderCircle size={13} className="spin" aria-hidden="true" />
      verbinde …
    </span>
  )
}

function OfflineHint() {
  const engine = useSimStore((s) => s.engine)
  if (engine.status !== 'offline') return null
  return (
    <div className="callout callout--warning" role="status">
      <Unplug size={14} aria-hidden="true" />
      <div>
        <strong>Simulationsdienst nicht erreichbar.</strong>{' '}
        {engine.message.startsWith('Simulationsdienst nicht erreichbar') ? '' : `${engine.message} `}Start mit <code>docker compose up</code>.
      </div>
    </div>
  )
}

function RunBar() {
  const { build } = useSim()
  const engine = useSimStore((s) => s.engine)
  const running = useSimStore((s) => s.running)
  const runError = useSimStore((s) => s.runError)
  const scenarios = useSimStore((s) => s.config.scenarios.length)
  const run = useSimStore((s) => s.run)
  const org = useModelStore((s) => s.organization)
  const schemaVersion = useModelStore((s) => s.schemaVersion)

  const blocked = !build.process
  const offline = engine.status !== 'online'
  const assumed = build.steps.filter((s) => s.time.assumed || s.capacity.assumed).map((s) => s.moduleId)
  const reason = build.steps.length === 0 ? 'Keine Prozesskette' : blocked ? 'Werte fehlen (Annahmen ausgeschaltet)' : offline ? 'Dienst nicht verbunden' : ''

  return (
    <div className="sim-run">
      <button
        type="button"
        className="btn btn--primary sim-run__button"
        disabled={blocked || offline || running}
        onClick={() => build.process && void run(org.id, schemaVersion, build.process, assumed, `${org.name}: ${build.steps.length} Schritte`)}
        title={reason || 'Simulation starten'}
      >
        {running ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        {running ? 'Simuliere …' : `Simulieren${scenarios > 0 ? ` (Basis + ${scenarios})` : ''}`}
      </button>
      {reason && !running && <span className="note">{reason}</span>}
      {runError && (
        <div className="callout callout--error" role="alert">
          <div>
            <strong>{runError.message}</strong>
            {runError.details.length > 0 && (
              <ul>
                {runError.details.slice(0, 6).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SimulationPanel() {
  const engine = useSimStore((s) => s.engine.status)
  const check = useSimStore((s) => s.checkEngine)
  const open = useUiStore((s) => s.inspectorOpen)
  const setOpen = useUiStore((s) => s.setInspectorOpen)

  useEffect(() => {
    if (engine === 'unknown') void check()
  }, [engine, check])

  return (
    <aside className={`panel panel--right panel--sim${open ? ' is-open' : ''}`} aria-label="Simulation">
      <div className="inspector">
        <div className="inspector__head">
          <div className="inspector__type-row">
            <span className="inspector__type">Diskrete Simulation · DRZ-Modul (AP 4, #8)</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <EngineStatus />
              <button type="button" className="btn btn--icon btn--ghost panel__close" onClick={() => setOpen(false)} aria-label="Schließen">
                <X size={16} />
              </button>
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 650 }}>Was passiert, wenn …?</div>
          <OfflineHint />
        </div>
        <ChainSection />
        <SettingsSection />
        <ScenarioSection />
        <section className="inspector__section">
          <RunBar />
        </section>
        <ResultsSection />
      </div>
    </aside>
  )
}
