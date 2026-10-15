import { describe, expect, it } from 'vitest'
import { condensedKey, representativeOf } from '../overview'
import { aggregate, type EdgeLike } from './aggregate'

const nodes = [
  { id: 'hall', data: { typeId: 'halle' } },
  { id: 'line', parentId: 'hall', data: { typeId: 'linie' } },
  { id: 'st1', parentId: 'line', data: { typeId: 'station' } },
  { id: 'p1', parentId: 'hall', data: { typeId: 'prozess' } },
  { id: 'it', data: { typeId: 'ebene' } },
  { id: 'erp', parentId: 'it', data: { typeId: 'it' } },
  { id: 'oem', data: { typeId: 'extern' } },
]
const byId = new Map<string, (typeof nodes)[number] & { collapsed?: boolean }>(nodes.map((n) => [n.id, n]))
const e = (id: string, source: string, target: string, typeId: NonNullable<EdgeLike['data']>['typeId']): EdgeLike => ({
  id,
  source,
  target,
  data: { typeId, criticality: 2 },
})
const edges = [
  e('a', 'st1', 'p1', 'material'), // inside the hall
  e('b', 'p1', 'oem', 'material'),
  e('c', 'st1', 'oem', 'material'),
  e('d', 'oem', 'p1', 'control'),
  e('f', 'erp', 'p1', 'information'),
]
const repWith = (condensed: string[]) => (id: string) => representativeOf(id, byId, new Set(condensed))

describe('representativeOf', () => {
  it('returns the outermost condensed or collapsed group', () => {
    expect(representativeOf('st1', byId, new Set(['hall']))).toBe('hall')
    expect(representativeOf('st1', byId, new Set())).toBe('st1')
    expect(representativeOf('hall', byId, new Set(['hall']))).toBe('hall')
    const collapsed = new Map(byId)
    collapsed.set('line', { ...byId.get('line')!, collapsed: true })
    expect(representativeOf('st1', collapsed, new Set())).toBe('line')
    expect(representativeOf('st1', collapsed, new Set(['hall']))).toBe('hall')
  })
})

describe('aggregate', () => {
  it('bundles per pair of condensed groups and skips information flows', () => {
    const { bundles, direct } = aggregate(edges, nodes, repWith(['hall', 'it']), {}, false, null)
    expect(direct.map((x) => x.id)).toEqual([])
    expect(bundles).toHaveLength(1)
    const [agg] = bundles
    expect([agg.source, agg.target].sort()).toEqual(['hall', 'oem'])
    expect(agg.data).toMatchObject({ count: 3, byType: { material: 2, control: 1 }, forward: true, backward: true })
    expect(agg.markerEnd).toBeDefined()
    expect(agg.markerStart).toBeDefined()
  })

  it('keeps edges of an open group single and bundles towards a condensed one', () => {
    const { bundles, direct } = aggregate(edges, nodes, repWith(['it']), {}, true, null)
    expect(direct.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(bundles.map((b) => `${b.source}|${b.target}`)).toEqual(['it|p1'])
  })

  it('dims bundles off the analysis path', () => {
    const { bundles } = aggregate(edges, nodes, repWith(['hall', 'it']), {}, true, new Set(['erp', 'p1']))
    const byPair = Object.fromEntries(bundles.map((a) => [[a.source, a.target].sort().join('|'), a.data!.dimmed]))
    expect(byPair['hall|it']).toBe(false)
    expect(byPair['hall|oem']).toBe(true)
  })
})

describe('condensedKey', () => {
  const groups = [
    { id: 'center', pinned: false, rect: { x: 400, y: 300, w: 200, h: 200 } },
    { id: 'edge', pinned: false, rect: { x: 0, y: 0, w: 120, h: 100 } },
    { id: 'away', pinned: false, rect: { x: 3000, y: 0, w: 200, h: 200 } },
  ]
  const view = { x: 0, y: 0, w: 1000, h: 800 }

  it('condenses everything when zoomed out', () => {
    expect(condensedKey(groups, view, 0.4, new Set())).toBe('away|center|edge')
  })

  it('opens only groups in the middle of the screen', () => {
    expect(condensedKey(groups, view, 1, new Set(['center', 'edge', 'away']))).toBe('away|edge')
  })

  it('keeps an open group open near the border (hysteresis)', () => {
    expect(condensedKey(groups, view, 1, new Set())).toBe('away')
  })

  it('opens the group of the selected module', () => {
    const pinned = groups.map((g) => (g.id === 'away' ? { ...g, pinned: true } : g))
    expect(condensedKey(pinned, view, 1, new Set(['away', 'edge']))).toBe('edge')
  })
})
