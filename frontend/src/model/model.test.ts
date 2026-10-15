import { describe, expect, it } from 'vitest'
import { createMagnaModel } from '../data/magnaMeerane'
import { buildIndex, descendantsOf, impactOf, impactRanking, propagate, readinessFor, readinessSummary } from './analysis'
import { findModuleType } from './catalog'
import { fromJsonLd, migrate, SCHEMA_VERSION, toJsonLd } from './jsonld'
import { computeLayout } from './layout'
import type { KoralleModel } from './types'
import { MAGNA_STATIONS } from '../data/magnaStations'
import { collapsedDescendants, modelToFlow, flowToModel } from '../store/flow'

const ALL = ['material', 'information', 'control', 'resource'] as const

function tiny(): KoralleModel {
  const mk = (id: string, typeId = 'prozess', parentId?: string) => ({
    id,
    parentId,
    layout: { x: 0, y: 0 },
    data: { typeId, label: id, properties: {}, groessen: [], drz: [] as string[] },
  })
  return {
    schemaVersion: '0.1.0',
    organization: { id: 'test', name: 'Test' },
    nodes: [mk('hall', 'halle'), mk('a', 'prozess', 'hall'), mk('b'), mk('c'), mk('it', 'it')],
    edges: [
      { id: 'e1', source: 'a', target: 'b', data: { typeId: 'material', criticality: 2 } },
      { id: 'e2', source: 'b', target: 'c', data: { typeId: 'material', criticality: 4 } },
      { id: 'e3', source: 'it', target: 'b', data: { typeId: 'information', criticality: 1 } },
    ],
  }
}

describe('Magna seed model', () => {
  const model = createMagnaModel()
  const ids = new Set(model.nodes.map((n) => n.id))

  it('has unique ids and only known module types', () => {
    expect(ids.size).toBe(model.nodes.length)
    expect(new Set(model.edges.map((e) => e.id)).size).toBe(model.edges.length)
    for (const n of model.nodes) expect(findModuleType(n.data.typeId), n.id).toBeDefined()
  })

  it('references only existing nodes', () => {
    for (const n of model.nodes) if (n.parentId) expect(ids.has(n.parentId), n.id).toBe(true)
    for (const e of model.edges) {
      expect(ids.has(e.source), e.id).toBe(true)
      expect(ids.has(e.target), e.id).toBe(true)
    }
    for (const n of model.nodes)
      for (const d of n.data.drz) expect(model.nodes.find((x) => x.id === d)?.data.typeId, `${n.id} → ${d}`).toBe('drz')
  })

  it('contains all ten process modules and the cross-cutting EDI layer from the mail', () => {
    const withGroessen = model.nodes.filter((n) => n.data.groessen.length > 0)
    expect(withGroessen).toHaveLength(11)
    const edi = model.nodes.find((n) => n.id === 'it-edi')!
    expect(edi.data.groessen.filter((g) => g.kind === 'stoer')).toHaveLength(5)
  })

  it('contains the 47 workplaces from the ERA layout, grouped by line', () => {
    const stations = model.nodes.filter((n) => n.data.typeId === 'station')
    expect(stations).toHaveLength(MAGNA_STATIONS.length)
    expect(MAGNA_STATIONS).toHaveLength(47)
    const byLine = (id: string) => stations.filter((s) => s.parentId === id).length
    expect(byLine('linie-front')).toBe(21)
    expect(byLine('linie-heck')).toBe(13)
    expect(byLine('linie-offen')).toBe(13)
    expect(model.nodes.find((n) => n.id === 'st-252')!.data.properties.eraHinweis).toMatch(/M 53/)
  })

  it('never nests groups inside non-groups', () => {
    for (const n of model.nodes) {
      if (!n.parentId) continue
      const parent = model.nodes.find((p) => p.id === n.parentId)!
      expect(findModuleType(parent.data.typeId)?.isGroup, n.id).toBe(true)
    }
  })
})

