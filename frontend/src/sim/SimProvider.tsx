import { useEffect, useMemo, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { graphOf } from '../store/flow'
import { useModelStore } from '../store/useModelStore'
import { buildProcess } from './buildProcess'
import type { TaskResult } from './contract'
import { SimContext, type SimDerived } from './simContext'
import { activeRun, useSimStore } from './useSimStore'

/** Derives the simulated chain from the model (structure only) and joins it with the active result. */
export function SimProvider({ children }: { children: ReactNode }) {
  const orgId = useModelStore((s) => s.organization.id)
  const dataList = useModelStore(useShallow((s) => s.nodes.map((n) => n.data)))
  const idKey = useModelStore((s) => s.nodes.map((n) => n.id).join('|'))
  const edges = useModelStore((s) => s.edges)
  const load = useSimStore((s) => s.load)
  const startId = useSimStore((s) => s.config.startId)
  const endId = useSimStore((s) => s.config.endId)
  const useAssumptions = useSimStore((s) => s.config.useAssumptions)
  const assumptions = useSimStore((s) => s.config.assumptions)
  const run = useSimStore((s) => activeRun(s))
  const scenarioId = useSimStore((s) => s.activeScenarioId)

  useEffect(() => load(orgId), [orgId, load])

  const build = useMemo(
    () => buildProcess(graphOf(useModelStore.getState().nodes, edges), { startId, endId, useAssumptions, assumptions }),
    // dataList and idKey stand in for the node list without positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataList, idKey, edges, startId, endId, useAssumptions, assumptions],
  )

  const value = useMemo<SimDerived>(() => {
    const scenarios = run?.run.result?.scenarios ?? []
    const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0] ?? null
    const baseline = scenarios[0] ?? null
    const index = (list: TaskResult[] | undefined) => new Map((list ?? []).map((t) => [t.moduleId ?? t.id, t]))
    const taskById = index(scenario?.tasks)
    let maxBlocked = 0
    for (const t of taskById.values()) maxBlocked = Math.max(maxBlocked, t.blockedShare)
    return {
      build,
      scenario,
      baseline,
      taskById,
      baseTaskById: index(baseline?.tasks),
      bottleneckId: scenario?.bottlenecks[0]?.moduleId ?? scenario?.bottlenecks[0]?.task ?? null,
      maxBlocked,
    }
  }, [build, run, scenarioId])

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>
}
