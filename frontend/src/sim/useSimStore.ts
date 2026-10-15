import { create } from 'zustand'
import { newId } from '../model/ids'
import type { Assumptions } from './buildProcess'
import { SimulationApiError, SimulationOfflineError, simulationClient } from './client'
import { CONTRACT, type EngineInfo, type SimOverride, type SimProcess, type SimRequest, type SimRun, type SimScenario } from './contract'

/**
 * State of the simulation view: configuration (persisted per organisation in
 * the browser), connection to the engine and the runs of this session.
 * Run results are not stored in the browser; the backend keeps them.
 */

export type ChangeKind = 'downtime' | 'time' | 'capacity' | 'failChance'

export interface ChangeDraft {
  id: string
  moduleId: string
  kind: ChangeKind
  /** downtime: start and duration in minutes */
  start?: number
  duration?: number
  /** time in s, capacity, failChance in % */
  value?: number
}

export interface ScenarioDraft {
  id: string
  label: string
  changes: ChangeDraft[]
}

export interface SimConfig {
  startId: string | null
  endId: string | null
  useAssumptions: boolean
  assumptions: Assumptions
  parts: number
  interarrival: number
  arrival: 'fixed' | 'exponential'
  replications: number
  seed: number
  scenarios: ScenarioDraft[]
}

export const DEFAULT_CONFIG: SimConfig = {
  startId: null,
  endId: null,
  useAssumptions: true,
  assumptions: { time: 90, capacity: 1, bufferCapacity: 20 },
  parts: 200,
  interarrival: 90,
  arrival: 'fixed',
  replications: 10,
  seed: 1,
  scenarios: [],
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  downtime: 'Stillstand',
  time: 'Bearbeitungszeit',
  capacity: 'Kapazität',
  failChance: 'Ausfallrate',
}

export type EngineState =
  | { status: 'unknown' | 'checking' }
  | { status: 'online'; info: EngineInfo }
  | { status: 'offline'; message: string }

export interface RunEntry {
  run: SimRun
  /** Request that produced the run (for re-export and comparison). */
  request: SimRequest
  /** Assumed values were used for these modules. */
  assumed: string[]
}

interface SimState {
  config: SimConfig
  orgId: string | null
  engine: EngineState
  running: boolean
  runError: { message: string; details: string[] } | null
  runs: RunEntry[]
  activeRunId: string | null
  activeScenarioId: string | null

  load: (orgId: string) => void
  setConfig: (patch: Partial<SimConfig>) => void
  addScenario: () => string
  updateScenario: (id: string, patch: Partial<Omit<ScenarioDraft, 'id'>>) => void
  removeScenario: (id: string) => void
  addChange: (scenarioId: string, change: Omit<ChangeDraft, 'id'>) => void
  updateChange: (scenarioId: string, changeId: string, patch: Partial<ChangeDraft>) => void
  removeChange: (scenarioId: string, changeId: string) => void
  checkEngine: () => Promise<void>
  run: (orgId: string, schemaVersion: string, process: SimProcess, assumed: string[], label: string) => Promise<void>
  setActiveRun: (id: string) => void
  setActiveScenario: (id: string) => void
}

const MAX_RUNS = 8
const storageKey = (org: string) => `koralle.sim.config.v1.${org}`

function readConfig(org: string): SimConfig {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(org))
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw) as Partial<SimConfig>
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      assumptions: { ...DEFAULT_CONFIG.assumptions, ...(parsed.assumptions ?? {}) },
      scenarios: Array.isArray(parsed.scenarios) ? parsed.scenarios : [],
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

function writeConfig(org: string | null, config: SimConfig) {
  if (!org) return
  try {
    globalThis.localStorage?.setItem(storageKey(org), JSON.stringify(config))
  } catch {
    // Browser storage can be unavailable; the configuration then lives for this session only.
  }
}

/** Turns the scenario drafts into contract scenarios. Changes on modules outside the chain are skipped. */
export function toScenarios(drafts: ScenarioDraft[], taskIds: Set<string>): SimScenario[] {
  const base: SimScenario = { id: 'base', label: 'Basis', overrides: [] }
  return [
    base,
    ...drafts.map((d) => {
      const overrides: SimOverride[] = []
      for (const c of d.changes) {
        if (!taskIds.has(c.moduleId)) continue
        if (c.kind === 'downtime') {
          if (c.duration === undefined || c.duration <= 0) continue
          overrides.push({ task: c.moduleId, downtimes: [{ start: Math.max(0, c.start ?? 0) * 60, duration: c.duration * 60 }] })
        } else if (c.value !== undefined && Number.isFinite(c.value)) {
          if (c.kind === 'time') overrides.push({ task: c.moduleId, time: Math.max(0, c.value) })
          if (c.kind === 'capacity') overrides.push({ task: c.moduleId, capacity: Math.max(1, Math.round(c.value)) })
          if (c.kind === 'failChance') overrides.push({ task: c.moduleId, failChance: Math.min(0.99, Math.max(0, c.value / 100)) })
        }
      }
      return { id: d.id, label: d.label || 'Szenario', overrides }
    }),
  ]
}

