import { ArrowRight, Info } from 'lucide-react'
import type { StepParams } from '../../sim/buildProcess'
import { useSim } from '../../sim/simContext'
import { useSimStore } from '../../sim/useSimStore'
import { useModelStore } from '../../store/useModelStore'
import { TypeIcon } from '../Icon'

function setProperty(id: string, key: string, value: unknown) {
  const store = useModelStore.getState()
  const node = store.nodes.find((n) => n.id === id)
  if (!node) return
  const properties = { ...node.data.properties }
  if (value === undefined) delete properties[key]
  else properties[key] = value
  store.updateNodeData(id, { properties }, `node:${id}:${key}`)
}

function NumberCell({
  id,
  label,
  value,
  assumed,
  min,
  max,
  step,
  scale = 1,
  onChange,
}: {
  id: string
  label: string
  value: number | undefined
  assumed?: number
  min?: number
  max?: number
  step?: number
  scale?: number
  onChange: (v: number | undefined) => void
}) {
  const shown = value === undefined ? '' : Math.round(value * scale * 1000) / 1000
  return (
    <input
      id={id}
      className={`input sim-cell${value === undefined && assumed !== undefined ? ' is-assumed' : ''}${value === undefined && assumed === undefined ? ' is-missing' : ''}`}
      type="number"
      inputMode="decimal"
      aria-label={label}
      title={value === undefined && assumed !== undefined ? `${label}: fehlt im Modell, Annahme ${assumed * scale}` : label}
      min={min}
      max={max}
      step={step ?? 'any'}
      value={shown}
      placeholder={assumed !== undefined ? String(Math.round(assumed * scale * 1000) / 1000) : '?'}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange(undefined)
        const n = Number(raw) / scale
        if (Number.isFinite(n)) onChange(n)
      }}
    />
  )
}

function StepRow({ step, selected }: { step: StepParams; selected: boolean }) {
  const select = useModelStore((s) => s.select)
  const props = useModelStore((s) => s.nodes.find((n) => n.id === step.moduleId)?.data.properties)
  const isBuffer = step.typeId === 'lager'
  const modelTime = typeof props?.simZeit === 'number' ? props.simZeit : undefined
  const modelCap = typeof props?.simKapazitaet === 'number' ? props.simKapazitaet : undefined
  const modelFail = typeof props?.simAusfall === 'number' ? props.simAusfall : undefined
  const idp = `sim-${step.moduleId}`

  return (
    <tr className={selected ? 'is-selected' : undefined}>
      <th scope="row">
        <button type="button" className="sim-step" onClick={() => select({ nodeId: step.moduleId })} title="Auf der Canvas auswählen">
          <TypeIcon typeId={step.typeId} size="small" />
          <span>{step.label}</span>
        </button>
      </th>
      <td>
        <NumberCell
          id={`${idp}-time`}
          label={`Bearbeitungszeit ${step.label} (s)`}
          value={modelTime}
          assumed={modelTime === undefined ? step.time.value : undefined}
          min={0}
          onChange={(v) => setProperty(step.moduleId, 'simZeit', v)}
        />
      </td>
      <td>
        <NumberCell
          id={`${idp}-cap`}
          label={`Kapazität ${step.label}${isBuffer ? ' (Plätze)' : ''}`}
          value={modelCap}
          assumed={modelCap === undefined ? step.capacity.value : undefined}
          min={1}
          step={1}
          onChange={(v) => setProperty(step.moduleId, 'simKapazitaet', v === undefined ? undefined : Math.max(1, Math.round(v)))}
        />
      </td>
      <td>
        <NumberCell
          id={`${idp}-fail`}
          label={`Ausfall- / Nacharbeitswahrscheinlichkeit ${step.label} (%)`}
          value={modelFail}
          assumed={modelFail === undefined ? 0 : undefined}
          min={0}
          max={99}
          scale={100}
          onChange={(v) => setProperty(step.moduleId, 'simAusfall', v === undefined ? undefined : Math.min(0.99, Math.max(0, v)))}
        />
      </td>
      <td>
        <div className="sim-gw">
          {step.outgoing > 1 && (
            <select
              className="select sim-cell"
              aria-label={`Verzweigung nach ${step.label}`}
              title="Verzweigung: UND = alle Folgeschritte, XOD = einer"
              value={step.split === 'OR' ? 'XOR' : step.split}
              onChange={(e) => setProperty(step.moduleId, 'simVerzweigung', e.target.value)}
            >
              <option value="AND">↦ UND</option>
              <option value="XOR">↦ XOD</option>
            </select>
          )}
          {step.incoming > 1 && (
            <select
              className="select sim-cell"
              aria-label={`Zusammenführung vor ${step.label}`}
              title="Zusammenführung: UND = auf alle Zuflüsse warten, XOD = jede Ankunft"
              value={step.join}
              onChange={(e) => setProperty(step.moduleId, 'simZusammenfuehrung', e.target.value)}
            >
              <option value="AND">↤ UND</option>
              <option value="XOR">↤ XOD</option>
            </select>
          )}
          {step.outgoing <= 1 && step.incoming <= 1 && <span className="sim-muted">–</span>}
        </div>
      </td>
    </tr>
  )
}

