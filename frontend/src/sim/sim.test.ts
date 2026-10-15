import { describe, expect, it } from 'vitest'
import { createMagnaModel } from '../data/magnaMeerane'
import { buildProcess, type ScopeOptions } from './buildProcess'
import { toScenarios } from './useSimStore'

const OPTS: ScopeOptions = {
  startId: null,
  endId: null,
  useAssumptions: true,
  assumptions: { time: 90, capacity: 1, bufferCapacity: 20 },
}

describe('buildProcess', () => {
  it('derives the Magna chain from the material flows', () => {
    const build = buildProcess(createMagnaModel(), OPTS)
    expect(build.entry).toEqual(['p-we'])
    expect(build.exit).toEqual(['p-wa'])
    expect(build.steps).toHaveLength(10)
    expect(build.steps[0].moduleId).toBe('p-we')
    expect(build.steps.at(-1)!.moduleId).toBe('p-wa')
    // the Leergut loop runs over the OEM (external) and is not part of the chain
    expect(build.flows.some((f) => f.target === 'p-we')).toBe(false)
    // Montage joins painted parts and purchased parts
    const montage = build.steps.find((s) => s.moduleId === 'p-montage')!
    expect(montage.incoming).toBe(2)
    expect(montage.time).toEqual({ value: 90, assumed: false })
    expect(montage.capacity.assumed).toBe(true)
    expect(build.warnings.some((w) => w.startsWith('47 Schritte'))).toBe(true)
  })

  it('keeps assumptions out of the model and blocks the run without them', () => {
    const model = createMagnaModel()
    const withAssumptions = buildProcess(model, OPTS)
    expect(withAssumptions.process).not.toBeNull()
    expect(withAssumptions.process!.tasks.find((t) => t.id === 'p-lack')!.time).toBe(90)
    expect(model.nodes.find((n) => n.id === 'p-lack')!.data.properties.simZeit).toBeUndefined()
    const strict = buildProcess(model, { ...OPTS, useAssumptions: false })
    expect(strict.process).toBeNull()
    expect(strict.missingCount).toBe(10)
  })

  it('uses buffer places as capacity and zero dwell time', () => {
    const model = createMagnaModel()
    model.nodes.find((n) => n.id === 'l-rtp')!.data.properties.stellplaetze = 40
    const rtp = buildProcess(model, OPTS).steps.find((s) => s.moduleId === 'l-rtp')!
    expect(rtp.time).toEqual({ value: 0, assumed: false })
    expect(rtp.capacity).toEqual({ value: 40, assumed: false })
    expect(rtp.missing).toEqual([])
  })

  it('restricts the chain to the path between start and end', () => {
    const build = buildProcess(createMagnaModel(), { ...OPTS, startId: 'l-hilis' })
    expect(build.steps.map((s) => s.moduleId)).toEqual(['l-hilis', 'p-montage', 'p-jis', 'p-wa'])
    expect(build.entry).toEqual(['l-hilis'])
  })

  it('lets a rework loop target process every arrival', () => {
    const model = createMagnaModel()
    model.edges.push({
      id: 'rework',
      source: 'p-qualitaet',
      target: 'p-lack',
      data: { typeId: 'material', criticality: 2, share: 10 },
    })
    const lack = buildProcess(model, OPTS).steps.find((s) => s.moduleId === 'p-lack')!
    expect(lack.incoming).toBe(2)
    expect(lack.join).toBe('XOR')
    const montage = buildProcess(model, OPTS).steps.find((s) => s.moduleId === 'p-montage')!
    expect(montage.join).toBe('AND')
  })

  it('passes XOR shares as flow weights', () => {
    const model = createMagnaModel()
    model.edges.find((e) => e.source === 'p-we' && e.target === 'p-montage')!.data.share = 30
    const build = buildProcess(model, OPTS)
    expect(build.flows.find((f) => f.source === 'p-we' && f.target === 'p-montage')!.weight).toBe(30)
  })
})

describe('toScenarios', () => {
  it('converts the drafts into contract overrides', () => {
    const scenarios = toScenarios(
      [
        {
          id: 's1',
          label: 'Störung',
          changes: [
            { id: 'c1', moduleId: 'a', kind: 'downtime', start: 30, duration: 15 },
            { id: 'c2', moduleId: 'a', kind: 'failChance', value: 10 },
            { id: 'c3', moduleId: 'b', kind: 'capacity', value: 2.4 },
            { id: 'c4', moduleId: 'outside', kind: 'time', value: 5 },
          ],
        },
      ],
      new Set(['a', 'b']),
    )
    expect(scenarios[0]).toEqual({ id: 'base', label: 'Basis', overrides: [] })
    expect(scenarios[1].overrides).toEqual([
      { task: 'a', downtimes: [{ start: 1800, duration: 900 }] },
      { task: 'a', failChance: 0.1 },
      { task: 'b', capacity: 2 },
    ])
  })
})
