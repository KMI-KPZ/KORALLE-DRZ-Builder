import { CircleCheck, FileText, Trash2, TriangleAlert, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { impactOf, NEAR_STEPS } from '../../model/analysis'
import { DEPENDENCY_TYPES, getDependencyType, getModuleType, type ModuleType } from '../../model/catalog'
import { DRZ_KINDS, findDrzKind } from '../../model/drzCatalog'
import type { ModuleData } from '../../model/types'
import { graphOf, type AppNode } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { useUiStore, type InspectorTab } from '../../store/useUiStore'
import { hitColor } from '../analysisColors'
import { useDerived } from '../derivedContext'
import { TypeIcon } from '../Icon'
import { EdgeSwatch } from '../Legend'
import { PropertyForm } from './fields'
import { GroessenEditor } from './GroessenEditor'

export function NodeInspector({ node }: { node: AppNode }) {
  const type = getModuleType(node.data.typeId)
  const update = useModelStore((s) => s.updateNodeData)
  const tab = useUiStore((s) => s.inspectorTab)
  const setTab = useUiStore((s) => s.setInspectorTab)
  const derived = useDerived()
  const isDrz = node.data.typeId === 'drz'
  const isGroup = type.isGroup === true

  const tabs: { id: InspectorTab; label: string; count?: string }[] = []
  if (!isGroup && !isDrz) {
    tabs.push({ id: 'eigenschaften', label: 'Details' })
    if (type.hasGroessen) tabs.push({ id: 'groessen', label: 'Größen', count: String(node.data.groessen.length) })
    if (type.drzAssignable) {
      const s = derived.drzSummary.get(node.id)
      tabs.push({ id: 'drz', label: 'DRZ', count: s ? `${s.ready}/${s.total}` : '0' })
    }
    const connections =
      (derived.index.incoming.get(node.id)?.length ?? 0) + (derived.index.outgoing.get(node.id)?.length ?? 0)
    tabs.push({ id: 'verbindungen', label: 'Verbindungen', count: String(connections) })
  }
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'eigenschaften'

  return (
    <div className="inspector" key={node.id}>
      <InspectorHead node={node} type={type} onRename={(label) => update(node.id, { label }, `label:${node.id}`)} />
      <AnalysisResult nodeId={node.id} />
      {tabs.length > 0 && (
        <div className="tabs" role="tablist" aria-label="Bereiche des Moduls" style={{ top: 0 }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.count !== undefined && <span className="count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
      {isDrz ? (
        <DrzModuleDetails node={node} />
      ) : isGroup ? (
        <GroupDetails node={node} type={type} />
      ) : (
        <>
          {activeTab === 'eigenschaften' && <GeneralDetails node={node} type={type} />}
          {activeTab === 'groessen' && <GroessenEditor nodeId={node.id} groessen={node.data.groessen} />}
          {activeTab === 'drz' && <DrzAssignments node={node} />}
          {activeTab === 'verbindungen' && <Connections nodeId={node.id} />}
        </>
      )}
    </div>
  )
}

function InspectorHead({ node, type, onRename }: { node: AppNode; type: ModuleType; onRename: (label: string) => void }) {
  const [confirming, setConfirming] = useState(false)
  const deleteNodes = useModelStore((s) => s.deleteNodes)
  const startAnalysis = useModelStore((s) => s.startAnalysis)
  const childCount = useModelStore((s) => s.nodes.filter((n) => n.parentId === node.id).length)
  const isDrz = node.data.typeId === 'drz'
  const kind = isDrz ? findDrzKind(node.data.properties.drzKind) : undefined

  return (
    <div className="inspector__head">
      <div className="inspector__type-row">
        <span className="inspector__type">
          <TypeIcon typeId={node.data.typeId} size="small" />
          {kind ? `DRZ-Modul · ${kind.label}` : type.label}
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          {!type.isGroup && !isDrz && (
            <button type="button" className="btn btn--small" onClick={() => startAnalysis(node.id)} title="Zeigt, welche Module eine Störung hier erreicht">
              <Zap size={13} aria-hidden="true" />
              Störung simulieren
            </button>
          )}
          <button
            type="button"
            className="btn btn--icon btn--small btn--danger"
            onClick={() => setConfirming(true)}
            aria-label="Baustein löschen"
            title="Löschen"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      <label className="sr-only" htmlFor={`node-label-${node.id}`}>
        Name
      </label>
      <input
        id={`node-label-${node.id}`}
        className="input input--bare input--title"
        value={node.data.label}
        onChange={(e) => onRename(e.target.value)}
      />
      {node.data.source && (
        <span className="provenance" title="Herkunft der Angaben">
          <FileText size={12} aria-hidden="true" />
          Quelle: {node.data.source}
        </span>
      )}
      {confirming && (
        <div className="confirm" role="alert">
          <span style={{ flex: '1 1 160px' }}>
            {childCount > 0
              ? `„${node.data.label}“ und ${childCount} enthaltene Bausteine löschen?`
              : `„${node.data.label}“ mit allen Verbindungen löschen?`}
          </span>
          <button type="button" className="btn btn--small" onClick={() => setConfirming(false)}>
            Abbrechen
          </button>
          <button type="button" className="btn btn--small btn--primary" onClick={() => deleteNodes([node.id])}>
            Löschen
          </button>
        </div>
      )}
    </div>
  )
}

function AnalysisResult({ nodeId }: { nodeId: string }) {
  const analysis = useModelStore((s) => s.analysis)
  const nodes = useModelStore((s) => s.nodes)
  const focusNode = useModelStore((s) => s.focusNode)
  if (!analysis || analysis.originId !== nodeId) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows = Object.entries(analysis.hits)
    .map(([id, hit]) => ({ id, hit, node: byId.get(id) }))
    .filter((r) => r.node)
    .sort((a, b) => a.hit.distance - b.hit.distance || b.hit.maxCriticality - a.hit.maxCriticality)
  return (
    <section className="inspector__section" aria-label="Betroffene Module">
      <h3 className="section-title">
        Betroffene Module <span className="count">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="note">Keine Ausbreitung.</p>
      ) : (
        <div className="list">
          {rows.map(({ id, hit, node }) => (
            <button key={id} type="button" className="list-row" onClick={() => focusNode(id)}>
              <span className="dot" style={{ ['--c' as string]: hitColor(hit.distance) }} />
              <TypeIcon typeId={node!.data.typeId} size="small" />
              <span className="list-row__text">
                <span className="list-row__title">{node!.data.label}</span>
                <span className="list-row__sub">
                  über {byId.get(hit.from)?.data.label ?? '–'}
                </span>
              </span>
              <span className="list-row__value" title="Schritte vom Ursprung">
                {hit.distance}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function GeneralDetails({ node, type }: { node: AppNode; type: ModuleType }) {
  const update = useModelStore((s) => s.updateNodeData)
  const startAnalysis = useModelStore((s) => s.startAnalysis)
  const edges = useModelStore((s) => s.edges)
  const impact = useMemo(() => {
    const { nodes } = useModelStore.getState()
    return impactOf(graphOf(nodes, edges), node.id, DEPENDENCY_TYPES.map((t) => t.id))
  }, [edges, node.id])

  const setProp = (key: string, value: unknown) => {
    const next = { ...node.data.properties }
    if (value === undefined) delete next[key]
    else next[key] = value
    update(node.id, { properties: next }, `prop:${node.id}:${key}`)
  }

  return (
    <>
      <section className="inspector__section">
        <div className="field">
          <label className="field__label" htmlFor={`node-desc-${node.id}`}>
            Beschreibung
          </label>
          <textarea
            id={`node-desc-${node.id}`}
            className="textarea"
            value={node.data.description ?? ''}
            placeholder="Beschreibung"
            onChange={(e) => update(node.id, { description: e.target.value || undefined }, `desc:${node.id}`)}
          />
        </div>
        <ParentSelect node={node} />
        <div className="callout">
          <Zap size={14} aria-hidden="true" />
          <span style={{ flex: 1 }}>
            {impact.total === 0 ? (
              'Keine abhängigen Module.'
            ) : (
              <>
                Störung erreicht <strong>{impact.near}</strong> {impact.near === 1 ? 'Modul' : 'Module'} (≤ {NEAR_STEPS} Schritte),
                gesamt {impact.total}
              </>
            )}
          </span>
          <button type="button" className="btn btn--small" onClick={() => startAnalysis(node.id)}>
            Zeigen
          </button>
        </div>
      </section>
      {Object.keys(type.properties.properties).length > 0 && (
        <section className="inspector__section">
          <PropertyForm schema={type.properties} values={node.data.properties} onChange={setProp} idPrefix={`prop-${node.id}`} />
        </section>
      )}
    </>
  )
}

function ParentSelect({ node }: { node: AppNode }) {
  const groups = useModelStore(useShallow((s) => s.nodes.filter((n) => n.type === 'area' && n.id !== node.id)))
  const reparent = useModelStore((s) => s.reparent)
  const pushHistory = useModelStore((s) => s.pushHistory)
  return (
    <div className="field">
      <label className="field__label" htmlFor={`node-parent-${node.id}`}>
        Gehört zu
      </label>
      <select
        id={`node-parent-${node.id}`}
        className="select"
        value={node.parentId ?? ''}
        onChange={(e) => {
          pushHistory()
          reparent(node.id, e.target.value || null)
        }}
      >
        <option value="">– keiner Halle oder Ebene –</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.data.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function GroupDetails({ node, type }: { node: AppNode; type: ModuleType }) {
  const update = useModelStore((s) => s.updateNodeData)
  const children = useModelStore(useShallow((s) => s.nodes.filter((n) => n.parentId === node.id)))
  const select = useModelStore((s) => s.select)
  const setProp = (key: string, value: unknown) => {
    const next = { ...node.data.properties }
    if (value === undefined) delete next[key]
    else next[key] = value
    update(node.id, { properties: next }, `prop:${node.id}:${key}`)
  }
  return (
    <>
      <section className="inspector__section">
        <div className="field">
          <label className="field__label" htmlFor={`node-desc-${node.id}`}>
            Beschreibung
          </label>
          <textarea
            id={`node-desc-${node.id}`}
            className="textarea"
            value={node.data.description ?? ''}
            placeholder="Beschreibung"
            onChange={(e) => update(node.id, { description: e.target.value || undefined }, `desc:${node.id}`)}
          />
        </div>
        <ParentSelect node={node} />
        <PropertyForm schema={type.properties} values={node.data.properties} onChange={setProp} idPrefix={`prop-${node.id}`} />
      </section>
      <section className="inspector__section">
        <h3 className="section-title">
          Enthält <span className="count">{children.length}</span>
        </h3>
        {children.length === 0 ? (
          <p className="note">Leer.</p>
        ) : (
          <div className="list">
            {children.map((c) => (
              <button key={c.id} type="button" className="list-row" onClick={() => select({ nodeId: c.id })}>
                <TypeIcon typeId={c.data.typeId} size="small" />
                <span className="list-row__text">
                  <span className="list-row__title">{c.data.label}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function ReadinessStatus({ missing, applicable }: { missing: string[]; applicable: boolean }) {
  if (!applicable) return <span className="status status--na">Passt nicht zu diesem Modultyp</span>
  if (missing.length === 0)
    return (
      <span className="status status--good">
        <CircleCheck size={13} aria-hidden="true" />
        Alle Eingaben vorhanden
      </span>
    )
  return (
    <span className="status status--warn">
      <TriangleAlert size={13} aria-hidden="true" />
      Fehlt: {missing.join(', ')}
    </span>
  )
}

function DrzAssignments({ node }: { node: AppNode }) {
  const drzNodes = useModelStore(useShallow((s) => s.nodes.filter((n) => n.data.typeId === 'drz')))
  const toggle = useModelStore((s) => s.toggleDrz)
  const showLinks = useModelStore((s) => s.showDrzLinks)
  const setShowLinks = useModelStore((s) => s.setShowDrzLinks)
  const { readiness } = useDerived()

  return (
    <section className="inspector__section">
      {drzNodes.length === 0 && <p className="note">Keine DRZ-Module vorhanden.</p>}
      <div className="list" style={{ gap: 6 }}>
        {drzNodes.map((d) => {
          const on = node.data.drz.includes(d.id)
          const kind = findDrzKind(d.data.properties.drzKind)
          const applicable = kind ? kind.appliesTo.includes(node.data.typeId) : false
          const r = readiness.get(`${node.id}|${d.id}`)
          const id = `drz-${node.id}-${d.id}`
          return (
            <label key={d.id} htmlFor={id} className={`drz-option${on ? ' is-on' : ''}${!applicable && !on ? ' is-na' : ''}`}>
              <input id={id} type="checkbox" checked={on} disabled={!applicable && !on} onChange={() => toggle(node.id, d.id)} />
              <span className="drz-option__title">{d.data.label}</span>
              <span className="drz-option__status">
                {on && r ? (
                  <ReadinessStatus missing={r.missing} applicable={r.applicable} />
                ) : (
                  <span className="status status--na">{applicable ? kind?.description : 'Passt nicht zu diesem Modultyp'}</span>
                )}
              </span>
            </label>
          )
        })}
      </div>
      <label className="check-row" htmlFor="show-drz-links">
        <input id="show-drz-links" type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} />
        Zuordnungen im Baukasten als Linien zeigen
      </label>
    </section>
  )
}

function DrzModuleDetails({ node }: { node: AppNode }) {
  const update = useModelStore((s) => s.updateNodeData)
  const users = useModelStore(useShallow((s) => s.nodes.filter((n) => n.data.drz.includes(node.id))))
  const focusNode = useModelStore((s) => s.focusNode)
  const setView = useModelStore((s) => s.setView)
  const { readiness } = useDerived()
  const kind = findDrzKind(node.data.properties.drzKind)
  const type = getModuleType('drz')

  const setProp = (key: string, value: unknown) => {
    const next = { ...node.data.properties }
    if (value === undefined) delete next[key]
    else next[key] = value
    update(node.id, { properties: next } as Partial<ModuleData>, `prop:${node.id}:${key}`)
  }
  const { drzKind: _kindField, ...otherFields } = type.properties.properties
  void _kindField

  return (
    <>
      <section className="inspector__section">
        <div className="field">
          <label className="field__label" htmlFor={`drz-kind-${node.id}`}>
            Modulart
          </label>
          <select
            id={`drz-kind-${node.id}`}
            className="select"
            value={kind?.id ?? ''}
            onChange={(e) => setProp('drzKind', e.target.value || undefined)}
          >
            <option value="">–</option>
            {DRZ_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          {kind?.id === 'simulation' && (
            <button type="button" className="btn btn--small" style={{ justifySelf: 'start' }} onClick={() => setView('simulation')}>
              Simulation öffnen
            </button>
          )}
        </div>
        <PropertyForm
          schema={{ type: 'object', properties: otherFields }}
          values={node.data.properties}
          onChange={setProp}
          idPrefix={`prop-${node.id}`}
        />
      </section>
      <section className="inspector__section">
        <h3 className="section-title">
          Genutzt von <span className="count">{users.length}</span>
        </h3>
        {users.length === 0 ? (
          <p className="note">Keinem Modul zugeordnet.</p>
        ) : (
          <div className="list">
            {users.map((u) => {
              const r = readiness.get(`${u.id}|${node.id}`)
              return (
                <button key={u.id} type="button" className="list-row" onClick={() => focusNode(u.id)} style={{ alignItems: 'flex-start' }}>
                  <TypeIcon typeId={u.data.typeId} size="small" />
                  <span className="list-row__text">
                    <span className="list-row__title">{u.data.label}</span>
                    {r && <ReadinessStatus missing={r.missing} applicable={r.applicable} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

function Connections({ nodeId }: { nodeId: string }) {
  const { index } = useDerived()
  const select = useModelStore((s) => s.select)
  const incoming = index.incoming.get(nodeId) ?? []
  const outgoing = index.outgoing.get(nodeId) ?? []
  const row = (edgeId: string, otherId: string, typeId: (typeof DEPENDENCY_TYPES)[number]['id'], label?: string) => {
    const t = getDependencyType(typeId)
    const other = index.nodesById.get(otherId)
    return (
      <button key={edgeId} type="button" className="list-row" onClick={() => select({ edgeId })}>
        <EdgeSwatch colorVar={t.colorVar} dash={t.dash} width={t.width} />
        <span className="list-row__text">
          <span className="list-row__title">{other?.data.label ?? otherId}</span>
          <span className="list-row__sub">
            {t.label}
            {label ? ` · ${label}` : ''}
          </span>
        </span>
      </button>
    )
  }
  return (
    <>
      <section className="inspector__section">
        <h3 className="section-title">
          Hängt ab von <span className="count">{incoming.length}</span>
        </h3>
        {incoming.length === 0 ? (
          <p className="note">Keine.</p>
        ) : (
          <div className="list">{incoming.map((e) => row(e.id, e.source, e.data.typeId, e.data.label))}</div>
        )}
      </section>
      <section className="inspector__section">
        <h3 className="section-title">
          Liefert an <span className="count">{outgoing.length}</span>
        </h3>
        {outgoing.length === 0 ? (
          <p className="note">Keine.</p>
        ) : (
          <div className="list">{outgoing.map((e) => row(e.id, e.target, e.data.typeId, e.data.label))}</div>
        )}
      </section>
    </>
  )
}
