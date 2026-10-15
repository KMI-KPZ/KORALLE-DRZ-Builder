import { useMemo } from 'react'
import { impactRanking, NEAR_STEPS } from '../../model/analysis'
import { DEPENDENCY_TYPES, findModuleType } from '../../model/catalog'
import { graphOf } from '../../store/flow'
import { useModelStore } from '../../store/useModelStore'
import { useDerived } from '../derivedContext'
import { TypeIcon } from '../Icon'

export function Overview() {
  const organization = useModelStore((s) => s.organization)
  const edges = useModelStore((s) => s.edges)
  const nodes = useModelStore((s) => s.nodes)
  const focusNode = useModelStore((s) => s.focusNode)
  const startAnalysis = useModelStore((s) => s.startAnalysis)
  const derived = useDerived()

  const stats = useMemo(() => {
    const modules = nodes.filter((n) => {
      const t = findModuleType(n.data.typeId)
      return t && !t.isGroup && t.category !== 'drz'
    })
    const stoer = modules.reduce((sum, n) => sum + n.data.groessen.filter((g) => g.kind === 'stoer').length, 0)
    let assignments = 0
    let ready = 0
    for (const s of derived.drzSummary.values()) {
      assignments += s.total
      ready += s.ready
    }
    return { modules, stoer, assignments, ready }
  }, [nodes, derived])

  // Impact only depends on structure; positions are irrelevant.
  const reach = useMemo(() => {
    const graph = graphOf(useModelStore.getState().nodes, edges)
    return impactRanking(graph, DEPENDENCY_TYPES.map((t) => t.id), derived.index)
      .map((impact) => ({ ...impact, node: derived.index.nodesById.get(impact.id) }))
      .filter((x) => x.node && x.node.data.typeId !== 'drz' && !findModuleType(x.node.data.typeId)?.isGroup)
      .slice(0, 7)
    // derived.index changes with every structural change of nodes
  }, [edges, derived.index])

  const openPoints = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of derived.readiness.values()) {
      if (!r.applicable) continue
      for (const m of r.missing) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [derived.readiness])

  const maxScore = Math.max(1, ...reach.map((r) => r.score))
  const readyShare = stats.assignments > 0 ? stats.ready / stats.assignments : 0

  return (
    <div className="inspector">
      <div className="inspector__head">
        <span className="inspector__type">Übersicht</span>
        <div style={{ fontSize: 16, fontWeight: 650 }}>{organization.name}</div>
      </div>

      <section className="inspector__section" aria-label="Kennzahlen">
        <div className="stats">
          <div className="stat">
            <span className="stat__value">{stats.modules.length}</span>
            <span className="stat__label">Module</span>
          </div>
          <div className="stat">
            <span className="stat__value">{edges.length}</span>
            <span className="stat__label">Abhängigkeiten</span>
          </div>
          <div className="stat">
            <span className="stat__value">{stats.stoer}</span>
            <span className="stat__label">Störgrößen erfasst</span>
          </div>
          <div className="stat">
            <span className="stat__value">
              {stats.ready}/{stats.assignments}
            </span>
            <span className="stat__label">DRZ-Zuordnungen bereit</span>
            <div className="meter" aria-hidden="true">
              <div className="meter__fill" style={{ width: `${Math.round(readyShare * 100)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="inspector__section" aria-label="Größte Reichweite bei Störung">
        <h3 className="section-title">Größte Störwirkung</h3>
        <div className="bar-list">
          {reach.map(({ id, score, near, node }) => (
            <button
              key={id}
              type="button"
              className="bar-row"
              onClick={() => {
                focusNode(id)
                startAnalysis(id)
              }}
            >
              <span className="bar-row__label">
                <TypeIcon typeId={node!.data.typeId} size="small" />
                <span>{node!.data.label}</span>
              </span>
              <span className="bar-row__value" title="Wirkungsscore">{Math.round(score)}</span>
              <span className="bar-row__track" aria-hidden="true">
                <span className="bar-row__fill" style={{ display: 'block', width: `${(score / maxScore) * 100}%` }} />
              </span>
              <span className="bar-row__sub">
                {near} Module ≤ {NEAR_STEPS} Schritte
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="inspector__section" aria-label="Offene Punkte für die DRZ-Konfiguration">
        <h3 className="section-title">Offene Punkte</h3>
        {openPoints.length === 0 ? (
          <p className="note">Keine.</p>
        ) : (
          <div className="list">
            {openPoints.map(([text, count]) => (
              <div key={text} className="list-row" style={{ cursor: 'default' }}>
                <span className="list-row__text">
                  <span className="list-row__title">{text}</span>
                </span>
                <span className="list-row__value">{count}×</span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  )
}
