import { useMemo, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { buildIndex, readinessFor, type Readiness } from '../model/analysis'
import { graphOf } from '../store/flow'
import { useModelStore } from '../store/useModelStore'
import { DerivedContext, type Derived } from './derivedContext'

/**
 * Computes graph-derived data once per structural change. Node positions are
 * deliberately not part of the dependency list, so dragging stays cheap.
 */
export function DerivedProvider({ children }: { children: ReactNode }) {
  const dataList = useModelStore(useShallow((s) => s.nodes.map((n) => n.data)))
  const idKey = useModelStore((s) => s.nodes.map((n) => n.id).join('|'))
  const edges = useModelStore((s) => s.edges)

  const value = useMemo<Derived>(() => {
    const { nodes } = useModelStore.getState()
    const index = buildIndex(graphOf(nodes, edges))
    const readiness = new Map<string, Readiness>()
    const drzSummary = new Map<string, { total: number; ready: number }>()
    const drzUsage = new Map<string, number>()
    for (const n of nodes) {
      let total = 0
      let ready = 0
      for (const drzId of n.data.drz) {
        if (!index.nodesById.has(drzId)) continue
        const r = readinessFor(n.id, drzId, index)
        readiness.set(`${n.id}|${drzId}`, r)
        total++
        if (r.applicable && r.missing.length === 0) ready++
        drzUsage.set(drzId, (drzUsage.get(drzId) ?? 0) + 1)
      }
      if (total > 0) drzSummary.set(n.id, { total, ready })
    }
    return { index, readiness, drzSummary, drzUsage }
    // dataList and idKey stand in for the node list without positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataList, idKey, edges])

  return <DerivedContext.Provider value={value}>{children}</DerivedContext.Provider>
}
