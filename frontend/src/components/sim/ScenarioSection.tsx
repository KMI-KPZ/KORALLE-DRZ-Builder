import { Plus, Trash2, X } from 'lucide-react'
import { useSim } from '../../sim/simContext'
import { CHANGE_LABELS, useSimStore, type ChangeDraft, type ChangeKind, type ScenarioDraft } from '../../sim/useSimStore'

function NumberField({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string
  label: string
  unit?: string
  value: number | undefined
  min?: number
  max?: number
  step?: number
  onChange: (v: number | undefined) => void
}) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">
        <span>{label}</span>
        {unit && <span>{unit}</span>}
      </span>
      <input
        id={id}
        className="input"
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 'any'}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(undefined)
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}

export function SettingsSection() {
  const config = useSimStore((s) => s.config)
  const setConfig = useSimStore((s) => s.setConfig)
  const hours = (config.parts * config.interarrival) / 3600

  return (
    <section className="inspector__section" aria-labelledby="sim-settings-title">
      <h3 className="section-title" id="sim-settings-title">
        Lauf
      </h3>
      <div className="sim-grid">
        <NumberField id="sim-parts" label="Teile" value={config.parts} min={1} step={1} onChange={(v) => setConfig({ parts: Math.max(1, Math.round(v ?? 1)) })} />
        <NumberField
          id="sim-interarrival"
          label="Ankunftsabstand"
          unit="s"
          value={config.interarrival}
          min={1}
          onChange={(v) => setConfig({ interarrival: Math.max(0.001, v ?? 90) })}
        />
        <label className="field" htmlFor="sim-arrival">
          <span className="field__label">Ankünfte</span>
          <select
            id="sim-arrival"
            className="select"
            value={config.arrival}
            onChange={(e) => setConfig({ arrival: e.target.value as 'fixed' | 'exponential' })}
          >
            <option value="fixed">im festen Takt</option>
            <option value="exponential">zufällig (Poisson)</option>
          </select>
        </label>
        <NumberField
          id="sim-reps"
          label="Wiederholungen"
          value={config.replications}
          min={1}
          max={200}
          step={1}
          onChange={(v) => setConfig({ replications: Math.min(200, Math.max(1, Math.round(v ?? 1))) })}
        />
      </div>
      <p className="note">
        ≈ {hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`} Zulauf
      </p>
    </section>
  )
}

const KINDS: ChangeKind[] = ['downtime', 'time', 'capacity', 'failChance']

function ChangeRow({ scenario, change }: { scenario: ScenarioDraft; change: ChangeDraft }) {
  const { build } = useSim()
  const update = useSimStore((s) => s.updateChange)
  const remove = useSimStore((s) => s.removeChange)
  const set = (patch: Partial<ChangeDraft>) => update(scenario.id, change.id, patch)
  const idp = `chg-${change.id}`
  const inChain = build.stepIds.has(change.moduleId)
  const step = build.steps.find((s) => s.moduleId === change.moduleId)

  return (
    <div className={`sim-change${inChain ? '' : ' is-invalid'}`}>
      <div className="sim-change__head">
        <select
          className="select"
          aria-label="Prozessschritt"
          value={change.moduleId}
          onChange={(e) => set({ moduleId: e.target.value })}
        >
          {!inChain && <option value={change.moduleId}>(nicht in der Kette)</option>}
          {build.steps.map((s) => (
            <option key={s.moduleId} value={s.moduleId}>
              {s.label}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Art der Änderung" value={change.kind} onChange={(e) => set({ kind: e.target.value as ChangeKind })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {CHANGE_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--icon btn--small btn--ghost" onClick={() => remove(scenario.id, change.id)} aria-label="Änderung entfernen">
          <X size={14} />
        </button>
      </div>
      <div className="sim-grid">
        {change.kind === 'downtime' && (
          <>
            <NumberField id={`${idp}-start`} label="ab" unit="min" value={change.start} min={0} onChange={(v) => set({ start: v })} />
            <NumberField id={`${idp}-dur`} label="für" unit="min" value={change.duration} min={0} onChange={(v) => set({ duration: v })} />
          </>
        )}
        {change.kind === 'time' && (
          <NumberField id={`${idp}-time`} label={`Zeit (bisher ${step?.time.value ?? '–'} s)`} unit="s" value={change.value} min={0} onChange={(v) => set({ value: v })} />
        )}
        {change.kind === 'capacity' && (
          <NumberField
            id={`${idp}-cap`}
            label={`Kapazität (bisher ${step?.capacity.value ?? '–'})`}
            value={change.value}
            min={1}
            step={1}
            onChange={(v) => set({ value: v })}
          />
        )}
        {change.kind === 'failChance' && (
          <NumberField
            id={`${idp}-fail`}
            label={`Ausfallrate (bisher ${Math.round((step?.failChance ?? 0) * 100)} %)`}
            unit="%"
            value={change.value}
            min={0}
            max={99}
            onChange={(v) => set({ value: v })}
          />
        )}
      </div>
    </div>
  )
}

export function ScenarioSection() {
  const { build, bottleneckId } = useSim()
  const scenarios = useSimStore((s) => s.config.scenarios)
  const addScenario = useSimStore((s) => s.addScenario)
  const updateScenario = useSimStore((s) => s.updateScenario)
  const removeScenario = useSimStore((s) => s.removeScenario)
  const addChange = useSimStore((s) => s.addChange)
  const max = 11

  // A disturbance in the middle of the chain shows back-pressure upstream and starvation downstream.
  const defaultModule = () =>
    (bottleneckId && build.stepIds.has(bottleneckId) && build.entry[0] !== bottleneckId ? bottleneckId : undefined) ??
    build.steps.filter((s) => s.typeId !== 'lager')[Math.floor(build.steps.filter((s) => s.typeId !== 'lager').length / 2)]?.moduleId ??
    build.steps[0]?.moduleId ??
    ''

  const add = () => {
    const id = addScenario()
    const moduleId = defaultModule()
    const label = build.steps.find((s) => s.moduleId === moduleId)?.label
    if (moduleId) {
      addChange(id, { moduleId, kind: 'downtime', start: 60, duration: 15 })
      updateScenario(id, { label: `Stillstand ${label ?? ''} 15 min`.trim() })
    }
  }

  return (
    <section className="inspector__section" aria-labelledby="sim-scen-title">
      <div className="inspector__section-head">
        <h3 className="section-title" id="sim-scen-title">
          Szenarien
        </h3>
        <button type="button" className="btn btn--small" onClick={add} disabled={build.steps.length === 0 || scenarios.length >= max}>
          <Plus size={13} aria-hidden="true" />
          Störung einwerfen
        </button>
      </div>
      {scenarios.map((sc) => (
        <div key={sc.id} className="sim-scenario">
          <div className="sim-scenario__head">
            <input
              className="input input--bare sim-scenario__name"
              aria-label="Name des Szenarios"
              value={sc.label}
              onChange={(e) => updateScenario(sc.id, { label: e.target.value })}
            />
            <button type="button" className="btn btn--icon btn--small btn--ghost btn--danger" onClick={() => removeScenario(sc.id)} aria-label={`${sc.label} löschen`}>
              <Trash2 size={13} />
            </button>
          </div>
          {sc.changes.map((c) => (
            <ChangeRow key={c.id} scenario={sc} change={c} />
          ))}
          <button
            type="button"
            className="btn btn--small btn--ghost sim-scenario__add"
            onClick={() => addChange(sc.id, { moduleId: defaultModule(), kind: 'capacity', value: 2 })}
            disabled={build.steps.length === 0}
          >
            <Plus size={13} aria-hidden="true" />
            Änderung
          </button>
        </div>
      ))}
    </section>
  )
}
