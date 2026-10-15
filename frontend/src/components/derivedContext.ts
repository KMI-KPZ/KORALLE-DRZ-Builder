import { createContext, useContext } from 'react'
import type { GraphIndex, Readiness } from '../model/analysis'

export interface Derived {
  index: GraphIndex
  /** Readiness per (module, DRZ module) assignment, keyed `${nodeId}|${drzId}`. */
  readiness: Map<string, Readiness>
  /** Per module: assigned DRZ modules and how many of them are ready. */
  drzSummary: Map<string, { total: number; ready: number }>
  /** Per DRZ module: how many organisation modules use it. */
  drzUsage: Map<string, number>
}

export const DerivedContext = createContext<Derived | null>(null)

export function useDerived(): Derived {
  const ctx = useContext(DerivedContext)
  if (!ctx) throw new Error('useDerived must be used inside DerivedProvider')
  return ctx
}
