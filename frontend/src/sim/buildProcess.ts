import { findModuleType } from '../model/catalog'
import { SIMULATABLE_TYPES } from '../model/drzCatalog'
import type { KoralleModel, ModelEdge, ModelNode } from '../model/types'
import type { Join, SimFlow, SimProcess, Split } from './contract'

/**
 * Derives the simulated process chain from the Baukasten.
 *
 * Steps are process modules, workplaces and buffers (SIMULATABLE_TYPES)
 * that are connected by material flows. The chain runs from the start
 * modules (default: no incoming material flow) to the end modules (default:
 * no outgoing material flow); only modules on a path between them take part.
 * Missing parameters can be filled with assumptions; they stay outside the
 * model and are marked in the request and in the UI.
 */

export interface Assumptions {
  /** Processing time for steps without a time (s). */
  time: number
  capacity: number
  bufferCapacity: number
}

export interface ScopeOptions {
  startId: string | null
  endId: string | null
  useAssumptions: boolean
  assumptions: Assumptions
}

export interface Param<T> {
  value: T | undefined
  /** Value from the assumptions, not from the model. */
  assumed: boolean
}

export interface StepParams {
  moduleId: string
  label: string
  typeId: string
  time: Param<number>
  variance: number
  capacity: Param<number>
  failChance: number
  split: Split
  join: Join
  outgoing: number
  incoming: number
  /** Inputs missing in the model (before assumptions). */
  missing: string[]
}

export interface ProcessBuild {
  steps: StepParams[]
  flows: (SimFlow & { id: string })[]
  entry: string[]
  exit: string[]
  /** All modules connected by material flows (choices for start and end). */
  candidates: { id: string; label: string }[]
  /** Material flow ids inside the chain. */
  flowIds: Set<string>
  stepIds: Set<string>
  missingCount: number
  assumedCount: number
  warnings: string[]
  /** null if nothing can be simulated (no chain, or values missing without assumptions). */
  process: SimProcess | null
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function gateway<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function reach(starts: string[], next: Map<string, string[]>): Set<string> {
  const seen = new Set(starts)
  const queue = [...starts]
  while (queue.length > 0) {
    const n = queue.shift()!
    for (const m of next.get(n) ?? []) {
      if (!seen.has(m)) {
        seen.add(m)
        queue.push(m)
      }
    }
  }
  return seen
}

/**
 * Order for display: by the longest path from the start (stage in the flow), loops ignored.
 * Also returns the flows that close a loop (`source>target`).
 */
function flowOrder(starts: string[], succ: Map<string, string[]>, ids: Set<string>): { order: string[]; back: Set<string> } {
  // Depth-first search marks edges that close a loop.
  const back = new Set<string>()
  const state = new Map<string, 1 | 2>()
  const visit = (root: string) => {
    if (state.has(root)) return
    const stack: { id: string; next: string[] }[] = [{ id: root, next: [...(succ.get(root) ?? [])].filter((m) => ids.has(m)) }]
    state.set(root, 1)
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      const m = top.next.shift()
      if (m === undefined) {
        state.set(top.id, 2)
        stack.pop()
      } else if (state.get(m) === 1) back.add(`${top.id}>${m}`)
      else if (!state.has(m)) {
        state.set(m, 1)
        stack.push({ id: m, next: [...(succ.get(m) ?? [])].filter((x) => ids.has(x)) })
      }
    }
  }
  for (const s of starts) if (ids.has(s)) visit(s)
  for (const id of ids) visit(id)

  const indeg = new Map<string, number>([...ids].map((id) => [id, 0]))
  for (const id of ids)
    for (const m of succ.get(id) ?? []) if (ids.has(m) && !back.has(`${id}>${m}`)) indeg.set(m, (indeg.get(m) ?? 0) + 1)
  const level = new Map<string, number>([...ids].map((id) => [id, 0]))
  const queue = [...ids].filter((id) => indeg.get(id) === 0)
  const seq: string[] = []
  while (queue.length > 0) {
    const n = queue.shift()!
    seq.push(n)
    for (const m of succ.get(n) ?? []) {
      if (!ids.has(m) || back.has(`${n}>${m}`)) continue
      level.set(m, Math.max(level.get(m) ?? 0, (level.get(n) ?? 0) + 1))
      indeg.set(m, (indeg.get(m) ?? 0) - 1)
      if (indeg.get(m) === 0) queue.push(m)
    }
  }
  const pos = new Map(seq.map((id, i) => [id, i]))
  const order = [...ids].sort((a, b) => (level.get(a) ?? 0) - (level.get(b) ?? 0) || (pos.get(a) ?? 0) - (pos.get(b) ?? 0))
  return { order, back }
}

