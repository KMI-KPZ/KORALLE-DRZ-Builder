import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Boxes, Zap } from 'lucide-react'
import { memo, type CSSProperties } from 'react'
import { findModuleType } from '../../model/catalog'
import { findDrzKind } from '../../model/drzCatalog'
import { eraBand } from '../../model/era'
import type { ModuleFlowNode } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { hitColor, hitInk } from '../analysisColors'
import { useDerived } from '../derivedContext'
import { TypeIcon } from '../Icon'
import { useSim } from '../../sim/simContext'
import { fmtPercent, utilLevel } from '../sim/format'

function ModuleNodeView({ id, data, selected }: NodeProps<ModuleFlowNode>) {
  const type = findModuleType(data.typeId)
  const analysis = useModelStore((s) => s.analysis)
  const simView = useModelStore((s) => s.view === 'simulation')
  const { drzSummary, drzUsage } = useDerived()
  const sim = useSim()
  const inChain = simView && sim.build.stepIds.has(id)

  const hit = analysis?.hits[id]
  const isOrigin = analysis?.originId === id
  const dimmed = simView ? !inChain : analysis !== null && !hit && !isOrigin
  const isDrz = data.typeId === 'drz'
  const isStation = data.typeId === 'station'
  const stoerCount = data.groessen.filter((g) => g.kind === 'stoer').length
  const drz = drzSummary.get(id)
  const kind = isDrz ? findDrzKind(data.properties.drzKind) : undefined
  const usage = drzUsage.get(id) ?? 0

  const cls = [
    'module-node',
    isDrz && 'module-node--drz',
    isStation && 'module-node--station',
    selected && 'is-selected',
    dimmed && 'is-dimmed',
    isOrigin && 'is-origin',
    hit && 'is-hit',
  ]
    .filter(Boolean)
    .join(' ')
  const style = hit ? ({ '--hit': hitColor(hit.distance) } as CSSProperties) : undefined

  return (
    <div className={cls} style={style}>
      {/* Invisible default handles: edges are drawn as floating edges between node borders. */}
      <Handle type="target" position={Position.Top} className="handle-center" isConnectable={false} />
      <Handle type="source" position={Position.Top} className="handle-center" isConnectable={false} />
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="l" />

      {isOrigin && <span className="hit-badge hit-badge--origin">Ursprung</span>}
      {hit && (
        <span
          className="hit-badge"
          style={{ background: hitColor(hit.distance), color: hitInk(hit.distance) }}
          title={`Erreicht nach ${hit.distance} Schritt${hit.distance === 1 ? '' : 'en'}`}
        >
          {hit.distance}
        </span>
      )}

      {isStation ? (
        <StationBody data={data} />
      ) : (
        <>
          <TypeIcon typeId={data.typeId} />
          <div className="module-node__type">{isDrz ? (kind?.label ?? type?.label) : type?.label}</div>
          <div className="module-node__label">{data.label}</div>
        </>
      )}
      <div className="module-node__meta">
        {stoerCount > 0 && (
          <span className="chip" title={`${stoerCount} Störgrößen`}>
            <Zap size={11} aria-hidden="true" />
            {stoerCount}
          </span>
        )}
        {drz && (
          <span className="chip chip--drz" title={`${drz.ready} von ${drz.total} DRZ-Modulen haben alle Eingaben`}>
            <Boxes size={11} aria-hidden="true" />
            {drz.ready}/{drz.total}
          </span>
        )}
        {isDrz && (
          <span className="chip chip--drz" title="Anzahl Organisationsmodule, die dieses DRZ-Modul nutzen">
            {usage} {usage === 1 ? 'Modul' : 'Module'}
          </span>
        )}
        {isDrz && typeof data.properties.status === 'string' && <span className="chip">{data.properties.status}</span>}
        {data.properties.gewichtung === 'hoch' && <span className="chip">hoch gewichtet</span>}
      </div>
      {inChain && <SimOverlay id={id} />}
    </div>
  )
}

/** Utilization and back-pressure of a step in the simulation view, or its parameters before a run. */
function SimOverlay({ id }: { id: string }) {
  const sim = useSim()
  const t = sim.taskById.get(id)
  const step = sim.build.steps.find((s) => s.moduleId === id)
  if (!t) {
    if (!step) return null
    const assumed = step.time.assumed || step.capacity.assumed
    return (
      <div className="sim-node">
        <span className={`chip${assumed ? ' chip--assumed' : ''}`} title={assumed ? 'enthält angenommene Werte' : 'Werte aus dem Modell'}>
          {step.time.value ?? '?'} s · {step.capacity.value ?? '?'}×{step.failChance > 0 ? ` · ${Math.round(step.failChance * 100)} % Ausfall` : ''}
        </span>
      </div>
    )
  }
  const isBuffer = step?.typeId === 'lager' && step.time.value === 0
  const level = isBuffer ? 'buffer' : utilLevel(t.utilization)
  const fill = isBuffer ? t.avgOccupied / Math.max(1, t.capacity) : t.utilization
  return (
    <div className="sim-node">
      <span className="sim-node__bar" aria-hidden="true">
        <span className="sim-util__fill" data-level={level} style={{ width: `${Math.min(100, fill * 100)}%` }} />
      </span>
      {isBuffer ? (
        <span className="sim-node__text" title={`Puffer: im Mittel ${t.avgOccupied.toFixed(1)}, höchstens ${t.maxOccupied} von ${t.capacity} Plätzen belegt`}>
          Ø {t.avgOccupied.toLocaleString('de-DE', { maximumFractionDigits: 1 })}/{t.capacity}
        </span>
      ) : (
        <span className="sim-node__text" title="Auslastung: Anteil der Zeit, in der die Plätze bearbeiten">
          {fmtPercent(t.utilization)}
        </span>
      )}
      {sim.bottleneckId === id && <span className="chip chip--bottleneck">Engpass</span>}
      {t.blockedShare >= 0.02 && (
        <span className="chip chip--blocked" title="Anteil der Zeit, in der fertige Teile auf den Folgeschritt warten">
          blockiert {fmtPercent(t.blockedShare)}
        </span>
      )}
      {t.downtime > 0 && <span className="chip">Stillstand</span>}
    </div>
  )
}

const ERA_COLORS = ['', '--status-good', '--status-warning', '--status-serious', '--status-critical']

/** Compact body for workplaces: number, name and ERA points. */
function StationBody({ data }: { data: ModuleFlowNode['data'] }) {
  const lnr = typeof data.properties.lnr === 'string' ? data.properties.lnr : ''
  const era = typeof data.properties.eraPunkte === 'number' ? data.properties.eraPunkte : undefined
  const band = era !== undefined ? eraBand(era) : undefined
  return (
    <>
      <span className="station__lnr" title="Laufende Nummer im Layout">
        {lnr || '–'}
      </span>
      <div className="station__label" title={data.label}>
        {data.label}
      </div>
      {band && era !== undefined && (
        <span className="station__era" title={`ERA ${data.properties.eraMittelwert ? 'Ø ' : ''}${era} Punkte: Risiko ${band.label}`}>
          <span className="dot" style={{ ['--c' as string]: `var(${ERA_COLORS[band.level]})` }} />
          {data.properties.eraMittelwert ? 'Ø' : ''}
          {era}
        </span>
      )}
    </>
  )
}

export const ModuleNode = memo(ModuleNodeView)
