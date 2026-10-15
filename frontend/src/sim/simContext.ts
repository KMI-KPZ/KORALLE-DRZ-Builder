import { createContext, useContext } from 'react'
import type { ScenarioResult, TaskResult } from './contract'
import type { ProcessBuild } from './buildProcess'

export interface SimDerived {
  build: ProcessBuild
  /** Result of the scenario shown on the canvas, if a run exists. */
  scenario: ScenarioResult | null
  /** Baseline of the same run, for deltas. */
  baseline: ScenarioResult | null
  taskById: Map<string, TaskResult>
  baseTaskById: Map<string, TaskResult>
  bottleneckId: string | null
  /** Highest utilization in the shown scenario (for scaling). */
  maxBlocked: number
}

export const SimContext = createContext<SimDerived | null>(null)

export function useSim(): SimDerived {
  const ctx = useContext(SimContext)
  if (!ctx) throw new Error('useSim must be used inside SimProvider')
  return ctx
}