export function buildProcess(model: Pick<KoralleModel, 'nodes' | 'edges'>, opts: ScopeOptions): ProcessBuild {
  const byId = new Map<string, ModelNode>(model.nodes.map((n) => [n.id, n]))
  const isStep = (id: string) => SIMULATABLE_TYPES.includes(byId.get(id)?.data.typeId ?? '')

  // Material flows between steps, one per ordered pair.
  const material: ModelEdge[] = []
  const pairs = new Set<string>()
  for (const e of model.edges) {
    if (e.data.typeId !== 'material' || e.source === e.target || !isStep(e.source) || !isStep(e.target)) continue
    const key = `${e.source}>${e.target}`
    if (pairs.has(key)) continue
    pairs.add(key)
    material.push(e)
  }
  const succ = new Map<string, string[]>()
  const pred = new Map<string, string[]>()
  const connected = new Set<string>()
  for (const e of material) {
    succ.set(e.source, [...(succ.get(e.source) ?? []), e.target])
    pred.set(e.target, [...(pred.get(e.target) ?? []), e.source])
    connected.add(e.source)
    connected.add(e.target)
  }

  const candidates = [...connected]
    .map((id) => ({ id, label: byId.get(id)!.data.label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'))
  const warnings: string[] = []

  const startId = opts.startId && connected.has(opts.startId) ? opts.startId : null
  const endId = opts.endId && connected.has(opts.endId) ? opts.endId : null
  const starts = startId ? [startId] : [...connected].filter((id) => !(pred.get(id)?.length))
  const ends = endId ? [endId] : [...connected].filter((id) => !(succ.get(id)?.length))

  const forward = reach(starts, succ)
  const backward = reach(ends, pred)
  const stepIds = new Set([...connected].filter((id) => forward.has(id) && backward.has(id)))

  const isolated = model.nodes.filter((n) => isStep(n.id) && !connected.has(n.id)).length
  if (isolated > 0) {
    warnings.push(`${isolated} Schritte ohne Materialfluss, nicht simuliert.`)
  }
  if (connected.size > 0 && starts.length === 0) warnings.push('Kein Startschritt, bitte Start wählen.')
  if (connected.size > 0 && ends.length === 0) warnings.push('Kein Endschritt, bitte Ende wählen.')
  const outside = [...connected].filter((id) => !stepIds.has(id)).length
  if (stepIds.size > 0 && outside > 0) warnings.push(`${outside} Schritte außerhalb von Start–Ende.`)

  const flows = material
    .filter((e) => stepIds.has(e.source) && stepIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(num(e.data.share) !== undefined ? { weight: num(e.data.share)! } : {}),
    }))
  const outCount = new Map<string, number>()
  const inCount = new Map<string, number>()
  for (const f of flows) {
    outCount.set(f.source, (outCount.get(f.source) ?? 0) + 1)
    inCount.set(f.target, (inCount.get(f.target) ?? 0) + 1)
  }

  const steps: StepParams[] = []
  const { order, back } = flowOrder(starts, succ, stepIds)
  // A step that a loop flows back into (rework) processes every arrival; waiting for all would deadlock.
  const loopTargets = new Set([...back].map((key) => key.split('>')[1]))
  for (const id of order) {
    const node = byId.get(id)!
    const p = node.data.properties
    const isBuffer = node.data.typeId === 'lager'
    const missing: string[] = []

    const modelTime = num(p.simZeit)
    let time: Param<number>
    if (modelTime !== undefined) time = { value: modelTime, assumed: false }
    else if (isBuffer) time = { value: 0, assumed: false }
    else {
      missing.push('Bearbeitungszeit')
      time = { value: opts.useAssumptions ? opts.assumptions.time : undefined, assumed: opts.useAssumptions }
    }

    const modelCap = num(p.simKapazitaet) ?? (isBuffer ? num(p.stellplaetze) : undefined)
    let capacity: Param<number>
    if (modelCap !== undefined && modelCap >= 1) capacity = { value: Math.round(modelCap), assumed: false }
    else {
      missing.push('Kapazität')
      const assumed = isBuffer ? opts.assumptions.bufferCapacity : opts.assumptions.capacity
      capacity = { value: opts.useAssumptions ? assumed : undefined, assumed: opts.useAssumptions }
    }

    steps.push({
      moduleId: id,
      label: node.data.label,
      typeId: node.data.typeId,
      time,
      variance: num(p.simVarianz) ?? 0,
      capacity,
      failChance: Math.min(0.99, Math.max(0, num(p.simAusfall) ?? 0)),
      split: gateway(p.simVerzweigung, ['AND', 'XOR', 'OR'] as const, 'AND'),
      join: gateway(p.simZusammenfuehrung, ['AND', 'XOR'] as const, loopTargets.has(id) ? 'XOR' : 'AND'),
      outgoing: outCount.get(id) ?? 0,
      incoming: inCount.get(id) ?? 0,
      missing,
    })
  }

  for (const s of steps) {
    if ((s.split === 'XOR' || s.split === 'OR') && s.outgoing > 1) {
      const shares = flows.filter((f) => f.source === s.moduleId).map((f) => f.weight)
      if (shares.some((w) => w === undefined)) continue
      const sum = shares.reduce<number>((a, w) => a + (w ?? 0), 0)
      if (Math.abs(sum - 100) > 0.5) warnings.push(`Anteile bei ${s.label}: ${sum} % statt 100 %.`)
    }
  }

  const missingCount = steps.filter((s) => s.missing.length > 0).length
  const assumedCount = steps.filter((s) => s.time.assumed || s.capacity.assumed).length
  const entry = starts.filter((id) => stepIds.has(id))
  const exit = ends.filter((id) => stepIds.has(id))
  const complete = steps.length > 0 && steps.every((s) => s.time.value !== undefined && s.capacity.value !== undefined)

  const process: SimProcess | null = complete
    ? {
        tasks: steps.map((s) => ({
          id: s.moduleId,
          moduleId: s.moduleId,
          label: s.label,
          time: s.time.value!,
          variance: s.variance,
          capacity: s.capacity.value!,
          failChance: s.failChance,
          split: s.split,
          join: s.join,
        })),
        flows,
        entry,
        exit,
      }
    : null

  return {
    steps,
    flows,
    entry,
    exit,
    candidates,
    flowIds: new Set(flows.map((f) => f.id)),
    stepIds,
    missingCount,
    assumedCount,
    warnings,
    process,
  }
}

/** Short German label of a module type, for tables. */
export function stepTypeLabel(typeId: string): string {
  return findModuleType(typeId)?.label ?? typeId
}