describe('propagate', () => {
  it('follows dependencies downstream with distances', () => {
    const hits = propagate(tiny(), 'a', { direction: 'downstream', types: [...ALL] })
    expect(hits.get('b')?.distance).toBe(1)
    expect(hits.get('c')?.distance).toBe(2)
    expect(hits.get('c')?.maxCriticality).toBe(4)
    expect(hits.has('it')).toBe(false)
  })

  it('models back-pressure upstream', () => {
    const hits = propagate(tiny(), 'c', { direction: 'upstream', types: ['material'] })
    expect([...hits.keys()].sort()).toEqual(['a', 'b'])
  })

  it('respects the selected dependency types', () => {
    const hits = propagate(tiny(), 'it', { direction: 'downstream', types: ['material'] })
    expect(hits.size).toBe(0)
    const withInfo = propagate(tiny(), 'it', { direction: 'downstream', types: ['information', 'material'] })
    expect([...withInfo.keys()].sort()).toEqual(['b', 'c'])
  })

  it('terminates on cycles (Leergut loop in the Magna model)', () => {
    const model = createMagnaModel()
    const hits = propagate(model, 'p-we', { direction: 'downstream', types: ['material'] })
    expect(hits.get('x-oem')).toBeDefined()
    expect(hits.has('p-we')).toBe(false)
  })

  it('scores impact by distance and criticality', () => {
    const a = impactOf(tiny(), 'a', [...ALL])
    expect(a.total).toBe(2)
    expect(a.score).toBeCloseTo(2 / 1 + 4 / 2)
    expect(impactOf(tiny(), 'c', [...ALL]).total).toBe(0)
    const ranking = impactRanking(createMagnaModel(), [...ALL])
    expect(ranking[0].score).toBeGreaterThan(ranking[ranking.length - 1].score)
  })
})

describe('readiness', () => {
  it('reports missing inputs for the simulation module', () => {
    const model = createMagnaModel()
    const index = buildIndex(model)
    const r = readinessFor('p-lack', 'drz-simulation', index)
    expect(r.applicable).toBe(true)
    expect(r.missing).toContain('Bearbeitungszeit')
    expect(readinessFor('p-montage', 'drz-simulation', index).missing).toEqual(['Kapazität'])
    const lack = model.nodes.find((n) => n.id === 'p-lack')!
    lack.data.properties = { simZeit: 240, simKapazitaet: 2 }
    expect(readinessFor('p-lack', 'drz-simulation', buildIndex(model)).missing).toEqual([])
  })

  it('accepts the diary study as trigger for interventions on teams', () => {
    const index = buildIndex(createMagnaModel())
    expect(readinessFor('t-montage', 'drz-intervention', index).missing).toEqual([])
  })

  it('requires a connected data source for early warning', () => {
    const index = buildIndex(createMagnaModel())
    expect(readinessFor('p-lack', 'drz-fruehwarnung', index).missing).toEqual([])
    expect(readinessFor('p-jis', 'drz-fruehwarnung', index).missing).toContain('verbundene Datenquelle')
  })

  it('protects anonymity with a minimum team size', () => {
    const model = createMagnaModel()
    const team = model.nodes.find((n) => n.id === 't-sg')!
    team.data.properties.teamgroesse = 3
    expect(readinessFor('t-sg', 'drz-tagebuch', buildIndex(model)).missing[0]).toMatch(/mindestens/)
    team.data.properties.teamgroesse = 12
    expect(readinessFor('t-sg', 'drz-tagebuch', buildIndex(model)).missing).toEqual([])
  })

  it('summarises all assignments', () => {
    const s = readinessSummary(createMagnaModel())
    expect(s.assignments).toBeGreaterThan(20)
    expect(s.ready).toBeLessThan(s.assignments)
    expect(s.mismatched).toBe(0)
  })
})