export const useSimStore = create<SimState>()((set, get) => {
  const patchConfig = (fn: (c: SimConfig) => SimConfig) => {
    const config = fn(get().config)
    set({ config })
    writeConfig(get().orgId, config)
  }
  const patchScenario = (id: string, fn: (s: ScenarioDraft) => ScenarioDraft) =>
    patchConfig((c) => ({ ...c, scenarios: c.scenarios.map((s) => (s.id === id ? fn(s) : s)) }))

  return {
    config: DEFAULT_CONFIG,
    orgId: null,
    engine: { status: 'unknown' },
    running: false,
    runError: null,
    runs: [],
    activeRunId: null,
    activeScenarioId: null,

    load: (orgId) => {
      if (get().orgId === orgId) return
      set({ orgId, config: readConfig(orgId), runs: [], activeRunId: null, activeScenarioId: null, runError: null })
    },

    setConfig: (patch) => patchConfig((c) => ({ ...c, ...patch })),

    addScenario: () => {
      const id = newId('s')
      const n = get().config.scenarios.length + 1
      patchConfig((c) => ({ ...c, scenarios: [...c.scenarios, { id, label: `Szenario ${n}`, changes: [] }] }))
      return id
    },
    updateScenario: (id, patch) => patchScenario(id, (s) => ({ ...s, ...patch })),
    removeScenario: (id) => patchConfig((c) => ({ ...c, scenarios: c.scenarios.filter((s) => s.id !== id) })),
    addChange: (scenarioId, change) =>
      patchScenario(scenarioId, (s) => ({ ...s, changes: [...s.changes, { ...change, id: newId('c') }] })),
    updateChange: (scenarioId, changeId, patch) =>
      patchScenario(scenarioId, (s) => ({ ...s, changes: s.changes.map((c) => (c.id === changeId ? { ...c, ...patch } : c)) })),
    removeChange: (scenarioId, changeId) =>
      patchScenario(scenarioId, (s) => ({ ...s, changes: s.changes.filter((c) => c.id !== changeId) })),

    checkEngine: async () => {
      if (get().engine.status === 'checking') return
      set({ engine: { status: 'checking' } })
      try {
        const info = await simulationClient.info()
        set({ engine: { status: 'online', info } })
      } catch (err) {
        set({ engine: { status: 'offline', message: err instanceof Error ? err.message : String(err) } })
      }
    },

    run: async (orgId, schemaVersion, process, assumed, label) => {
      const { config } = get()
      const taskIds = new Set(process.tasks.map((t) => t.id))
      const request: SimRequest = {
        contract: CONTRACT,
        label,
        model: { organization: orgId, schemaVersion, assumedModules: assumed },
        process,
        settings: {
          parts: config.parts,
          interarrival: config.interarrival,
          arrival: config.arrival,
          replications: config.replications,
          seed: config.seed,
        },
        scenarios: toScenarios(config.scenarios, taskIds),
      }
      set({ running: true, runError: null })
      try {
        const run = await simulationClient.run(orgId, request)
        const entry: RunEntry = { run, request, assumed }
        const prevScenario = get().activeScenarioId
        const scenarioIds = run.result?.scenarios.map((s) => s.id) ?? []
        set({
          runs: [entry, ...get().runs].slice(0, MAX_RUNS),
          activeRunId: run.id,
          activeScenarioId: prevScenario && scenarioIds.includes(prevScenario) ? prevScenario : (scenarioIds[0] ?? null),
          running: false,
        })
      } catch (err) {
        if (err instanceof SimulationOfflineError) {
          set({ engine: { status: 'offline', message: err.message } })
        }
        const details = err instanceof SimulationApiError ? err.details.map((d) => `${d.path}: ${d.message}`) : []
        set({ running: false, runError: { message: err instanceof Error ? err.message : String(err), details } })
      }
    },

    setActiveRun: (id) => {
      const entry = get().runs.find((r) => r.run.id === id)
      const ids = entry?.run.result?.scenarios.map((s) => s.id) ?? []
      const current = get().activeScenarioId
      set({ activeRunId: id, activeScenarioId: current && ids.includes(current) ? current : (ids[0] ?? null) })
    },
    setActiveScenario: (id) => set({ activeScenarioId: id }),
  }
})

/** The run shown in the panel and on the canvas. */
export function activeRun(state: Pick<SimState, 'runs' | 'activeRunId'>): RunEntry | undefined {
  return state.runs.find((r) => r.run.id === state.activeRunId) ?? state.runs[0]
}
