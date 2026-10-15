import { describe, expect, it } from 'vitest'
import { nodesInRegion, rectFrom } from './region'

describe('region', () => {
  it('normalises the drawn rectangle', () => {
    expect(rectFrom({ x: 50, y: 40 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 40, w: 40, h: 60 })
  })
  it('keeps nodes that overlap the section', () => {
    const nodes = [
      { id: 'in', rect: { x: 10, y: 10, w: 20, h: 20 } },
      { id: 'edge', rect: { x: 90, y: 90, w: 50, h: 50 } },
      { id: 'out', rect: { x: 200, y: 0, w: 20, h: 20 } },
    ]
    expect([...nodesInRegion(nodes, { x: 0, y: 0, w: 100, h: 100 })]).toEqual(['in', 'edge'])
  })
})
