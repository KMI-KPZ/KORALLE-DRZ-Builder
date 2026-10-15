import { BaseEdge, EdgeLabelRenderer, useInternalNode, type Edge, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { getDependencyType } from '../../model/catalog'
import type { DependencyTypeId } from '../../model/types'
import { dominantType } from './aggregate'
import { floatingGeometry } from './geometry'

/** Overview: all dependencies between two groups (or a group and a module) as one line. */
export interface AggregateData extends Record<string, unknown> {
  count: number
  byType: Partial<Record<DependencyTypeId, number>>
  /** Directions present: a→b, b→a. */
  forward: boolean
  backward: boolean
  maxCriticality: number
  dimmed?: boolean
}

export type AggregateFlowEdge = Edge<AggregateData, 'aggregate'>

function AggregateEdgeView({ id, source, target, data, markerEnd, markerStart }: EdgeProps<AggregateFlowEdge>) {
  const s = useInternalNode(source)
  const t = useInternalNode(target)
  if (!s || !t || !data) return null
  const { path, labelX, labelY } = floatingGeometry(s, t, 0)
  const type = getDependencyType(dominantType(data.byType))
  const width = Math.min(14, 2.5 + Math.log2(data.count) * 2.4)
  const parts = (Object.entries(data.byType) as [DependencyTypeId, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k, c]) => `${c} ${getDependencyType(k).shortLabel}`)
  const title = `${data.count} Abhängigkeit${data.count === 1 ? '' : 'en'}: ${parts.join(', ')}`

  return (
    <g className={`agg-edge${data.dimmed ? ' is-dimmed' : ''}`}>
      <title>{title}</title>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={22}
        style={{
          stroke: `var(${type.colorVar})`,
          strokeWidth: width,
          strokeOpacity: data.dimmed ? 0.1 : 0.55,
          strokeLinecap: 'round',
        }}
      />
      {data.count > 1 && (
      <EdgeLabelRenderer>
        <div
          className="agg-label nodrag nopan"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            opacity: data.dimmed ? 0.25 : 1,
            ['--c' as string]: `var(${type.colorVar})`,
          }}
          title={title}
        >
          {data.count}
        </div>
      </EdgeLabelRenderer>
      )}
    </g>
  )
}

export const AggregateEdge = memo(AggregateEdgeView)