export function ChainSection() {
  const { build } = useSim()
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const selectedId = useModelStore((s) => s.nodes.find((n) => n.selected)?.id)
  const label = (id: string) => build.candidates.find((c) => c.id === id)?.label ?? id

  return (
    <section className="inspector__section" aria-labelledby="sim-chain-title">
      <div className="inspector__section-head">
        <h3 className="section-title" id="sim-chain-title">
          Prozesskette
        </h3>
        <span className="note">
          {build.steps.length} Schritte · {build.flows.length} Materialflüsse
        </span>
      </div>

      {build.candidates.length === 0 ? (
        <div className="callout">
          <Info size={14} aria-hidden="true" />
          <span>
            Keine Prozessschritte mit Materialfluss.
          </span>
        </div>
      ) : (
        <>
          <div className="sim-range">
            <label className="field">
              <span className="field__label">Start</span>
              <select
                className="select"
                value={config.startId ?? ''}
                onChange={(e) => setConfig({ startId: e.target.value || null })}
              >
                <option value="">Automatisch ({build.entry.map(label).join(', ') || '–'})</option>
                {build.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <ArrowRight size={14} aria-hidden="true" className="sim-range__arrow" />
            <label className="field">
              <span className="field__label">Ende</span>
              <select className="select" value={config.endId ?? ''} onChange={(e) => setConfig({ endId: e.target.value || null })}>
                <option value="">Automatisch ({build.exit.map(label).join(', ') || '–'})</option>
                {build.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {build.steps.length > 0 && (
            <div className="sim-table-wrap">
              <table className="sim-table sim-table--params">
                <thead>
                  <tr>
                    <th scope="col">Schritt</th>
                    <th scope="col" title="Bearbeitungszeit in Sekunden">
                      Zeit s
                    </th>
                    <th scope="col" title="Kapazität: Teile gleichzeitig">
                      Kap.
                    </th>
                    <th scope="col" title="Ausfall- / Nacharbeitswahrscheinlichkeit in Prozent">
                      Ausf. %
                    </th>
                    <th scope="col" title="Verzweigung und Zusammenführung">
                      Gateway
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {build.steps.map((s) => (
                    <StepRow key={s.moduleId} step={s} selected={s.moduleId === selectedId} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <label className="check-row" htmlFor="sim-assume">
            <input
              id="sim-assume"
              type="checkbox"
              checked={config.useAssumptions}
              onChange={(e) => setConfig({ useAssumptions: e.target.checked })}
            />
            <span>
              Fehlende Werte annehmen ({config.assumptions.time} s, Kap. {config.assumptions.capacity}, Puffer{' '}
              {config.assumptions.bufferCapacity})
            </span>
          </label>
          {build.missingCount > 0 && (
            <p className="note">
              {build.missingCount} von {build.steps.length} Schritten ohne Werte.
              {config.useAssumptions ? '' : ' Ohne Annahmen kein Lauf möglich.'}
            </p>
          )}
          {build.warnings.map((w) => (
            <p key={w} className="note">
              {w}
            </p>
          ))}
        </>
      )}
    </section>
  )
}
