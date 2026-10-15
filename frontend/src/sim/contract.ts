/**
 * Types of the simulation contract koralle.sim/v1 (validated in backend/koralle/apps/simulations/engine/contract.py).
 *
 * The engine lives in backend/koralle/apps/simulations/engine. The frontend
 * only builds requests and renders results, so the engine can move from the
 * dev server to Django/Celery without changes here. All times are seconds.
 */

export const CONTRACT = 'koralle.sim/v1'

export type Split = 'AND' | 'XOR' | 'OR'
export type Join = 'AND' | 'XOR'

export interface Downtime {
  start: number
  duration: number
}

export interface SimTask {
  id: string
  label?: string
  time: number
  variance?: number
  capacity?: number
  failChance?: number
  split?: Split
  join?: Join
  moduleId?: string
  downtimes?: Downtime[]
}

export interface SimFlow {
  id?: string
  source: string
  target: string
  weight?: number
}

export interface SimProcess {
  tasks: SimTask[]
  flows: SimFlow[]
  entry?: string[]
  exit?: string[]
  entrySplit?: Split
}

export interface SimSettings {
  parts: number
  interarrival: number
  arrival?: 'fixed' | 'exponential'
  replications: number
  seed: number
  timeSampling?: 'perPart' | 'perRun'
  maxSimTime?: number | null
  eventLog?: boolean
}

export interface SimOverride {
  task: string
  time?: number
  variance?: number
  capacity?: number
  failChance?: number
  split?: Split
  downtimes?: Downtime[]
}

export interface SimScenario {
  id: string
  label: string
  overrides?: SimOverride[]
}

export interface SimRequest {
  contract: typeof CONTRACT
  label?: string
  model?: { organization: string; schemaVersion: string; [key: string]: unknown }
  process: SimProcess
  settings: SimSettings
  scenarios: SimScenario[]
}

export interface Stat {
  mean: number
  std: number
  min: number
  max: number
  p05: number
  p95: number
}

export type KpiName =
  | 'throughputPerHour'
  | 'leadTime'
  | 'leadTimeP95'
  | 'makespan'
  | 'completed'
  | 'stuck'
  | 'incomplete'
  | 'failures'
  | 'blockedTime'
  | 'bufferTime'
  | 'entryWait'
  | 'wip'

export interface TaskResult {
  id: string
  moduleId: string | null
  label: string
  capacity: number
  utilization: number
  blockedShare: number
  processed: number
  failures: number
  busyTime: number
  blockedTime: number
  /** Waiting inside a buffer (step without processing time). */
  bufferedTime: number
  blockingCaused: number
  downtime: number
  deadEnds: number
  joinWaiting: number
  deadlocked: number
  /** Mean number of parts in the step (processing or blocked). */
  avgOccupied: number
  maxOccupied: number
  bpmnGraphSimScore: number
}

export interface Bottleneck {
  task: string
  moduleId: string | null
  utilization: number
  blockingShare: number
  reason: string
}

export interface ScenarioResult {
  id: string
  label: string
  replications: number
  kpis: Record<KpiName, Stat>
  tasks: TaskResult[]
  flows: { id: string; blockedTime: number }[]
  bottlenecks: Bottleneck[]
  /** Information, e.g. a balanced line without a single bottleneck. */
  notes: string[]
  warnings: string[]
  eventLog?: { t: number; part: number; task: string; event: string }[]
}

export interface SimResult {
  contract: string
  engine: EngineDescription
  label: string
  model: Record<string, unknown>
  timeUnit: 's'
  settings: SimSettings
  scenarios: ScenarioResult[]
  warnings: string[]
  durationMs: number
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface SimRun {
  id: string
  organization: string
  status: RunStatus
  label: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
  result?: SimResult
  error?: ApiErrorBody
}

export interface EngineDescription {
  name: string
  version: string
  model: string
  contract: string
  timeUnit: string
}

export interface EngineInfo {
  status: 'ok'
  engine: EngineDescription
  limits: { parts: number; replications: number; tasks: number; scenarios: number; work: number }
  features: { bpmnImport: boolean; bpmnExport: boolean; reference: boolean }
  server?: string
}

export interface ApiErrorBody {
  code: string
  message: string
  details: { path: string; message: string }[]
}