describe('JSON-LD', () => {
  it('round-trips the Magna model', () => {
    const model = createMagnaModel()
    const doc = toJsonLd(model)
    expect(doc['@context']).toBeDefined()
    const back = fromJsonLd(JSON.parse(JSON.stringify(doc)))
    expect(back.organization).toEqual(model.organization)
    expect(back.nodes).toHaveLength(model.nodes.length)
    expect(back.edges).toHaveLength(model.edges.length)
    const lack = back.nodes.find((n) => n.id === 'p-lack')!
    expect(lack.parentId).toBe('halle-lack')
    expect(lack.data.groessen).toEqual(model.nodes.find((n) => n.id === 'p-lack')!.data.groessen)
    expect(lack.data.drz).toEqual(['drz-simulation', 'drz-fruehwarnung', 'drz-ki'])
    const bidi = back.edges.find((e) => e.data.bidirectional)!
    expect(bidi.data.messages).toContain('Meldung iO/niO')
  })

  it('migrates 0.1.0 models: removes the former takt module (TBS = Tagebuchstudie)', () => {
    const model = createMagnaModel()
    model.schemaVersion = '0.1.0'
    model.nodes.push({
      id: 'drz-takt',
      parentId: 'ebene-drz',
      layout: { x: 0, y: 0 },
      data: { typeId: 'drz', label: 'TBS-Modul', properties: { drzKind: 'takt' }, groessen: [], drz: [] },
    })
    model.nodes.find((n) => n.id === 'p-montage')!.data.drz.push('drz-takt')
    const back = fromJsonLd(JSON.parse(JSON.stringify(toJsonLd(model))))
    expect(back.schemaVersion).toBe(SCHEMA_VERSION)
    expect(back.nodes.some((n) => n.id === 'drz-takt')).toBe(false)
    expect(back.nodes.find((n) => n.id === 'p-montage')!.data.drz).not.toContain('drz-takt')
    expect(migrate(back)).toBe(back)
  })

  it('migrates 0.2.0 models: simulation times from minutes to seconds', () => {
    const model = createMagnaModel()
    model.schemaVersion = '0.2.0'
    model.nodes.find((n) => n.id === 'p-lack')!.data.properties.simZeit = 4
    const back = fromJsonLd(JSON.parse(JSON.stringify(toJsonLd(model))))
    expect(back.nodes.find((n) => n.id === 'p-lack')!.data.properties.simZeit).toBe(240)
    // The current seed is already in seconds and must not be converted again.
    const current = fromJsonLd(JSON.parse(JSON.stringify(toJsonLd(createMagnaModel()))))
    expect(current.nodes.find((n) => n.id === 'p-montage')!.data.properties.simZeit).toBe(90)
  })

  it('keeps collapsed groups and their expanded size', () => {
    const model = createMagnaModel()
    const back = fromJsonLd(JSON.parse(JSON.stringify(toJsonLd(model))))
    const front = back.nodes.find((n) => n.id === 'linie-front')!
    expect(front.layout.collapsed).toBe(true)
    expect(front.layout.height).toBeGreaterThan(200)
    const flow = modelToFlow(back)
    const hidden = collapsedDescendants(flow.nodes)
    expect(hidden.has('st-252')).toBe(true)
    expect(hidden.has('p-lack')).toBe(false)
    const again = flowToModel(back.organization, back.schemaVersion, flow.nodes, flow.edges)
    expect(again.nodes.find((n) => n.id === 'linie-front')!.layout).toEqual(front.layout)
  })

  it('rejects documents without a graph', () => {
    expect(() => fromJsonLd({ foo: 1 })).toThrow(/@graph/)
    expect(() => fromJsonLd({ '@graph': [] })).toThrow(/Organisation/)
  })
})

describe('layout', () => {
  it('places every node and sizes groups', async () => {
    const model = tiny()
    const positions = await computeLayout(
      model.nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        isGroup: findModuleType(n.data.typeId)?.isGroup === true,
        width: 210,
        height: 70,
      })),
      model.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, typeId: e.data.typeId })),
    )
    expect(positions.size).toBe(model.nodes.length)
    expect(positions.get('hall')?.width).toBeGreaterThan(200)
  })

  it('handles the full Magna model', async () => {
    const model = createMagnaModel()
    const positions = await computeLayout(
      model.nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId,
        isGroup: findModuleType(n.data.typeId)?.isGroup === true,
        width: 210,
        height: 70,
      })),
      model.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, typeId: e.data.typeId })),
    )
    expect(positions.size).toBe(model.nodes.length)
  })
})

describe('descendantsOf', () => {
  it('collects nested children', () => {
    const nodes = [{ id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }, { id: 'd' }]
    expect([...descendantsOf(nodes, 'a')].sort()).toEqual(['b', 'c'])
  })
})
