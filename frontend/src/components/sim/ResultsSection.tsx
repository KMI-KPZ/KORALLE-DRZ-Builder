import { Download, FileCode2, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { simulationClient } from '../../sim/client'
import type { KpiName, ScenarioResult, Stat } from '../../sim/contract'
import { useSim } from '../../sim/simContext'
import { activeRun, useSimStore } from '../../sim/useSimStore'
import { useModelStore } from '../../store/useModelStore'
import { TypeIcon } from '../Icon'
import { fmtDuration, fmtNumber, fmtPercent, fmtTime, utilLevel } from './format'

interface KpiRow {
  key: KpiName
  label: string
  hint: string
  better: 'higher' | 'lower'
  format: (v: number) => string
  /** Sum over all parts, shown as mean per completed part. */
  perPart?: boolean
}

const KPI_ROWS: KpiRow[] = [
  {
    key: 'throughputPerHour',
    label: 'Ausbringung',
    hint: 'Teile pro Stunde zwischen dem ersten und dem letzten fertigen Teil',
    better: 'higher',
    format: (v) => `${fmtNumber(v, 1)} /h`,
  },
  { key: 'leadTime', label: 'Durchlaufzeit Ø', hint: 'Ankunft bis Ende, Mittelwert', better: 'lower', format: fmtDuration },
  { key: 'leadTimeP95', label: 'Durchlaufzeit P95', hint: '95 % der Teile sind schneller', better: 'lower', format: fmtDuration },
  { key: 'entryWait', label: '… davon vor dem Start', hint: 'Warten, bevor das Teil in den ersten Schritt kommt (je Teil)', better: 'lower', format: fmtDuration },
  {
    key: 'blockedTime',
    label: '… davon blockiert',
    hint: 'fertig, aber der Folgeschritt ist voll: Rückstau (je Teil)',
    better: 'lower',
    format: fmtDuration,
    perPart: true,
  },
  { key: 'bufferTime', label: '… davon in Puffern', hint: 'Liegezeit in Puffern und Lagern (je Teil)', better: 'lower', format: fmtDuration, perPart: true },
  { key: 'failures', label: 'Ausfälle / Nacharbeit', hint: 'wiederholte Bearbeitungen', better: 'lower', format: (v) => fmtNumber(v, 1) },
  { key: 'completed', label: 'Fertige Teile', hint: 'am Ende angekommen', better: 'higher', format: (v) => fmtNumber(v, 1) },
]

function delta(row: KpiRow, base: Stat, value: Stat): { text: string; tone: 'good' | 'bad' | 'same' } {
  const d = value.mean - base.mean
  if (Math.abs(d) <= Math.max(1e-6, Math.abs(base.mean) * 0.005)) return { text: '±0', tone: 'same' }
  const good = row.better === 'higher' ? d > 0 : d < 0
  const sign = d > 0 ? '+' : '−'
  // Relative change when there is a base value, otherwise the absolute difference.
  const text =
    Math.abs(base.mean) > 1e-9 ? `${sign}${fmtNumber((Math.abs(d) / Math.abs(base.mean)) * 100, 0)} %` : `${sign}${row.format(Math.abs(d))}`
  return { text, tone: good ? 'good' : 'bad' }
}

function perPart(s: ScenarioResult, key: KpiName): Stat {
  const n = Math.max(1, s.kpis.completed.mean)
  const v = s.kpis[key]
  return { mean: v.mean / n, std: 0, min: v.min / n, max: v.max / n, p05: v.p05 / n, p95: v.p95 / n }
}

function KpiTable({ scenarios }: { scenarios: ScenarioResult[] }) {
  const base = scenarios[0]
  return (
    <div className="sim-table-wrap">
      <table className="sim-table sim-table--kpi">
        <thead>
          <tr>
            <th scope="col">Kennzahl</th>
            {scenarios.map((s) => (
              <th key={s.id} scope="col" title={s.label}>
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KPI_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" title={row.hint}>
                {row.label}
              </th>
              {scenarios.map((s, i) => {
                const stat = row.perPart ? perPart(s, row.key) : s.kpis[row.key]
                const baseStat = row.perPart ? perPart(base, row.key) : base.kpis[row.key]
                const d = i > 0 ? delta(row, baseStat, stat) : null
                const spread = !row.perPart && s.replications > 1 && stat.std > 0 ? `±${row.format(stat.std).replace(/ \/h$/, '')}` : ''
                return (
                  <td key={s.id}>
                    <span className="sim-kpi__value">{row.format(stat.mean)}</span>
                    {d && <span className={`sim-delta sim-delta--${d.tone}`}>{d.text}</span>}
                    {spread && <span className="sim-kpi__spread" title="Standardabweichung über die Wiederholungen">{spread}</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StepTable({ scenario, isBase }: { scenario: ScenarioResult; isBase: boolean }) {
  const { build, baseTaskById, bottleneckId } = useSim()
  const select = useModelStore((s) => s.select)
  const selectedId = useModelStore((s) => s.nodes.find((n) => n.selected)?.id)
  const byModule = new Map(scenario.tasks.map((t) => [t.moduleId ?? t.id, t]))

  return (
    <div className="sim-table-wrap">
      <table className="sim-table sim-table--steps">
        <colgroup>
          <col />
          <col className="sim-col-util" />
          <col className="sim-col-short" />
          <col className="sim-col-wait" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Schritt</th>
            <th scope="col" title="Anteil der Zeit, in der die Plätze bearbeiten">
              Auslastung
            </th>
            <th scope="col" title="Anteil der Zeit, in der fertige Teile auf den Folgeschritt warten">
              blockiert
            </th>
            <th scope="col" title={isBase ? 'Wartezeit je Teil in diesem Schritt (blockiert oder im Puffer)' : 'Wartezeit je Teil gegenüber Basis'}>
              {isBase ? 'Warten Ø' : 'Δ Warten Ø'}
            </th>
          </tr>
        </thead>
        <tbody>
          {build.steps.map((step) => {
            const t = byModule.get(step.moduleId)
            if (!t) return null
            const base = baseTaskById.get(step.moduleId)
            const isBuffer = step.typeId === 'lager' && step.time.value === 0
            const wait = (r: typeof t) => (r.blockedTime + r.bufferedTime) / Math.max(1, r.processed)
            const own = wait(t)
            const diff = base ? own - wait(base) : 0
            return (
              <tr key={step.moduleId} className={step.moduleId === selectedId ? 'is-selected' : undefined}>
                <th scope="row">
                  <button type="button" className="sim-step" onClick={() => select({ nodeId: step.moduleId })}>
                    <TypeIcon typeId={step.typeId} size="small" />
                    <span>{step.label}</span>
                    {step.moduleId === bottleneckId && <span className="chip chip--bottleneck">Engpass</span>}
                  </button>
                </th>
                <td>
                  {isBuffer ? (
                    <span className="sim-util" title={`Puffer: im Mittel ${fmtNumber(t.avgOccupied, 1)}, höchstens ${t.maxOccupied} von ${t.capacity} Plätzen belegt`}>
                      <span className="sim-util__track" aria-hidden="true">
                        <span className="sim-util__fill" data-level="buffer" style={{ width: `${Math.min(100, (t.avgOccupied / Math.max(1, t.capacity)) * 100)}%` }} />
                      </span>
                      Ø {fmtNumber(t.avgOccupied, 1)}/{t.capacity}
                    </span>
                  ) : (
                    <span className="sim-util" title={`${fmtNumber(t.processed, 1)} Teile bearbeitet, ${fmtNumber(t.failures, 1)} Wiederholungen`}>
                      <span className="sim-util__track" aria-hidden="true">
                        <span className="sim-util__fill" style={{ width: `${Math.min(100, t.utilization * 100)}%` }} data-level={utilLevel(t.utilization)} />
                      </span>
                      {fmtPercent(t.utilization)}
                    </span>
                  )}
                </td>
                <td>{t.blockedShare > 0 ? fmtPercent(t.blockedShare) : '–'}</td>
                <td>
                  {isBase ? (
                    own >= 0.5 ? (
                      fmtDuration(own)
                    ) : (
                      '–'
                    )
                  ) : Math.abs(diff) < 0.5 ? (
                    '±0'
                  ) : (
                    <span className={`sim-delta sim-delta--${diff > 0 ? 'bad' : 'good'}`}>
                      {diff > 0 ? '+' : ''}
                      {fmtDuration(diff)}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ResultsSection() {
  const { scenario } = useSim()
  const entry = useSimStore((s) => activeRun(s))
  const runs = useSimStore((s) => s.runs)
  const setActiveRun = useSimStore((s) => s.setActiveRun)
  const setActiveScenario = useSimStore((s) => s.setActiveScenario)
  const orgId = useModelStore((s) => s.organization.id)
  const orgName = useModelStore((s) => s.organization.name)
  const focusNode = useModelStore((s) => s.select)
  const notify = useModelStore((s) => s.notify)
  const [exporting, setExporting] = useState(false)

  const result = entry?.run.result
  if (!entry || !result || !scenario) return null
  const isBase = scenario.id === result.scenarios[0]?.id
  const warnings = [...result.warnings, ...scenario.warnings]

  const exportBpmn = async () => {
    setExporting(true)
    try {
      const blob = await simulationClient.exportBpmn(orgId, entry.request.process, `${orgName} Prozesskette`)
      download(blob, `${orgId}-prozesskette.bpmn`)
    } catch (err) {
      notify(`BPMN-Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="inspector__section" aria-labelledby="sim-results-title">
      <div className="inspector__section-head">
        <h3 className="section-title" id="sim-results-title">
          Ergebnis
        </h3>
        {runs.length > 1 ? (
          <select className="select sim-run-select" aria-label="Lauf" value={entry.run.id} onChange={(e) => setActiveRun(e.target.value)}>
            {runs.map((r) => (
              <option key={r.run.id} value={r.run.id}>
                Lauf {fmtTime(r.run.finishedAt)} · {r.run.result?.scenarios.length ?? 0} Szen.
              </option>
            ))}
          </select>
        ) : (
          <span className="note">
            {fmtTime(entry.run.finishedAt)} · {fmtNumber(result.durationMs / 1000, 1)} s Rechenzeit
          </span>
        )}
      </div>
      {entry.assumed.length > 0 && (
        <p className="note">{entry.assumed.length} Schritte mit Annahmen.</p>
      )}

      <KpiTable scenarios={result.scenarios} />

      {result.scenarios.length > 1 && (
        <div className="segmented sim-scenario-switch" role="group" aria-label="Szenario auf der Canvas">
          {result.scenarios.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === scenario.id} onClick={() => setActiveScenario(s.id)} title={s.label}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {scenario.notes?.map((n) => (
        <p key={n} className="note">
          {n}
        </p>
      ))}
      {scenario.bottlenecks.length > 0 && (
        <div className="sim-bottlenecks">
          <span className="field__label">Engpässe · {scenario.label}</span>
          <ol>
            {scenario.bottlenecks.slice(0, 3).map((b) => {
              const label = scenario.tasks.find((t) => t.id === b.task)?.label ?? b.task
              return (
                <li key={b.task}>
                  <button type="button" className="sim-link" onClick={() => focusNode({ nodeId: b.moduleId ?? b.task })}>
                    {label}
                  </button>
                  <span className="note"> {b.reason}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <StepTable scenario={scenario} isBase={isBase} />

      {warnings.map((w) => (
        <div key={w} className="callout callout--warning">
          <TriangleAlert size={14} aria-hidden="true" />
          <span>{w}</span>
        </div>
      ))}

      <div className="sim-actions">
        <button type="button" className="btn btn--small" onClick={() => void exportBpmn()} disabled={exporting} title="BPMN im Format von KORALLE-bpmn-graph-sim">
          <FileCode2 size={13} aria-hidden="true" />
          BPMN exportieren
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={() =>
            download(new Blob([JSON.stringify({ request: entry.request, run: entry.run }, null, 2)], { type: 'application/json' }), `${orgId}-simulation-${entry.run.id.slice(0, 8)}.json`)
          }
        >
          <Download size={13} aria-hidden="true" />
          Ergebnis (JSON)
        </button>
      </div>
      <p className="note">
        {result.engine.name} {result.engine.version} · {result.contract} · {result.settings.replications} Wiederholungen × {result.settings.parts} Teile
      </p>
    </section>
  )
}
